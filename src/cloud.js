// Backup na nuvem (Firebase): login Google e sincronização com o Firestore. O celular é a fonte
// principal; sem login ou sem internet o app funciona igual. Formato na nuvem (v2):
//
//   users/{uid}                 perfil (nome, titulo, activePlanId, lastSessionAt, profileUpdatedAt),
//                               schema e, depois da migração, previousPayload/previousSchema (backup v1)
//   users/{uid}/plans/{id}      fichas (deleted: true quando apagada)
//   users/{uid}/sessions/{id}   treinos finalizados (só { deleted: true } quando apagado)
//   users/{uid}/state/current   últimos valores digitados: { values: { 'treino|exercício': ... } }
//
// Cada documento leva syncedAt (hora do servidor), e cada sincronização só busca o que mudou desde
// a anterior. A mesclagem fica em sync.js.
import {
    getState, localSnapshot, markAllDirty, onDataChange, replaceData, saveCloudMeta
} from './store.js';
import { NewerSchemaError, SCHEMA_VERSION, migrate } from './migrations.js';
import { reportError } from './monitoring.js';
import { mergeData, stableStringify } from './sync.js';
import { debounce } from './util.js';

// Um projeto Firebase por ambiente. O objeto firebaseConfig vem do Console do Firebase →
// Configurações do projeto → Seus apps. Ambiente sem configuração: a seção de backup fica
// escondida e o app funciona só com os dados do celular.
export const FIREBASE_CONFIGS = {
    prod: {
        apiKey: "AIzaSyB_tGeQxXB0SUGIlVCOHKDbAQpZfUSuRac",
        authDomain: "treino-app-21fcd.firebaseapp.com",
        projectId: "treino-app-21fcd",
        storageBucket: "treino-app-21fcd.firebasestorage.app",
        messagingSenderId: "1012262948925",
        appId: "1:1012262948925:web:e0ae7e5cd4b4e270631a54"
    },
    // Projeto de desenvolvimento (treino-app-dev-306d2). Se for null, localhost usa o emulador.
    dev: {
        apiKey: "AIzaSyAdGCccw1ml7vlC7Dj5-eZNVB3zvDCEva8",
        authDomain: "treino-app-dev-306d2.firebaseapp.com",
        projectId: "treino-app-dev-306d2",
        storageBucket: "treino-app-dev-306d2.firebasestorage.app",
        messagingSenderId: "642701751250",
        appId: "1:642701751250:web:8338a3a5e93efb94eb8e0b"
    },
    // Firebase Emulator (npm run emulators). Projetos "demo-" nunca acessam a nuvem.
    emulator: {
        apiKey: "demo-api-key",
        authDomain: "demo-treino.firebaseapp.com",
        projectId: "demo-treino"
    }
};
const EMULATOR_HOSTS = { auth: 'http://localhost:9099', firestore: ['localhost', 8080] };
// Gravações por lote (o limite do Firestore é 500)
const BATCH_SIZE = 400;
// Coleções dentro de users/{uid}, apagadas ao excluir a conta (uma coleção nova precisa entrar aqui)
const USER_COLLECTIONS = ['plans', 'sessions', 'state'];
// O Firebase só exclui uma conta com login feito há menos de 5 minutos
const RECENT_LOGIN_MS = 4 * 60 * 1000;

// localhost usa o projeto de dev (ou o emulador, com ?emulator na URL ou sem projeto de dev);
// só o endereço publicado usa a produção; qualquer outro endereço fica sem nuvem.
export function pickFirebaseEnv(loc) {
    if (loc.hostname === 'ledu55.github.io') return 'prod';
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
        const wantsEmulator = new URLSearchParams(loc.search).has('emulator');
        return wantsEmulator || !FIREBASE_CONFIGS.dev ? 'emulator' : 'dev';
    }
    return null;
}

// Versão do formato do backup; documentos antigos sem o campo são da versão 1
function remoteSchema(root) {
    return root ? root.schema || 1 : SCHEMA_VERSION;
}

// Backup da v1 (um documento só, com tudo em payload) já no formato desta versão do app
export function migrateRemote(root, options) {
    return migrate(JSON.parse(root.payload), remoteSchema(root), options);
}

// Perfil gravado no documento do usuário (null se a pessoa ainda não terminou o primeiro acesso)
export function rootToProfile(root) {
    if (!root || root.profileUpdatedAt === undefined) return null;
    const profile = {
        nome: root.nome || '',
        titulo: root.titulo || '',
        activePlanId: root.activePlanId || null,
        lastSessionAt: root.lastSessionAt || null,
        updatedAt: root.profileUpdatedAt
    };
    if (root.trainers) profile.trainers = root.trainers;
    return profile;
}

