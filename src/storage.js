// Leitura/gravação no localStorage. Os dados ficam no celular; a nuvem é só backup (cloud.js).
import { SCHEMA_VERSION, migrate } from './migrations.js';

export const KEYS = {
    profile: 'treino.profile',             // { nome, titulo, activePlanId, lastSessionAt, updatedAt }; null antes do primeiro acesso
    plans: 'treino.plans',                 // fichas, por id
    history: 'treino.history',             // treinos finalizados, do mais novo para o mais antigo (sem limite)
    deletedIds: 'treino.deletedIds',       // ids de treinos apagados, para o backup não os trazer de volta
    lastValues: 'treino.lastValues',       // últimos valores digitados, por 'idDoTreino|idDoExercício'
    sessions: 'treino.session',            // treino em andamento, por treino (não vai para a nuvem)
    lastWorkout: 'treino.lastWorkout',     // { key: id do treino escolhido por último }
    cloudMeta: 'treino.cloudMeta',         // estado da sincronização (cloud.js)
    exerciseData: 'treino.exerciseData',   // v1: últimos valores, por 'A|Agachamento'
    schemaVersion: 'treino.schemaVersion', // { version }; sem ele, os dados são da versão 1
    backup: 'treino.backupBeforeMigration' // cópia dos dados antes da última migração
};

// Dados que passam pelas migrações (todos menos a versão e a cópia)
const DATA_NAMES = Object.keys(KEYS).filter((name) => name !== 'schemaVersion' && name !== 'backup');

let errorHandler = () => {};

// Avisado quando uma gravação falha (armazenamento cheio ou indisponível)
export function onStorageError(handler) {
    errorHandler = handler;
}

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
        return true;
    } catch (e) {
        console.error('Falha ao gravar no celular:', e);
        errorHandler(e);
        return false;
    }
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
        const raw = {};
        for (const name of Object.keys(KEYS)) {
            try { raw[KEYS[name]] = localStorage.getItem(KEYS[name]); } catch (e) { /* indisponível */ }
        }
        delete raw[KEYS.backup];

        const dataset = {};
        DATA_NAMES.forEach((name) => {
            const value = storageGet(KEYS[name], undefined);
            if (value !== undefined) dataset[name] = value;
        });
        const migrated = migrate(dataset, version, options);

        // Só grava depois de a migração terminar sem erro; a cópia vai primeiro
        if (!storageSet(KEYS.backup, { fromVersion: version, at: new Date().toISOString(), data: raw })) {
            throw new Error('Sem espaço para guardar a cópia dos dados antes de migrar');
        }
        DATA_NAMES.forEach((name) => {
            if (migrated[name] === undefined) localStorage.removeItem(KEYS[name]);
            else storageSet(KEYS[name], migrated[name]);
        });
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

// Apaga todos os dados do app neste celular, inclusive a cópia de antes da migração (excluir conta)
export function clearLocalData() {
    for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}

function loadLocalData() {
    return {
        profile: storageGet(KEYS.profile, null),
        plans: storageGet(KEYS.plans, {}),
        history: storageGetArray(KEYS.history),
        deletedIds: storageGetArray(KEYS.deletedIds),
        lastValues: storageGet(KEYS.lastValues, {}),
        sessions: storageGet(KEYS.sessions, {}),
        cloudMeta: storageGet(KEYS.cloudMeta, {}),
        lastWorkout: storageGet(KEYS.lastWorkout, {}).key || null
    };
}
