// Estado do app (dados locais + treino escolhido) e as ações que o alteram. JS puro: as telas
// (src/ui) assinam as mudanças com subscribe(); a nuvem (cloud.js) é avisada por onDataChange.
import { KEYS, prepareLocalData, storageSet } from './storage.js';
import { treinos } from './data/treinos.js';
import { getSetValues } from './progression.js';

export const WARMUP_SETS = 2;
export const HISTORY_LIMIT = 50;

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
        return 'error';
    }
    if (!data) return 'newer';
    state = {
        exerciseData: data.exerciseData,
        sessions: data.sessions,
        history: data.history,
        deletedIds: data.deletedIds,
        cloudMeta: data.cloudMeta,
        currentWorkout: treinos[data.lastWorkout] ? data.lastWorkout : 'A'
    };
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

// Chamado a cada mudança no histórico ou nos últimos valores (o que vai para o backup)
export function onDataChange(handler) {
    dataChangeHandler = handler;
}

export function exerciseKey(workoutKey, nome) {
    return workoutKey + '|' + nome;
}

// ---------- Gravação ----------

function saveSessions() { storageSet(KEYS.session, state.sessions); }
export function saveCloudMeta() { storageSet(KEYS.cloudMeta, state.cloudMeta); }

function markDataChanged() {
    state.cloudMeta.dirty = true;
    saveCloudMeta();
    dataChangeHandler();
}

function saveExerciseData() {
    storageSet(KEYS.exerciseData, state.exerciseData);
    state.cloudMeta.exerciseDataUpdatedAt = Date.now();
    markDataChanged();
}

function saveHistory() {
    storageSet(KEYS.history, state.history);
    markDataChanged();
}

// ---------- Treino em andamento ----------

function getSession(workoutKey) {
    if (!state.sessions[workoutKey]) {
        state.sessions[workoutKey] = { startedAt: new Date().toISOString(), sets: {}, workoutNote: '' };
    }
    return state.sessions[workoutKey];
}

export function isExerciseDone(workoutKey, ex) {
    const session = state.sessions[workoutKey];
    const sets = session && session.sets && session.sets[ex.nome];
    if (!Array.isArray(sets)) return false;
    for (let i = WARMUP_SETS; i < WARMUP_SETS + ex.series; i++) {
        if (!sets[i]) return false;
    }
    return true;
}

export function countDone(workoutKey) {
    return treinos[workoutKey].filter((ex) => isExerciseDone(workoutKey, ex)).length;
}

export function selectWorkout(workoutKey) {
    state.currentWorkout = workoutKey;
    storageSet(KEYS.lastWorkout, { key: workoutKey });
    emit();
}

// setIndex conta os aquecimentos: 0 e 1 são aquecimento, 2 em diante são as séries de trabalho
export function toggleSet(workoutKey, ex, setIndex) {
    const session = getSession(workoutKey);
    if (!Array.isArray(session.sets[ex.nome])) {
        session.sets[ex.nome] = new Array(WARMUP_SETS + ex.series).fill(false);
    }
    session.sets[ex.nome][setIndex] = !session.sets[ex.nome][setIndex];
    saveSessions();
    emit();
}

export function setWorkoutNote(workoutKey, text) {
    getSession(workoutKey).workoutNote = text;
    saveSessions();
    emit();
}

// ---------- Últimos valores digitados ----------

function exerciseEntry(key) {
    state.exerciseData[key] = state.exerciseData[key] || {};
    return state.exerciseData[key];
}

// field: 'weight' ou 'reps' da série de trabalho w
export function setSetValue(key, w, field, value) {
    const saved = exerciseEntry(key);
    saved.sets = saved.sets || [];
    saved.sets[w] = saved.sets[w] || {};
    saved.sets[w][field] = value;
    saveExerciseData();
    emit();
}

export function setExerciseNote(key, value) {
    exerciseEntry(key).note = value;
    saveExerciseData();
    emit();
}

// Mesma carga em todas as séries de trabalho (botão "Usar" da sugestão)
export function applyWeight(key, series, value) {
    const saved = exerciseEntry(key);
    saved.sets = saved.sets || [];
    for (let w = 0; w < series; w++) {
        saved.sets[w] = saved.sets[w] || {};
        saved.sets[w].weight = value;
    }
    saveExerciseData();
    emit();
}

// ---------- Histórico ----------

export function finishWorkout(workoutKey) {
    const exercises = treinos[workoutKey];
    const session = state.sessions[workoutKey];
    const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        workout: workoutKey,
        workoutNote: (session && session.workoutNote) || '',
        doneCount: countDone(workoutKey),
        totalCount: exercises.length,
        exercises: exercises.map((ex) => {
            const saved = state.exerciseData[exerciseKey(workoutKey, ex.nome)] || {};
            const sessSets = (session && session.sets && session.sets[ex.nome]) || [];
            const sets = [];
            let setsDone = 0;
            for (let w = 0; w < ex.series; w++) {
                const done = !!sessSets[WARMUP_SETS + w];
                if (done) setsDone++;
                const vals = getSetValues(saved, w);
                sets.push({ weight: vals.weight, reps: vals.reps, done: done });
            }
            return {
                nome: ex.nome,
                note: saved.note || '',
                sets: sets,
                setsDone: setsDone,
                setsTotal: ex.series
            };
        })
    };

    state.history.unshift(entry);
    if (state.history.length > HISTORY_LIMIT) state.history = state.history.slice(0, HISTORY_LIMIT);
    saveHistory();

    delete state.sessions[workoutKey];
    saveSessions();
    emit();
}

export function deleteHistoryEntry(id) {
    state.history = state.history.filter((entry) => entry.id !== id);
    state.deletedIds.push(id);
    storageSet(KEYS.deletedIds, state.deletedIds);
    saveHistory();
    emit();
}

// ---------- Backup ----------

// O que vai para a nuvem (o treino em andamento fica só no celular)
export function localSnapshot() {
    return {
        history: state.history,
        deletedIds: state.deletedIds,
        exerciseData: state.exerciseData,
        exerciseDataUpdatedAt: state.cloudMeta.exerciseDataUpdatedAt || 0
    };
}

// Substitui os dados pelos já mesclados com a nuvem; só redesenha se algo mudou
export function replaceData(data, changed) {
    state.history = data.history;
    state.deletedIds = data.deletedIds;
    state.exerciseData = data.exerciseData;
    state.cloudMeta.exerciseDataUpdatedAt = data.exerciseDataUpdatedAt;
    storageSet(KEYS.history, state.history);
    storageSet(KEYS.deletedIds, state.deletedIds);
    storageSet(KEYS.exerciseData, state.exerciseData);
    saveCloudMeta();
    if (changed) emit();
}
