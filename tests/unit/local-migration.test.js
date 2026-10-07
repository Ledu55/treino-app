// @vitest-environment jsdom
// Migração dos dados do localStorage ao abrir o app (prepareLocalData)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, V1_PLAN_ID } from '../../src/migrations.js';
import { KEYS, prepareLocalData, restoreBackup } from '../../src/storage.js';

const v1 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'dados-v1.json'), 'utf8'));
delete v1._sobre;

function seed(data) {
    localStorage.clear();
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
}

function stored(key) {
    return JSON.parse(localStorage.getItem(key));
}

function everything() {
    return Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
}

beforeEach(() => seed(v1));

describe('prepareLocalData', () => {
    it('dados de hoje (sem versão gravada) são v1: migram para a versão atual', () => {
        const data = prepareLocalData();
        expect(stored(KEYS.schemaVersion)).toEqual({ version: SCHEMA_VERSION });
        expect(data.profile.activePlanId).toBe(V1_PLAN_ID);
        expect(Object.keys(data.plans)).toEqual([V1_PLAN_ID]);
        expect(data.history.map((e) => e.id)).toEqual(v1['treino.history'].map((e) => String(e.id)));
        expect(data.lastWorkout).toBe('A');
        // Gravado no novo formato, e o formato antigo dos últimos valores saiu
        expect(stored(KEYS.plans)[V1_PLAN_ID].treinos).toHaveLength(4);
        expect(stored(KEYS.lastValues)['A|agachamento'].note).toBe('banco no 4');
        expect(localStorage.getItem(KEYS.exerciseData)).toBeNull();
    });

    it('guarda a cópia dos dados antigos antes de migrar', () => {
        const before = everything();
        prepareLocalData();
        const backup = stored(KEYS.backup);
        expect(backup.fromVersion).toBe(1);
        for (const [key, value] of Object.entries(before)) expect(backup.data[key]).toBe(value);
    });

    it('restoreBackup desfaz a migração', () => {
        const before = everything();
        prepareLocalData();
        expect(restoreBackup()).toBe(true);
        const after = everything();
        delete after[KEYS.backup];
        expect(after).toEqual(before);
    });

    it('não migra de novo dados já migrados', () => {
        prepareLocalData();
        const calls = [];
        const spy = { from: 1, migrate: (d) => { calls.push(d); return d; } };
        prepareLocalData({ migrations: [spy], target: SCHEMA_VERSION });
        expect(calls).toEqual([]);
    });

    it('migra da versão atual para uma próxima com as migrações dadas', () => {
        prepareLocalData();
        const next = { from: SCHEMA_VERSION, migrate: (d) => ({ ...d, history: d.history.map((e) => ({ ...e, migrado: true })) }) };
        const data = prepareLocalData({ migrations: [next], target: SCHEMA_VERSION + 1 });
        expect(data.history.every((e) => e.migrado)).toBe(true);
        expect(stored(KEYS.backup).fromVersion).toBe(SCHEMA_VERSION);
        expect(stored(KEYS.schemaVersion)).toEqual({ version: SCHEMA_VERSION + 1 });
    });

    it('dados de uma versão mais nova: devolve null e não grava nada', () => {
        seed({ ...v1, [KEYS.schemaVersion]: { version: SCHEMA_VERSION + 1 } });
        const before = everything();
        expect(prepareLocalData()).toBeNull();
        expect(everything()).toEqual(before);
    });

    it('migração com erro: os dados ficam como estavam', () => {
        const before = everything();
        const broken = { from: 1, migrate: () => { throw new Error('bug'); } };
        expect(() => prepareLocalData({ migrations: [broken], target: 2 })).toThrow('bug');
        expect(everything()).toEqual(before);
    });

    it('primeiro acesso, sem dados: sem perfil nem ficha', () => {
        localStorage.clear();
        const data = prepareLocalData();
        expect(data.profile).toBeNull();
        expect(data.plans).toEqual({});
        expect(data.history).toEqual([]);
        expect(data.lastWorkout).toBeNull();
    });
});
