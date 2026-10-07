// Leitura/gravação no localStorage. Os dados ficam no celular; a nuvem é só backup (cloud.js).
import { SCHEMA_VERSION, migrate } from './migrations.js';

export const KEYS = {
    exerciseData: 'treino.exerciseData',   // últimos valores digitados, por 'A|Agachamento'
    session: 'treino.session',             // treino em andamento, por treino (não vai para a nuvem)
    history: 'treino.history',             // treinos finalizados, do mais novo para o mais antigo
    deletedIds: 'treino.deletedIds',       // ids de treinos apagados, para o backup não os trazer de volta
    cloudMeta: 'treino.cloudMeta',         // { dirty, lastSyncAt, exerciseDataUpdatedAt }
    lastWorkout: 'treino.lastWorkout',     // { key }
    schemaVersion: 'treino.schemaVersion', // { version }; sem ele, os dados são da versão 1
    backup: 'treino.backupBeforeMigration' // cópia dos dados antes da última migração
};

// Dados que mudam de formato com as migrações
const MIGRATED_KEYS = ['exerciseData', 'sessions', 'history', 'deletedIds'];

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

// Lê os dados locais, migrando-os antes se forem de uma versão anterior. Devolve null se forem
// de uma versão mais nova do app: nesse caso nada é lido nem gravado.
export function prepareLocalData(options = {}) {
    const target = options.target || SCHEMA_VERSION;
    const version = storageGet(KEYS.schemaVersion, { version: 1 }).version;
    if (version > target) return null;

    if (version < target) {
        const before = loadLocalData();
        const raw = {};
        for (const name of Object.keys(KEYS)) {
            try { raw[KEYS[name]] = localStorage.getItem(KEYS[name]); } catch (e) { /* indisponível */ }
        }
        delete raw[KEYS.backup];
        storageSet(KEYS.backup, { fromVersion: version, at: new Date().toISOString(), data: raw });

        const dataset = {};
        MIGRATED_KEYS.forEach((name) => { dataset[name] = before[name]; });
        const migrated = migrate(dataset, version, options);
        MIGRATED_KEYS.forEach((name) => storageSet(KEYS[name], migrated[name]));
    }
    storageSet(KEYS.schemaVersion, { version: target });
    return loadLocalData();
}

// Volta os dados para como estavam antes da última migração (para usar pelo console, se uma
// migração der errado). O app precisa ser a versão anterior para ler esses dados.
export function restoreBackup() {
    const backup = storageGet(KEYS.backup, null);
    if (!backup) return false;
    for (const [key, value] of Object.entries(backup.data)) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    }
    return true;
}

function loadLocalData() {
    return {
        exerciseData: storageGet(KEYS.exerciseData, {}),
        sessions: storageGet(KEYS.session, {}),
        history: storageGetArray(KEYS.history),
        deletedIds: storageGetArray(KEYS.deletedIds),
        cloudMeta: storageGet(KEYS.cloudMeta, {}),
        lastWorkout: storageGet(KEYS.lastWorkout, { key: 'A' }).key
    };
}