export function hasPendingChanges(meta) {
    const dirty = (meta && meta.dirty) || {};
    return !!dirty.profile || ['plans', 'history', 'values'].some((k) => dirty[k] && Object.keys(dirty[k]).length > 0);
}

// ---------- Sincronização ----------

// Estado mostrado na seção de backup (ui/CloudSection.jsx) e no primeiro acesso
// newerData: o backup na nuvem é de uma versão mais nova do app (não é lido nem gravado)
// accountDeleted: a conta foi excluída em outro aparelho, e o backup parou neste
const cloud = {
    env: null, ready: false, loadFailed: false, user: null, syncing: false, error: false, newerData: false,
    accountDeleted: false
};
let sdk = null;
let auth = null;
let db = null;
let pending = false;
// Excluindo a conta: nada mais é sincronizado
let deleting = false;

// O documento do usuário sumiu depois de já ter sido sincronizado: a conta foi excluída
class AccountDeletedError extends Error {}
const listeners = new Set();
const scheduleSync = debounce(() => syncCloud(), 2000);

export function getCloudState() {
    return cloud;
}

export function subscribeCloud(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit() {
    listeners.forEach((listener) => listener());
}

function isAfter(a, b) {
    return !b || a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
}

// Lê da nuvem o perfil, o que mudou desde `since` e os últimos valores
async function pull(uid, since) {
    const userRef = sdk.doc(db, 'users', uid);
    const rootSnap = await sdk.getDoc(userRef);
    const root = rootSnap.exists() ? rootSnap.data() : null;
    // Toda sincronização grava o documento do usuário; se ele não existe mais, foi apagado de propósito
    if (!root && since) throw new AccountDeletedError();
    if (remoteSchema(root) > SCHEMA_VERSION) throw new NewerSchemaError(remoteSchema(root));

    const changedSince = (name) => {
        const ref = sdk.collection(userRef, name);
        return sdk.getDocs(since
            ? sdk.query(ref, sdk.where('syncedAt', '>', new sdk.Timestamp(since.seconds, since.nanoseconds)))
            : ref);
    };
    const [plansSnap, sessionsSnap, stateSnap] = await Promise.all([
        changedSince('plans'),
        changedSince('sessions'),
        sdk.getDoc(sdk.doc(userRef, 'state', 'current'))
    ]);

    let pulledAt = since;
    const read = (snap) => {
        const { syncedAt, ...data } = snap.data();
        if (syncedAt && isAfter(syncedAt, pulledAt)) pulledAt = { seconds: syncedAt.seconds, nanoseconds: syncedAt.nanoseconds };
        return { ...data, id: snap.id };
    };
    const remote = { profile: rootToProfile(root), plans: {}, history: [], deletedIds: [], lastValues: {} };
    plansSnap.forEach((snap) => { remote.plans[snap.id] = read(snap); });
    sessionsSnap.forEach((snap) => {
        const entry = read(snap);
        if (entry.deleted) remote.deletedIds.push(entry.id);
        else remote.history.push(entry);
    });
    if (stateSnap.exists()) remote.lastValues = stateSnap.data().values || {};

    // Backup antigo (v1) ainda não migrado; também quando um celular com o app antigo o regravou
    const legacy = root && root.payload && remoteSchema(root) < SCHEMA_VERSION ? migrateRemote(root) : null;
    return { root, remote, legacy, pulledAt };
}

// Envia o que está em `dirty`, em lotes; o documento do usuário vai por último
async function push(uid, dirty, root, legacy) {
    const { profile, plans, history, deletedIds, lastValues } = getState();
    const userRef = sdk.doc(db, 'users', uid);
    const syncedAt = sdk.serverTimestamp();
    const writes = [];

    for (const id of Object.keys(dirty.plans || {})) {
        if (plans[id]) writes.push([sdk.doc(userRef, 'plans', id), { ...plans[id], syncedAt }]);
    }
    const deleted = new Set(deletedIds);
    const byId = new Map(history.map((entry) => [entry.id, entry]));
    for (const id of Object.keys(dirty.history || {})) {
        const ref = sdk.doc(userRef, 'sessions', id);
        if (deleted.has(id)) writes.push([ref, { deleted: true, updatedAt: Date.now(), syncedAt }]);
        else if (byId.has(id)) writes.push([ref, { ...byId.get(id), syncedAt }]);
    }
    const valueKeys = Object.keys(dirty.values || {}).filter((k) => lastValues[k]);
    if (valueKeys.length) {
        // merge: só os exercícios alterados, sem apagar os que outro celular gravou
        const values = Object.fromEntries(valueKeys.map((k) => [k, lastValues[k]]));
        writes.push([sdk.doc(userRef, 'state', 'current'), { values, syncedAt }, { merge: true }]);
    }

    const rootUpdate = {};
    if (dirty.profile && profile) {
        Object.assign(rootUpdate, {
            nome: profile.nome,
            titulo: profile.titulo,
            activePlanId: profile.activePlanId,
            lastSessionAt: profile.lastSessionAt,
            profileUpdatedAt: profile.updatedAt
        });
    }
    if (legacy) {
        // Cópia do backup v1, para poder desfazer (fica até a próxima migração)
        Object.assign(rootUpdate, { previousPayload: root.payload, previousSchema: remoteSchema(root), payload: sdk.deleteField() });
    }
    if (Object.keys(rootUpdate).length || remoteSchema(root) !== SCHEMA_VERSION || !root) {
        writes.push([userRef, { ...rootUpdate, schema: SCHEMA_VERSION, updatedAt: syncedAt }, { merge: true }]);
    }

    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
        const batch = sdk.writeBatch(db);
        writes.slice(i, i + BATCH_SIZE).forEach(([ref, data, options]) => batch.set(ref, data, options || {}));
        await batch.commit();
    }
}

