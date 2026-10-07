// @vitest-environment jsdom
// Migração dos dados do localStorage ao abrir o app (prepareLocalData)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/migrations.js';
import { KEYS, prepareLocalData, restoreBackup } from '../../src/storage.js';

const v1 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'dados-v1.json'), 'utf8'));
delete v1._sobre;

// v1 → v2 de exemplo: marca cada treino do histórico
const EXAMPLE = {
    from: 1,
    migrate: (data) => ({ ...data, history: data.history.map((e) => ({ ...e, migrado: true })) })
};
const toV2 = { migrations: [EXAMPLE], target: 2 };

function seed(data) {
    localStorage.clear();
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
}

function stored(key) {
    return JSON.parse(localStorage.getItem(key));
}

beforeEach(() => seed(v1));

describe('prepareLocalData', () => {
    it('dados de hoje (sem versão gravada) são v1: abrem iguais e ganham a versão', () => {
        const data = prepareLocalData();
        expect(data.history).toEqual(v1['treino.history']);
        expect(data.exerciseData).toEqual(v1['treino.exerciseData']);
        expect(data.sessions).toEqual(v1['treino.session']);
        expect(data.lastWorkout).toBe('A');
        expect(stored(KEYS.schemaVersion)).toEqual({ version: SCHEMA_VERSION });
        expect(localStorage.getItem(KEYS.backup)).toBeNull();
    });

    it('migra, grava a nova versão e guarda a cópia dos dados antigos', () => {
        const data = prepareLocalData(toV2);
        expect(data.history.every((e) => e.migrado)).toBe(true);
        expect(stored(KEYS.history).every((e) => e.migrado)).toBe(true);
        expect(stored(KEYS.schemaVersion)).toEqual({ version: 2 });
        // O resto continua igual
        expect(data.exerciseData).toEqual(v1['treino.exerciseData']);
        expect(data.cloudMeta).toEqual(v1['treino.cloudMeta']);

        const backup = stored(KEYS.backup);
        expect(backup.fromVersion).toBe(1);
        expect(JSON.parse(backup.data[KEYS.history])).toEqual(v1['treino.history']);
    });

    it('restoreBackup desfaz a migração', () => {
        prepareLocalData(toV2);
        expect(restoreBackup()).toBe(true);
        expect(stored(KEYS.history)).toEqual(v1['treino.history']);
        // Não havia versão gravada antes da migração
        expect(localStorage.getItem(KEYS.schemaVersion)).toBeNull();
        expect(prepareLocalData().history).toEqual(v1['treino.history']);
    });

    it('não migra de novo dados já migrados', () => {
        prepareLocalData(toV2);
        const calls = [];
        const spy = { from: 1, migrate: (d) => { calls.push(d); return d; } };
        prepareLocalData({ migrations: [spy], target: 2 });
        expect(calls).toEqual([]);
    });

    it('dados de uma versão mais nova: devolve null e não grava nada', () => {
        seed({ ...v1, [KEYS.schemaVersion]: { version: SCHEMA_VERSION + 1 } });
        const before = { ...localStorage };
        expect(prepareLocalData()).toBeNull();
        expect({ ...localStorage }).toEqual(before);
    });

    it('migração com erro: os dados ficam como estavam', () => {
        const broken = { from: 1, migrate: () => { throw new Error('bug'); } };
        expect(() => prepareLocalData({ migrations: [broken], target: 2 })).toThrow('bug');
        expect(stored(KEYS.history)).toEqual(v1['treino.history']);
        expect(localStorage.getItem(KEYS.schemaVersion)).toBeNull();
    });

    it('primeiro acesso, sem dados', () => {
        localStorage.clear();
        const data = prepareLocalData();
        expect(data.history).toEqual([]);
        expect(data.lastWorkout).toBe('A');
    });
});
