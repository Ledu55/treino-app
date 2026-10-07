// Leitura/gravação no localStorage. Os dados ficam no celular; a nuvem é só backup (cloud.js).

export const KEYS = {
    exerciseData: 'treino.exerciseData',   // últimos valores digitados, por 'A|Agachamento'
    session: 'treino.session',             // treino em andamento, por treino (não vai para a nuvem)
    history: 'treino.history',             // treinos finalizados, do mais novo para o mais antigo
    deletedIds: 'treino.deletedIds',       // ids de treinos apagados, para o backup não os trazer de volta
    cloudMeta: 'treino.cloudMeta',         // { dirty, lastSyncAt, exerciseDataUpdatedAt }
    lastWorkout: 'treino.lastWorkout'      // { key }
};

export function storageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed === null || typeof parsed !== 'object' ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

export function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* armazenamento cheio ou indisponível */ }
}

function storageGetArray(key) {
    const value = storageGet(key, []);
    return Array.isArray(value) ? value : [];
}

export function loadLocalData() {
    return {
        exerciseData: storageGet(KEYS.exerciseData, {}),
        sessions: storageGet(KEYS.session, {}),
        history: storageGetArray(KEYS.history),
        deletedIds: storageGetArray(KEYS.deletedIds),
        cloudMeta: storageGet(KEYS.cloudMeta, {}),
        lastWorkout: storageGet(KEYS.lastWorkout, { key: 'A' }).key
    };
}
