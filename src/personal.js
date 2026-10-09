// Modo personal (item 12): as regras que não dependem da rede. A parte online (convites, alunos,
// fichas do aluno) fica em personal-cloud.js.
//
// O aluno autoriza um personal digitando o código de convite que o personal gerou; o vínculo fica
// no documento do aluno (trainers: { uid: true }, trainerNames: { uid: nome }), que só o aluno
// grava (o personal só pode tirar a si mesmo). Uma ficha criada pelo personal (createdBy = uid
// dele) é só leitura na estrutura para o aluno enquanto o personal tiver acesso.

// Validade do código de convite (as regras do Firestore aceitam até 8 dias)
export const INVITE_DAYS = 7;
export const INVITE_CODE_LENGTH = 6;
// Sem 0/O e 1/I, que se confundem ao ditar ou digitar
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newInviteCode() {
    const random = crypto.getRandomValues(new Uint32Array(INVITE_CODE_LENGTH));
    return Array.from(random, (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
}

// O que a pessoa digitou → código (maiúsculas, sem espaços nem traços)
export function normalizeInviteCode(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isInviteCode(code) {
    return code.length === INVITE_CODE_LENGTH && Array.from(code).every((c) => CODE_CHARS.includes(c));
}

// Personais com acesso aos dados do aluno: [{ uid, nome }]
export function linkedTrainers(profile) {
    const trainers = (profile && profile.trainers) || {};
    const names = (profile && profile.trainerNames) || {};
    return Object.keys(trainers)
        .filter((uid) => trainers[uid] === true)
        .map((uid) => ({ uid, nome: names[uid] || 'Personal' }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Personal que montou a ficha, se ele ainda tem acesso (a ficha é só leitura para o aluno);
// senão null, e a ficha é do aluno
export function planTrainer(plan, profile) {
    const by = plan && plan.createdBy;
    if (!by) return null;
    return linkedTrainers(profile).find((t) => t.uid === by) || null;
}

// "Último treino: hoje", "ontem", "há 3 dias" (para a lista de alunos)
export function lastSessionText(isoDate, now = new Date()) {
    const date = isoDate ? new Date(isoDate) : null;
    if (!date || isNaN(date)) return 'Nenhum treino ainda';
    const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((day(now) - day(date)) / 86400000);
    if (days <= 0) return 'Último treino: hoje';
    if (days === 1) return 'Último treino: ontem';
    return `Último treino: há ${days} dias`;
}
