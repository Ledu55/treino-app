import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, NewerSchemaError, SCHEMA_VERSION, migrate } from '../../src/migrations.js';
import { migrateRemote } from '../../src/cloud.js';
import { computeSuggestion } from '../../src/progression.js';

const v1 = JSON.parse(readFileSync(new URL('./fixtures/dados-v1.json', import.meta.url), 'utf8'));
const dataset = () => ({
    exerciseData: v1['treino.exerciseData'],
    sessions: v1['treino.session'],
    history: v1['treino.history'],
    deletedIds: v1['treino.deletedIds']
});

// Migração de exemplo (v1 → v2): treinos antigos do histórico, com uma carga e reps por exercício,
// passam a ter uma linha por série, como os novos
const EXAMPLE = {
    from: 1,
    migrate: (data) => ({
        ...data,
        history: data.history.map((entry) => ({
            ...entry,
            exercises: entry.exercises.map((ex) => {
                if (Array.isArray(ex.sets)) return ex;
                const { weight, reps, ...rest } = ex;
                const repsList = String(reps || '').split(',').map((s) => s.trim()).filter(Boolean);
                const sets = [];
                for (let w = 0; w < ex.setsTotal; w++) {
                    sets.push({
                        weight: weight || '',
                        reps: repsList.length === 1 ? repsList[0] : (repsList[w] || ''),
                        done: ex.setsDone >= ex.setsTotal
                    });
                }
                return { ...rest, sets };
            })
        }))
    })
};

describe('migrate', () => {
    it('dados já na versão atual ficam iguais', () => {
        expect(migrate(dataset(), SCHEMA_VERSION)).toEqual(dataset());
    });

    it('existe uma migração para cada versão anterior à atual', () => {
        for (let v = 1; v < SCHEMA_VERSION; v++) {
            expect(MIGRATIONS.some((m) => m.from === v)).toBe(true);
        }
    });

    it('as migrações atuais levam os dados v1 até a versão atual sem perder treinos', () => {
        const result = migrate(dataset(), 1);
        expect(result.history.map((e) => e.id)).toEqual(dataset().history.map((e) => e.id));
        expect(Object.keys(result.exerciseData)).toEqual(Object.keys(dataset().exerciseData));
    });

    it('recusa dados de uma versão mais nova', () => {
        expect(() => migrate(dataset(), SCHEMA_VERSION + 1)).toThrow(NewerSchemaError);
    });

    it('acusa uma migração faltando na sequência', () => {
        expect(() => migrate(dataset(), 1, { migrations: [], target: 2 })).toThrow('Falta a migração v1 → v2');
    });

    it('aplica as migrações em ordem, de versão em versão', () => {
        const steps = [
            { from: 2, migrate: (d) => ({ ...d, trail: [...d.trail, 'v2→v3'] }) },
            { from: 1, migrate: (d) => ({ ...d, trail: ['v1→v2'] }) }
        ];
        expect(migrate({}, 1, { migrations: steps, target: 3 }).trail).toEqual(['v1→v2', 'v2→v3']);
        expect(migrate({ trail: [] }, 2, { migrations: steps, target: 3 }).trail).toEqual(['v2→v3']);
    });

    it('não altera os dados originais, nem se a migração der erro', () => {
        const original = dataset();
        const copy = structuredClone(original);
        const broken = { from: 1, migrate: (d) => { d.history.length = 0; throw new Error('bug'); } };
        expect(() => migrate(original, 1, { migrations: [broken], target: 2 })).toThrow('bug');
        migrate(original, 1, { migrations: [EXAMPLE], target: 2 });
        expect(original).toEqual(copy);
    });
});

describe('migração de exemplo (histórico antigo → uma linha por série)', () => {
    const migrated = migrate(dataset(), 1, { migrations: [EXAMPLE], target: 2 });
    const legacy = migrated.history[1].exercises;

    it('converte o treino antigo', () => {
        expect(legacy[0]).toEqual({
            nome: 'Agachamento', note: '', setsDone: 3, setsTotal: 3,
            sets: [{ weight: '35', reps: '8', done: true }, { weight: '35', reps: '8', done: true }, { weight: '35', reps: '6', done: true }]
        });
        expect(legacy[1].sets).toEqual([1, 2, 3].map(() => ({ weight: '', reps: '', done: false })));
    });

    it('não mexe nos treinos já no formato novo nem no resto dos dados', () => {
        expect(migrated.history[0]).toEqual(dataset().history[0]);
        expect(migrated.exerciseData).toEqual(dataset().exerciseData);
        expect(migrated.sessions).toEqual(dataset().sessions);
        expect(migrated.deletedIds).toEqual(dataset().deletedIds);
    });

    it('a sugestão de carga continua igual', () => {
        const ex = { nome: 'Agachamento', series: 3, reps: '6 a 8 repetições' };
        const onlyLegacy = (h) => h.slice(1);
        expect(computeSuggestion(onlyLegacy(migrated.history), 'A', ex))
            .toEqual(computeSuggestion(onlyLegacy(dataset().history), 'A', ex));
        expect(computeSuggestion(migrated.history, 'A', ex)).toEqual(computeSuggestion(dataset().history, 'A', ex));
    });
});

describe('migrateRemote (backup da nuvem)', () => {
    const payload = JSON.stringify({ history: v1['treino.history'], deletedIds: [], exerciseData: {}, exerciseDataUpdatedAt: 5 });

    it('documento sem o campo schema é da versão 1', () => {
        const result = migrateRemote({ payload }, { migrations: [EXAMPLE], target: 2 });
        expect(result.history[1].exercises[0].sets).toHaveLength(3);
        expect(result.exerciseDataUpdatedAt).toBe(5);
    });

    it('recusa backup de uma versão mais nova', () => {
        expect(() => migrateRemote({ payload, schema: SCHEMA_VERSION + 1 })).toThrow(NewerSchemaError);
    });
});
