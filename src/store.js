// Estado do app (dados locais + treino escolhido) e as ações que o alteram. JS puro: as telas
// (src/ui) assinam as mudanças com subscribe(); a nuvem (cloud.js) é avisada por onDataChange.
import { KEYS, prepareLocalData, storageSet } from './storage.js';
import { getLibraryExercise, resolveExercise } from './data/library.js';
import { getTemplate } from './data/templates.js';
import { reportError } from './monitoring.js';
import { getSetValues } from './progression.js';
import { findRecords } from './stats.js';
import { sortHistory } from './sync.js';
import { newId } from './util.js';

export const WARMUP_SETS = 2;

let state = null;
const listeners = new Set();
let dataChangeHandler = () => {};

// Devolve null se deu certo, ou o motivo de os dados locais não poderem ser usados ('newer':
// gravados por uma versão mais nova do app; 'error': migração com erro). Nesses casos o app não
// mostra o treino nem grava nada, para não estragar os dados.
export function initStore() {
    let data;
    try {
        data = prepareLocalData();
    } catch (err) {
        console.error('Falha ao migrar os dados:', err);
        reportError(err, 'migration');
        return 'error';
    }
    if (!data) return 'newer';
    state = { ...data, currentWorkoutId: data.lastWorkout };
    delete state.lastWorkout;
    return null;
}