// Tira de dirty o que foi enviado e não mudou de novo enquanto isso
function clearDirty(meta, sent) {
    if (!meta.dirty) return;
    if (sent.profile && meta.dirty.profile === sent.profile) delete meta.dirty.profile;
    for (const kind of ['plans', 'history', 'values']) {
        for (const [id, seq] of Object.entries(sent[kind] || {})) {
            if (meta.dirty[kind] && meta.dirty[kind][id] === seq) delete meta.dirty[kind][id];
        }
    }
}

function applyCloudData(data) {
    const before = localSnapshot();
    const changed = ['profile', 'plans', 'history', 'lastValues']
        .some((k) => stableStringify(before[k]) !== stableStringify(data[k]));
    replaceData(data, changed);
}

async function syncCloud() {
    if (!cloud.user || deleting) return;
    if (cloud.syncing) { pending = true; return; }
    if (!navigator.onLine) { emit(); return; }

    const uid = cloud.user.uid;
    const meta = getState().cloudMeta;
    cloud.syncing = true;
    emit();

    try {
        // Outra conta (ou a primeira sincronização depois da migração): busca tudo e envia tudo
        if (meta.uid !== uid) {
            meta.uid = uid;
            meta.pulledAt = null;
            markAllDirty();
        }
        const { root, remote, legacy, pulledAt } = await pull(uid, meta.pulledAt);
        let merged = mergeData(localSnapshot(), remote);
        if (legacy) merged = mergeData(merged, legacy);
        applyCloudData(merged);
        if (legacy) markAllDirty();

        const sent = structuredClone(meta.dirty || {});
        await push(uid, sent, root, legacy);
        clearDirty(meta, sent);
        meta.pulledAt = pulledAt;
        meta.lastSyncAt = Date.now();
        saveCloudMeta();
        cloud.error = false;
        cloud.newerData = false;
    } catch (err) {
        if (err instanceof NewerSchemaError) {
            // Backup feito por uma versão mais nova do app: não mexe nele até este app atualizar
            cloud.newerData = true;
        } else if (err instanceof AccountDeletedError) {
            // Conta excluída em outro aparelho: sai da conta sem reenviar nada e sem apagar o que
            // está no celular. Se a pessoa entrar de novo, o backup recomeça do zero.
            meta.uid = null;
            meta.pulledAt = null;
            saveCloudMeta();
            cloud.accountDeleted = true;
            sdk.signOut(auth);
        } else {
            console.warn('Falha no backup:', err);
            // Sem internet não é defeito do app
            if (navigator.onLine && err.code !== 'unavailable') reportError(err, 'sync');
            cloud.error = true;
            setTimeout(() => { if (hasPendingChanges(getState().cloudMeta)) syncCloud(); }, 60000);
        }
    } finally {
        cloud.syncing = false;
        emit();
        if (pending) {
            pending = false;
            scheduleSync();
        }
    }
}

