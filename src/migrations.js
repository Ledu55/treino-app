// Versão do formato dos dados e migrações entre versões. Toda mudança no formato dos dados
// (localStorage ou nuvem) sobe SCHEMA_VERSION e ganha uma migração aqui, com teste.
//
// Uma migração recebe os dados na versão `from` e devolve os dados na versão from + 1. Os dados
// são os do celular (storage.js → DATA_NAMES) ou os da nuvem (cloud.js), que não têm o treino em
// andamento nem o estado da sincronização; a migração deve aceitar campos faltando e devolver
// sem mudança o que não conhece. Ela não pode depender de outros módulos do app (biblioteca,
// modelos), que mudam com o tempo: o que precisar fica copiado aqui.

export const SCHEMA_VERSION = 2;

// ---------- v1 → v2: fichas, ids fixos e um registro por treino ----------

// A ficha A/B/C/D como estava no código da v1: [nome, id na biblioteca, séries, reps, descanso]
const V1_WORKOUTS = {
    A: ['Treino A - Inferiores', [
        ['Extensão de Panturrilha Esticada', 'panturrilha-em-pe', 3, '12 a 15 repetições', 60],
        ['Cadeira Abdutora', 'cadeira-abdutora', 3, '10 a 12 repetições', 90],
        ['Cadeira Flexora', 'cadeira-flexora', 2, '10 a 12 repetições', 90],
        ['Agachamento', 'agachamento', 3, '6 a 8 repetições', 150],
        ['Stiff', 'stiff', 3, '8 a 10 repetições', 120],
        ['Cadeira Extensora', 'cadeira-extensora', 2, '10 a 12 repetições', 90]
    ]],
    B: ['Treino B - Superiores', [
        ['Supino Inclinado Máquina', 'supino-inclinado-maquina', 2, '10 a 12 repetições', 90],
        ['Remada Unilateral Máquina', 'remada-unilateral-maquina', 2, '10 a 12 repetições', 90],
        ['Elevação Lateral', 'elevacao-lateral', 3, '10 a 12 repetições', 60],
        ['Elevação Frontal Inclinada', 'elevacao-frontal-inclinada', 2, '12 a 15 repetições', 60],
        ['Triceps Francês', 'triceps-frances', 2, '8 a 10 repetições', 60],
        ['Elevação de Pernas', 'elevacao-de-pernas', 3, '12 a 15 repetições', 60]
    ]],
    C: ['Treino C - Inferiores 2', [
        ['Extensão de Panturrilha Esticada', 'panturrilha-em-pe', 3, '12 a 15 repetições', 60],
        ['Cadeira Adutora', 'cadeira-adutora', 2, '12 a 15 repetições', 90],
        ['Banco Romano com Peso', 'banco-romano-com-peso', 3, '10 a 12 repetições', 120],
        ['Leg Press', 'leg-press', 3, '8 a 10 repetições', 150],
        ['Búlgaro', 'bulgaro', 2, '8 a 10 repetições', 120],
        ['Cadeira Flexora', 'cadeira-flexora', 2, '10 a 12 repetições', 90]
    ]],
    D: ['Treino D - Superiores 2', [
        ['Desenvolvimento de Ombros', 'desenvolvimento-ombros', 3, '8 a 10 repetições', 90],
        ['Puxador Frontal', 'puxador-frontal', 3, '8 a 10 repetições', 90],
        ['Elevação Lateral', 'elevacao-lateral', 2, '10 a 12 repetições', 60],
        ['Crucifixo', 'crucifixo', 2, '10 a 12 repetições', 90],
        ['Rosca Alternada', 'rosca-alternada', 2, '10 a 12 repetições', 60],
        ['Abdominal Máquina', 'abdominal-maquina', 3, '10 a 12 repetições', 60]
    ]]
};

// Ids fixos da primeira ficha. Os treinos mantêm as letras como id, então 'A|Agachamento' vira
// 'A|agachamento' e o treino escolhido por último continua o mesmo.
export const V1_PLAN_ID = 'abcd';
const V1_TITLE = 'Treino do Meu Benzinho';

const V1_IDS = {};
Object.values(V1_WORKOUTS).forEach(([, list]) => list.forEach(([nome, id]) => { V1_IDS[nome] = id; }));

