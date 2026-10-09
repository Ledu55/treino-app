// Modo personal (item 12): o que depende da internet. O personal lê e edita os dados dos alunos
// direto no Firestore (eles não ficam no celular do personal); o aluno grava o vínculo no próprio
// documento. As regras que não dependem da rede ficam em personal.js; quem pode o quê, em
// firestore.rules.
import { cloudApi, syncNow } from './cloud.js';
import { reportError } from './monitoring.js';
import { INVITE_DAYS, newInviteCode } from './personal.js';
import { getState, newPlan, setTrainerLinks } from './store.js';
import { sortHistory } from './sync.js';

const DAY_MS = 24 * 60 * 60 * 1000;

class OfflineError extends Error {
    constructor() {
        super('Sem internet');
        this.code = 'unavailable';
    }
}

// SDK, banco e uid de quem está logado; sem login ou sem internet, falha na hora (as leituras do
// Firestore sem internet demoram para desistir, e as gravações ficam esperando)
function api() {
    const handles = cloudApi();
    if (!handles) throw new Error('Sem login');
    if (!navigator.onLine) throw new OfflineError();
    return handles;
}

// 'offline' | 'denied' (sem acesso, ou o código não existe/venceu) | 'error'
export function failureKind(err) {
    if (err && (err.code === 'unavailable' || !navigator.onLine)) return 'offline';
    if (err && err.code === 'permission-denied') return 'denied';
    return 'error';
}

function report(err, context) {
    console.warn(`Falha no modo personal (${context}):`, err);
    if (failureKind(err) === 'error') reportError(err, 'personal-' + context);
}

// ---------- Aluno ----------

// Convite pelo código: { code, trainerUid, trainerNome, own }, ou null se não existe ou venceu
export async function findInvite(code) {
    const { sdk, db, uid } = api();
    let snap;
    try {
        snap = await sdk.getDoc(sdk.doc(db, 'invites', code));
    } catch (err) {
        // As regras negam a leitura de um convite que não existe ou venceu
        if (err.code === 'permission-denied') return null;
        report(err, 'find-invite');
        throw err;
    }
    if (!snap.exists() || snap.data().expiresAt.toMillis() < Date.now()) return null;
    const { trainerUid, trainerNome } = snap.data();
    return { code, trainerUid, trainerNome, own: trainerUid === uid };
}

// Dá acesso ao personal do convite: grava o vínculo no documento do aluno
export async function acceptInvite(invite) {
    const { sdk, db, uid } = api();
    try {
        await sdk.setDoc(sdk.doc(db, 'users', uid), {
            trainers: { [invite.trainerUid]: true },
            trainerNames: { [invite.trainerUid]: invite.trainerNome }
        }, { merge: true });
    } catch (err) {
        report(err, 'accept-invite');
        throw err;
    }
    const { trainers = {}, trainerNames = {} } = getState().profile;
    setTrainerLinks({ ...trainers, [invite.trainerUid]: true }, { ...trainerNames, [invite.trainerUid]: invite.trainerNome });
    syncNow();
}

function without(map = {}, key) {
    return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
}

// Tira o acesso do personal; as fichas que ele montou passam a ser do aluno
export async function removeTrainer(trainerUid) {
    const { sdk, db, uid } = api();
    try {
        await sdk.updateDoc(sdk.doc(db, 'users', uid), {
            [`trainers.${trainerUid}`]: sdk.deleteField(),
            [`trainerNames.${trainerUid}`]: sdk.deleteField()
        });
    } catch (err) {
        report(err, 'remove-trainer');
        throw err;
    }
    const { trainers, trainerNames } = getState().profile;
    setTrainerLinks(without(trainers, trainerUid), without(trainerNames, trainerUid));
    syncNow();
}

// ---------- Personal ----------

// invites: [{ code, expiresAt }] ainda válidos; students: [{ uid, nome, lastSessionAt }];
// student: o aluno aberto ({ uid, profile, plans, history, loading, error });
// saving: gravações de fichas ainda sem confirmação do servidor
const trainer = {
    invites: null, students: null, loading: false, error: null,
    student: null, saving: 0, saveError: false
};
const listeners = new Set();

export function getTrainerState() {
    return trainer;
}