async function loadSdk(config) {
    if (sdk) return;
    const mod = await import('./firebase-sdk.js');
    const app = mod.initializeApp(config);
    auth = mod.getAuth(app);
    db = mod.initializeFirestore(app, { ignoreUndefinedProperties: true });
    if (cloud.env === 'emulator') {
        mod.connectAuthEmulator(auth, EMULATOR_HOSTS.auth, { disableWarnings: true });
        mod.connectFirestoreEmulator(db, ...EMULATOR_HOSTS.firestore);
        // Usado pelos testes: o emulador aceita um token Google falso no lugar do popup
        window.__emulatorSignIn = async (token) =>
            (await mod.signInWithCredential(auth, mod.GoogleAuthProvider.credential(token))).user.uid;
    }
    sdk = mod;
}

async function connect() {
    if (cloud.ready) return;
    cloud.loadFailed = false;
    emit();
    try {
        await loadSdk(FIREBASE_CONFIGS[cloud.env]);
    } catch (err) {
        cloud.loadFailed = true;
        emit();
        window.addEventListener('online', connect, { once: true });
        return;
    }
    cloud.ready = true;
    sdk.onAuthStateChanged(auth, (user) => {
        cloud.user = user;
        cloud.error = false;
        cloud.newerData = false;
        if (user) cloud.accountDeleted = false;
        emit();
        if (user) syncCloud();
    });
}

export function initCloud() {
    cloud.env = pickFirebaseEnv(location);
    if (!FIREBASE_CONFIGS[cloud.env]) return;

    onDataChange(() => {
        if (cloud.user) scheduleSync();
    });
    window.addEventListener('online', () => {
        emit();
        if (cloud.user && hasPendingChanges(getState().cloudMeta)) syncCloud();
    });
    window.addEventListener('offline', emit);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && cloud.user) syncCloud();
    });
    connect();
}

// Devolve true se o login deu certo; false se a pessoa fechou o popup
async function googlePopup(open) {
    try {
        await open(new sdk.GoogleAuthProvider());
        return true;
    } catch (err) {
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return false;
        reportError(err, 'login');
        throw err;
    }
}

export function cloudSignIn() {
    return googlePopup((provider) => sdk.signInWithPopup(auth, provider));
}

export function cloudSignOut() {
    return sdk.signOut(auth);
}

function whenIdle() {
    return new Promise((resolve) => {
        if (!cloud.syncing) return resolve();
        const stop = subscribeCloud(() => {
            if (!cloud.syncing) { stop(); resolve(); }
        });
    });
}

// Exclui a conta (LGPD): apaga todos os documentos da pessoa na nuvem e a conta do Firebase Auth.
// Devolve false se a pessoa fechou o popup de confirmação do login (nada foi apagado). Os dados do
// celular ficam para quem chama, depois que isto der certo.
export async function deleteCloudAccount() {
    deleting = true;
    let cloudDataDeleted = false;
    try {
        await whenIdle();
        const user = auth.currentUser;
        const reauthenticate = () => googlePopup((provider) => sdk.reauthenticateWithPopup(user, provider));
        // Login antigo: confirma antes de apagar qualquer coisa, para não ficar com os dados
        // apagados e a conta não
        if (Date.now() - Date.parse(user.metadata.lastSignInTime) > RECENT_LOGIN_MS && !(await reauthenticate())) {
            deleting = false;
            return false;
        }

        const userRef = sdk.doc(db, 'users', user.uid);
        const refs = [];
        for (const name of USER_COLLECTIONS) {
            (await sdk.getDocs(sdk.collection(userRef, name))).forEach((snap) => refs.push(snap.ref));
        }
        // Por último: enquanto ele existe, os outros aparelhos continuam sincronizando
        refs.push(userRef);
        for (let i = 0; i < refs.length; i += BATCH_SIZE) {
            const batch = sdk.writeBatch(db);
            refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
            await batch.commit();
        }
        cloudDataDeleted = true;

        try {
            await sdk.deleteUser(user);
        } catch (err) {
            if (err.code !== 'auth/requires-recent-login' || !(await reauthenticate())) throw err;
            await sdk.deleteUser(user);
        }
        return true;
    } catch (err) {
        // Depois de apagar os dados da nuvem, não sincroniza mais (senão o celular os enviaria de
        // novo); a pessoa pode tentar de novo para excluir a conta
        if (!cloudDataDeleted) deleting = false;
        reportError(err, 'delete-account');
        throw err;
    }
}