function slug(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Exercício que não está na ficha da v1 (ex.: um que saiu da ficha mas ficou no histórico)
function v1ExerciseId(nome) {
    return V1_IDS[nome] || 'v1-' + slug(nome);
}

function v1Series(workoutKey, nome) {
    const workout = V1_WORKOUTS[workoutKey];
    const found = workout && workout[1].find((e) => e[0] === nome);
    return found ? found[2] : null;
}

function v1Plan() {
    return {
        id: V1_PLAN_ID,
        nome: 'Ficha A/B/C/D',
        treinos: Object.entries(V1_WORKOUTS).map(([key, [nome, list]]) => ({
            id: key,
            nome,
            exercicios: list.map(([, exerciseId, series, reps, descanso]) => ({ exerciseId, series, reps, descanso, obs: '' }))
        })),
        createdBy: null,
        updatedBy: null,
        updatedAt: 0
    };
}

// Reps antigas num campo só ("8, 8, 6"); valor único vale para todas as séries
function legacyRepsFor(repsStr, w) {
    if (!repsStr) return '';
    const parts = String(repsStr).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts[w] || '';
}

function legacyRepsCount(repsStr) {
    return String(repsStr || '').split(',').filter((s) => s.trim()).length;
}

// Últimos valores da v1: por série, com os campos antigos (weight/reps únicos) como semente
function v1SetValues(saved, w) {
    const s = (saved.sets && saved.sets[w]) || {};
    return {
        weight: s.weight !== undefined ? s.weight : (saved.weight || ''),
        reps: s.reps !== undefined ? s.reps : legacyRepsFor(saved.reps, w)
    };
}

// Séries de um exercício do histórico da v1. No formato antigo (uma carga por exercício), todas
// as séries contam como feitas só se o exercício inteiro foi feito, como a sugestão de carga lia.
function v1HistorySets(entryEx) {
    if (Array.isArray(entryEx.sets)) {
        return entryEx.sets.map((s) => ({ weight: s.weight || '', reps: s.reps || '', done: !!s.done }));
    }
    const allDone = entryEx.setsDone >= entryEx.setsTotal;
    const sets = [];
    for (let w = 0; w < (entryEx.setsTotal || 0); w++) {
        sets.push({ weight: entryEx.weight || '', reps: legacyRepsFor(entryEx.reps, w), done: allDone });
    }
    return sets;
}

function v1HistoryEntry(entry) {
    const exercises = Array.isArray(entry.exercises) ? entry.exercises : [];
    const workout = V1_WORKOUTS[entry.workout];
    return {
        id: String(entry.id),
        date: entry.date,
        planId: V1_PLAN_ID,
        workoutId: entry.workout,
        workoutNome: workout ? workout[0] : `Treino ${entry.workout}`,
        workoutNote: entry.workoutNote || '',
        doneCount: entry.doneCount || 0,
        totalCount: entry.totalCount || exercises.length,
        updatedAt: 0,
        exercises: exercises.filter(Boolean).map((ex) => {
            const sets = v1HistorySets(ex);
            return {
                exerciseId: v1ExerciseId(ex.nome),
                nome: ex.nome,
                note: ex.note || '',
                sets,
                setsDone: ex.setsDone !== undefined ? ex.setsDone : sets.filter((s) => s.done).length,
                setsTotal: ex.setsTotal !== undefined ? ex.setsTotal : sets.length
            };
        })
    };
}

function v1LastValues(exerciseData, updatedAt) {
    const result = {};
    for (const [key, saved] of Object.entries(exerciseData || {})) {
        if (!saved || typeof saved !== 'object') continue;
        const sep = key.indexOf('|');
        const workoutKey = key.slice(0, sep);
        const nome = key.slice(sep + 1);
        const count = v1Series(workoutKey, nome)
            || Math.max((saved.sets || []).length, legacyRepsCount(saved.reps), saved.weight ? 1 : 0);
        const sets = [];
        for (let w = 0; w < count; w++) sets.push(v1SetValues(saved, w));
        result[`${workoutKey}|${v1ExerciseId(nome)}`] = { sets, note: saved.note || '', updatedAt };
    }
    return result;
}

function v1Sessions(sessions) {
    const result = {};
    for (const [workoutKey, session] of Object.entries(sessions || {})) {
        if (!session || typeof session !== 'object') continue;
        const sets = {};
        for (const [nome, list] of Object.entries(session.sets || {})) sets[v1ExerciseId(nome)] = list;
        result[workoutKey] = { startedAt: session.startedAt, workoutNote: session.workoutNote || '', sets };
    }
    return result;
}

export function migrateV1toV2(data) {
    const history = (Array.isArray(data.history) ? data.history : []).filter((e) => e && e.id != null);
    const deletedIds = Array.isArray(data.deletedIds) ? data.deletedIds : [];
    const exerciseData = data.exerciseData || {};
    const sessions = data.sessions || {};
    // Quem nunca usou o app não ganha a ficha da v1: vai para a tela de boas-vindas (item 8)
    const used = history.length > 0 || deletedIds.length > 0 || Object.keys(exerciseData).length > 0
        || Object.keys(sessions).length > 0 || !!data.lastWorkout;

    const migrated = history.map(v1HistoryEntry).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const updatedAt = data.exerciseDataUpdatedAt || (data.cloudMeta && data.cloudMeta.exerciseDataUpdatedAt) || 0;
    const { exerciseData: _1, exerciseDataUpdatedAt: _2, ...rest } = data;

    const result = {
        ...rest,
        profile: used
            ? { nome: '', titulo: V1_TITLE, activePlanId: V1_PLAN_ID, lastSessionAt: migrated.length ? migrated[0].date : null, updatedAt: 0 }
            : null,
        plans: used ? { [V1_PLAN_ID]: v1Plan() } : {},
        history: migrated,
        deletedIds: deletedIds.map(String),
        lastValues: v1LastValues(exerciseData, updatedAt),
        sessions: v1Sessions(sessions)
    };
    // A sincronização da v2 é outra: o primeiro backup depois da migração envia tudo de novo
    if (data.cloudMeta) result.cloudMeta = { lastSyncAt: data.cloudMeta.lastSyncAt || null };
    return result;
}

export const MIGRATIONS = [
    { from: 1, migrate: migrateV1toV2 }
];

// Dados gravados por uma versão do app mais nova que esta: não dá para ler nem gravar por cima
export class NewerSchemaError extends Error {
    constructor(version) {
        super(`Dados na versão ${version}, mais nova que a deste app (${SCHEMA_VERSION})`);
        this.name = 'NewerSchemaError';
        this.version = version;
    }
}

export function migrate(data, fromVersion, { migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
    if (fromVersion > target) throw new NewerSchemaError(fromVersion);
    let current = data;
    for (let version = fromVersion; version < target; version++) {
        const step = migrations.find((m) => m.from === version);
        if (!step) throw new Error(`Falta a migração v${version} → v${version + 1}`);
        // Cópia, para uma migração com erro não deixar os dados pela metade
        current = step.migrate(structuredClone(current));
    }
    return current;
}