export function subscribeTrainer(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit() {
    listeners.forEach((listener) => listener());
}

// Convites ainda válidos e a lista de alunos (quem deu acesso a este personal)
export async function loadStudents() {
    trainer.loading = true;
    trainer.error = null;
    emit();
    try {
        const { sdk, db, uid } = api();
        const [invites, students] = await Promise.all([
            sdk.getDocs(sdk.query(sdk.collection(db, 'invites'), sdk.where('trainerUid', '==', uid))),
            sdk.getDocs(sdk.query(sdk.collection(db, 'users'), sdk.where(`trainers.${uid}`, '==', true)))
        ]);
        const now = Date.now();
        trainer.invites = [];
        invites.forEach((snap) => {
            const expiresAt = snap.data().expiresAt.toMillis();
            // Convite vencido não serve para mais nada: apaga
            if (expiresAt > now) trainer.invites.push({ code: snap.id, expiresAt });
            else sdk.deleteDoc(snap.ref).catch(() => {});
        });
        trainer.invites.sort((a, b) => b.expiresAt - a.expiresAt);
        trainer.students = students.docs
            .filter((snap) => snap.id !== uid)
            .map((snap) => ({ uid: snap.id, nome: snap.data().nome || 'Aluno', lastSessionAt: snap.data().lastSessionAt || null }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    } catch (err) {
        report(err, 'students');
        trainer.error = failureKind(err);
    } finally {
        trainer.loading = false;
        emit();
    }
}

// Gera um código de convite com validade; devolve o código
export async function createInvite() {
    const { sdk, db, uid } = api();
    const expiresAt = Date.now() + INVITE_DAYS * DAY_MS;
    const data = {
        trainerUid: uid,
        trainerNome: (getState().profile.nome || 'Personal').slice(0, 80),
        expiresAt: sdk.Timestamp.fromMillis(expiresAt),
        createdAt: sdk.serverTimestamp()
    };
    for (let attempt = 1; ; attempt++) {
        const code = newInviteCode();
        try {
            await sdk.setDoc(sdk.doc(db, 'invites', code), data);
            trainer.invites = [{ code, expiresAt }, ...(trainer.invites || [])];
            emit();
            return code;
        } catch (err) {
            // Código já usado por outro personal (as regras não deixam sobrescrever): tenta outro
            if (err.code === 'permission-denied' && attempt < 3) continue;
            report(err, 'create-invite');
            throw err;
        }
    }
}

export async function cancelInvite(code) {
    const { sdk, db } = api();
    try {
        await sdk.deleteDoc(sdk.doc(db, 'invites', code));
    } catch (err) {
        report(err, 'cancel-invite');
        throw err;
    }
    trainer.invites = (trainer.invites || []).filter((invite) => invite.code !== code);
    emit();
}

// Sai da lista do aluno (o aluno deixa de aparecer, e o personal perde o acesso)
export async function removeStudent(studentUid) {
    const { sdk, db, uid } = api();
    try {
        await sdk.updateDoc(sdk.doc(db, 'users', studentUid), {
            [`trainers.${uid}`]: sdk.deleteField(),
            [`trainerNames.${uid}`]: sdk.deleteField()
        });
    } catch (err) {
        report(err, 'remove-student');
        throw err;
    }
    trainer.students = (trainer.students || []).filter((s) => s.uid !== studentUid);
    if (trainer.student && trainer.student.uid === studentUid) trainer.student = null;
    emit();
}

// Lê o perfil, as fichas e o histórico do aluno (de novo a cada vez que a tela do aluno abre)
export async function openStudent(studentUid) {
    let student = trainer.student;
    if (!student || student.uid !== studentUid) {
        student = { uid: studentUid, profile: null, plans: {}, history: [], loading: true, error: null };
        trainer.student = student;
    }
    student.loading = true;
    student.error = null;
    emit();
    try {
        const { sdk, db } = api();
        const userRef = sdk.doc(db, 'users', studentUid);
        const [root, plans, sessions] = await Promise.all([
            sdk.getDoc(userRef),
            sdk.getDocs(sdk.collection(userRef, 'plans')),
            sdk.getDocs(sdk.collection(userRef, 'sessions'))
        ]);
        if (!root.exists()) throw Object.assign(new Error('Aluno não existe mais'), { code: 'permission-denied' });
        const data = root.data();
        student.profile = { nome: data.nome || 'Aluno', activePlanId: data.activePlanId || null, lastSessionAt: data.lastSessionAt || null };
        const read = (snap) => {
            const { syncedAt, ...rest } = snap.data();
            return { ...rest, id: snap.id };
        };
        student.plans = {};
        plans.forEach((snap) => {
            const plan = read(snap);
            if (!plan.deleted) student.plans[plan.id] = plan;
        });
        student.history = sortHistory(sessions.docs.map(read).filter((entry) => !entry.deleted));
    } catch (err) {
        report(err, 'open-student');
        student.error = failureKind(err);
    } finally {
        student.loading = false;
        emit();
    }
}

// Grava a ficha no aluno em nome do personal. Aparece na hora na tela; o servidor confirma depois
// (sem internet, o Firestore guarda a gravação enquanto o app estiver aberto e envia quando voltar).
function saveStudentPlan(plan) {
    const { sdk, db, uid } = cloudApi();
    const student = trainer.student;
    Object.assign(plan, { createdBy: uid, updatedBy: uid, updatedAt: Date.now() });
    student.plans[plan.id] = plan;
    trainer.saving += 1;
    trainer.saveError = false;
    emit();
    sdk.setDoc(sdk.doc(db, 'users', student.uid, 'plans', plan.id), { ...plan, syncedAt: sdk.serverTimestamp() })
        .catch((err) => {
            report(err, 'save-plan');
            trainer.saveError = failureKind(err);
        })
        .finally(() => {
            trainer.saving -= 1;
            emit();
        });
}

// Ficha nova para o aluno: de um modelo, em branco ou cópia de uma ficha dele; devolve o id
export function createStudentPlan({ templateId, source }) {
    const plan = newPlan({ templateId, source, by: cloudApi().uid });
    saveStudentPlan(plan);
    return plan.id;
}

// Altera uma ficha montada por este personal: change(draft), como em store.js → updatePlan
export function changeStudentPlan(planId, change) {
    const draft = structuredClone(trainer.student.plans[planId]);
    change(draft);
    saveStudentPlan(draft);
}
