// Versão do formato dos dados e migrações entre versões. Toda mudança no formato dos dados
// (localStorage ou nuvem) sobe SCHEMA_VERSION e ganha uma migração aqui, com teste.
//
// Uma migração recebe os dados na versão `from` e devolve os dados na versão from + 1. Os dados
// são { exerciseData, sessions, history, deletedIds }, mais exerciseDataUpdatedAt quando vêm da
// nuvem (que não tem sessions); a migração deve devolver sem mudança o que não conhece.

export const SCHEMA_VERSION = 1;

// Ex.: { from: 1, migrate: (data) => ({ ...data, history: data.history.map(...) }) }
export const MIGRATIONS = [];

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