export function getState() {
    return state;
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit() {
    listeners.forEach((listener) => listener());
}

// Chamado a cada mudança no que vai para o backup
export function onDataChange(handler) {
    dataChangeHandler = handler;
}

export function valuesKey(workoutId, exerciseId) {
    return workoutId + '|' + exerciseId;
}

// ---------- Gravação ----------

function saveSessions() { storageSet(KEYS.sessions, state.sessions); }
function saveProfile() { storageSet(KEYS.profile, state.profile); }
function savePlans() { storageSet(KEYS.plans, state.plans); }
function saveLastValues() { storageSet(KEYS.lastValues, state.lastValues); }
function saveHistory() {
    storageSet(KEYS.history, state.history);
    storageSet(KEYS.deletedIds, state.deletedIds);
}
export function saveCloudMeta() { storageSet(KEYS.cloudMeta, state.cloudMeta); }

// O que mudou e ainda não foi para a nuvem: dirty = { profile, plans: {id}, history: {id},
// values: {chave} }, cada um com um número que cresce a cada mudança (cloud.js só limpa o que
// não mudou de novo enquanto enviava)
function markDirty(kind, id) {
    const meta = state.cloudMeta;
    meta.seq = (meta.seq || 0) + 1;
    meta.dirty = meta.dirty || {};
    if (kind === 'profile') meta.dirty.profile = meta.seq;
    else (meta.dirty[kind] = meta.dirty[kind] || {})[id] = meta.seq;
    saveCloudMeta();
    dataChangeHandler();
}

// Tudo o que existe no celular vai para a nuvem na próxima sincronização (outra conta, ou dados
// recém-migrados)
export function markAllDirty() {
    const meta = state.cloudMeta;
    meta.seq = (meta.seq || 0) + 1;
    const all = (keys) => Object.fromEntries(keys.map((k) => [k, meta.seq]));
    meta.dirty = {
        profile: state.profile ? meta.seq : undefined,
        plans: all(Object.keys(state.plans)),
        history: all([...state.history.map((e) => e.id), ...state.deletedIds]),
        values: all(Object.keys(state.lastValues))
    };
    saveCloudMeta();
}

// ---------- Ficha e treino escolhidos ----------

export function getPlan(planId) {
    const plan = state.plans[planId];
    return plan && !plan.deleted ? plan : null;
}

export function listPlans() {
    return Object.values(state.plans).filter((p) => !p.deleted)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Exercícios criados pela pessoa (fora da biblioteca), em qualquer ficha
export function listCustomExercises() {
    const found = new Map();
    for (const plan of listPlans()) {
        for (const workout of plan.treinos) {
            for (const ex of workout.exercicios) {
                if (ex.nome && !getLibraryExercise(ex.exerciseId)) found.set(ex.exerciseId, { exerciseId: ex.exerciseId, nome: ex.nome });
            }
        }
    }
    return Array.from(found.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function getActivePlan() {
    return state.profile ? getPlan(state.profile.activePlanId) : null;
}

export function getCurrentWorkout() {
    const plan = getActivePlan();
    if (!plan || plan.treinos.length === 0) return null;
    return plan.treinos.find((t) => t.id === state.currentWorkoutId) || plan.treinos[0];
}

// Exercícios de um treino da ficha, com nome, GIF e instruções da biblioteca
export function workoutExercises(workout) {
    return workout.exercicios.map(resolveExercise);
}

export function selectWorkout(workoutId) {
    state.currentWorkoutId = workoutId;
    storageSet(KEYS.lastWorkout, { key: workoutId });
    emit();
}

// ---------- Treino em andamento ----------

function getSession(workoutId) {
    if (!state.sessions[workoutId]) {
        state.sessions[workoutId] = { startedAt: new Date().toISOString(), sets: {}, workoutNote: '' };
    }
    return state.sessions[workoutId];
}

export function isSetDone(workoutId, exerciseId, setIndex) {
    const session = state.sessions[workoutId];
    const sets = session && session.sets && session.sets[exerciseId];
    return !!(sets && sets[setIndex]);
}

export function isExerciseDone(workoutId, ex) {
    for (let i = WARMUP_SETS; i < WARMUP_SETS + ex.series; i++) {
        if (!isSetDone(workoutId, ex.exerciseId, i)) return false;
    }
    return true;
}

export function countDone(workout) {
    return workoutExercises(workout).filter((ex) => isExerciseDone(workout.id, ex)).length;
}

// setIndex conta os aquecimentos: 0 e 1 são aquecimento, 2 em diante são as séries de trabalho
export function toggleSet(workoutId, ex, setIndex) {
    const session = getSession(workoutId);
    const sets = Array.isArray(session.sets[ex.exerciseId]) ? session.sets[ex.exerciseId] : [];
    while (sets.length < WARMUP_SETS + ex.series) sets.push(false);
    sets[setIndex] = !sets[setIndex];
    session.sets[ex.exerciseId] = sets;
    saveSessions();
    emit();
}

export function setWorkoutNote(workoutId, text) {
    getSession(workoutId).workoutNote = text;
    saveSessions();
    emit();
}

// ---------- Últimos valores digitados ----------

function changeValues(key, change) {
    const saved = { sets: [], note: '', ...state.lastValues[key] };
    saved.sets = (saved.sets || []).slice();
    change(saved);
    saved.updatedAt = Date.now();
    state.lastValues[key] = saved;
    saveLastValues();
    markDirty('values', key);
    emit();
}

// field: 'weight' ou 'reps' da série de trabalho w
export function setSetValue(key, w, field, value) {
    changeValues(key, (saved) => {
        for (let i = 0; i <= w; i++) saved.sets[i] = { weight: '', reps: '', ...saved.sets[i] };
        saved.sets[w][field] = value;
    });
}

export function setExerciseNote(key, value) {
    changeValues(key, (saved) => { saved.note = value; });
}

// Mesma carga em todas as séries de trabalho (botão "Usar" da sugestão)
export function applyWeight(key, series, value) {
    changeValues(key, (saved) => {
        for (let w = 0; w < series; w++) saved.sets[w] = { weight: '', reps: '', ...saved.sets[w], weight: value };
    });
}

// ---------- Histórico ----------

// Devolve os recordes pessoais batidos neste treino (stats.js → findRecords)
export function finishWorkout(workout) {
    const exercises = workoutExercises(workout);
    const session = state.sessions[workout.id];
    const date = new Date().toISOString();
    const entry = {
        id: newId(),
        date,
        planId: state.profile.activePlanId,
        workoutId: workout.id,
        workoutNome: workout.nome,
        workoutNote: (session && session.workoutNote) || '',
        doneCount: countDone(workout),
        totalCount: exercises.length,
        updatedAt: Date.now(),
        exercises: exercises.map((ex) => {
            const saved = state.lastValues[valuesKey(workout.id, ex.exerciseId)] || {};
            const sets = [];
            for (let w = 0; w < ex.series; w++) {
                sets.push({ ...getSetValues(saved, w), done: isSetDone(workout.id, ex.exerciseId, WARMUP_SETS + w) });
            }
            return {
                exerciseId: ex.exerciseId,
                nome: ex.nome,
                note: saved.note || '',
                sets,
                setsDone: sets.filter((s) => s.done).length,
                setsTotal: ex.series
            };
        })
    };

    const records = findRecords(state.history, entry);
    state.history.unshift(entry);
    saveHistory();
    markDirty('history', entry.id);
    // Para a lista de alunos do personal (lastSessionAt não conta como edição do perfil)
    state.profile = { ...state.profile, lastSessionAt: date };
    saveProfile();
    markDirty('profile');

    delete state.sessions[workout.id];
    saveSessions();
    emit();
    return records;
}

// Corrige um treino já finalizado: change(draft) pode mudar carga, reps, séries feitas e
// observações. A sugestão de carga é calculada a partir do histórico, então acompanha a edição.
export function updateHistoryEntry(id, change) {
    const index = state.history.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const before = state.history[index];
    const draft = structuredClone(before);
    change(draft);

    // As contagens só são refeitas onde as séries feitas mudaram: treinos antigos migrados da v1
    // podem ter uma contagem que não dá para tirar das séries
    const doneFlags = (ex) => ex.sets.map((s) => !!s.done).join();
    let doneChanged = false;
    draft.exercises.forEach((ex, i) => {
        if (doneFlags(ex) === doneFlags(before.exercises[i])) return;
        ex.setsDone = ex.sets.filter((s) => s.done).length;
        doneChanged = true;
    });
    if (doneChanged) draft.doneCount = draft.exercises.filter((ex) => ex.setsTotal > 0 && ex.setsDone >= ex.setsTotal).length;

    draft.updatedAt = Date.now();
    state.history[index] = draft;
    saveHistory();
    markDirty('history', id);
    emit();
}

export function deleteHistoryEntry(id) {
    state.history = state.history.filter((entry) => entry.id !== id);
    state.deletedIds.push(id);
    saveHistory();
    markDirty('history', id);
    emit();
}

// ---------- Perfil ----------

export function updateProfile(changes) {
    state.profile = { ...state.profile, ...changes, updatedAt: Date.now() };
    saveProfile();
    markDirty('profile');
    emit();
}

// Título do app: o escolhido pela pessoa ou "Treino de <nome>"
export function appTitle(profile = state && state.profile) {
    if (profile && profile.titulo) return profile.titulo;
    if (profile && profile.nome) return `Treino de ${profile.nome}`;
    return 'Meu Treino';
}

// ---------- Fichas ----------

function copyWorkouts(treinos) {
    return treinos.map((t) => ({ ...structuredClone(t), id: newId() }));
}

function savePlan(plan) {
    state.plans[plan.id] = plan;
    savePlans();
    markDirty('plans', plan.id);
}

// Ficha nova, a partir de um modelo ou em branco (com um treino vazio)
export function createPlan({ templateId, nome } = {}) {
    const template = templateId && getTemplate(templateId);
    const plan = {
        id: newId(),
        nome: nome || (template ? template.nome : 'Minha ficha'),
        treinos: template ? copyWorkouts(template.treinos) : [{ id: newId(), nome: 'Treino A', exercicios: [] }],
        createdBy: null,
        updatedBy: null,
        updatedAt: Date.now()
    };
    savePlan(plan);
    emit();
    return plan.id;
}

// Altera uma cópia da ficha: change(draft) pode mudar nome, treinos e exercícios
export function updatePlan(planId, change) {
    const draft = structuredClone(state.plans[planId]);
    change(draft);
    draft.updatedAt = Date.now();
    savePlan(draft);
    emit();
}

export function duplicatePlan(planId) {
    const source = state.plans[planId];
    const plan = {
        ...structuredClone(source),
        id: newId(),
        nome: `${source.nome} (cópia)`,
        treinos: copyWorkouts(source.treinos),
        createdBy: null,
        updatedBy: null,
        updatedAt: Date.now()
    };
    savePlan(plan);
    emit();
    return plan.id;
}

// A ficha fica marcada como apagada, para a nuvem e os outros celulares saberem
export function deletePlan(planId) {
    savePlan({ ...state.plans[planId], deleted: true, updatedAt: Date.now() });
    if (state.profile.activePlanId === planId) {
        const next = listPlans()[0];
        updateProfile({ activePlanId: next ? next.id : null });
    } else {
        emit();
    }
}

export function setActivePlan(planId) {
    updateProfile({ activePlanId: planId });
    const workout = getCurrentWorkout();
    if (workout) selectWorkout(workout.id);
}

// ---------- Primeiro acesso ----------

// templateId null: ficha em branco. Devolve o id da ficha criada.
export function completeOnboarding({ nome, templateId }) {
    const planId = createPlan({ templateId, nome: templateId ? undefined : 'Minha ficha' });
    state.profile = { nome: nome.trim(), titulo: '', activePlanId: planId, lastSessionAt: null, updatedAt: Date.now() };
    saveProfile();
    markDirty('profile');
    emit();
    return planId;
}

// ---------- Backup ----------

// O que vai para a nuvem (o treino em andamento fica só no celular)
export function localSnapshot() {
    return {
        profile: state.profile,
        plans: state.plans,
        history: state.history,
        deletedIds: state.deletedIds,
        lastValues: state.lastValues
    };
}

// Substitui os dados pelos já mesclados com a nuvem; só redesenha se algo mudou
export function replaceData(data, changed) {
    state.profile = data.profile;
    state.plans = data.plans;
    state.history = sortHistory(data.history);
    state.deletedIds = data.deletedIds;
    state.lastValues = data.lastValues;
    saveProfile();
    savePlans();
    saveHistory();
    saveLastValues();
    if (changed) emit();
}
