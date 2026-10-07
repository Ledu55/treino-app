import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, NewerSchemaError, SCHEMA_VERSION, V1_PLAN_ID, migrate } from '../../src/migrations.js';
import { migrateRemote } from '../../src/cloud.js';
import { computeSuggestion, getSetValues } from '../../src/progression.js';
import { getLibraryExercise, resolveExercise } from '../../src/data/library.js';
import { getTemplate } from '../../src/data/templates.js';
// Código da v1, congelado: a referência do que a pessoa via antes da migração
import * as v1code from './fixtures/v1/progression.js';
import { treinos as v1Treinos, workoutNames as v1Names } from './fixtures/v1/treinos.js';

const v1 = JSON.parse(readFileSync(new URL('./fixtures/dados-v1.json', import.meta.url), 'utf8'));
const dataset = () => structuredClone({
    exerciseData: v1['treino.exerciseData'],
    sessions: v1['treino.session'],
    history: v1['treino.history'],
    deletedIds: v1['treino.deletedIds'],
    cloudMeta: v1['treino.cloudMeta'],
    lastWorkout: v1['treino.lastWorkout']
});

describe('migrate', () => {
    it('existe uma migração para cada versão anterior à atual', () => {
        for (let v = 1; v < SCHEMA_VERSION; v++) {
            expect(MIGRATIONS.some((m) => m.from === v)).toBe(true);
        }
    });

    it('dados já na versão atual ficam iguais', () => {
        const current = migrate(dataset(), 1);
        expect(migrate(current, SCHEMA_VERSION)).toEqual(current);
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
        migrate(original, 1);
        expect(original).toEqual(copy);
    });
});

describe('v1 → v2', () => {
    const migrated = migrate(dataset(), 1, { target: 2 });
    const plan = migrated.plans[V1_PLAN_ID];
    const workout = (key) => plan.treinos.find((t) => t.id === key);

    it('a ficha A/B/C/D vira a primeira ficha, ativa, com os mesmos exercícios, séries, reps e descanso', () => {
        expect(Object.keys(migrated.plans)).toEqual([V1_PLAN_ID]);
        expect(migrated.profile).toMatchObject({ titulo: 'Treino do Meu Benzinho', activePlanId: V1_PLAN_ID });
        expect(plan.treinos.map((t) => [t.id, t.nome])).toEqual(Object.entries(v1Names));
        for (const [key, list] of Object.entries(v1Treinos)) {
            const exercises = workout(key).exercicios.map(resolveExercise);
            expect(exercises.map((ex) => [ex.nome, ex.series, ex.reps, ex.descanso, ex.incremento, ex.img]))
                .toEqual(list.map((ex) => [ex.nome, ex.series, ex.reps, ex.descanso, ex.incremento || 2.5, ex.img]));
        }
    });

    it('todos os exercícios da ficha estão na biblioteca, e o modelo A/B/C/D é igual à ficha migrada', () => {
        plan.treinos.forEach((t) => t.exercicios.forEach((ex) => expect(getLibraryExercise(ex.exerciseId)).not.toBeNull()));
        const template = getTemplate('abcd');
        expect(template.treinos.map((t) => ({ nome: t.nome, exercicios: t.exercicios })))
            .toEqual(plan.treinos.map((t) => ({ nome: t.nome, exercicios: t.exercicios })));
    });

    it('a sugestão de carga continua igual para todos os exercícios', () => {
        let compared = 0;
        for (const [key, list] of Object.entries(v1Treinos)) {
            for (const v1ex of list) {
                const ex = resolveExercise(workout(key).exercicios.find((e) => getLibraryExercise(e.exerciseId).nome === v1ex.nome));
                const before = v1code.computeSuggestion(dataset().history, key, v1ex);
                expect(computeSuggestion(migrated.history, key, ex)).toEqual(before);
                if (before) compared++;
            }
        }
        // O fixture tem sugestões de verdade (não só null = null)
        expect(compared).toBeGreaterThanOrEqual(4);
    });

    it('os valores mostrados nos campos de carga e reps continuam iguais', () => {
        for (const [key, list] of Object.entries(v1Treinos)) {
            for (const v1ex of list) {
                const saved = dataset().exerciseData[`${key}|${v1ex.nome}`] || {};
                const exerciseId = workout(key).exercicios.find((e) => getLibraryExercise(e.exerciseId).nome === v1ex.nome).exerciseId;
                const now = migrated.lastValues[`${key}|${exerciseId}`] || {};
                for (let w = 0; w < v1ex.series; w++) {
                    expect(getSetValues(now, w)).toEqual(v1code.getSetValues(saved, w));
                }
                expect(now.note || '').toBe(saved.note || '');
            }
        }
        expect(migrated.lastValues['A|stiff'].sets).toEqual([
            { weight: '30', reps: '10' }, { weight: '30', reps: '10' }, { weight: '30', reps: '9' }
        ]);
        expect(migrated.lastValues['A|agachamento'].updatedAt).toBe(v1['treino.cloudMeta'].exerciseDataUpdatedAt);
    });

    it('o histórico mantém todos os treinos, na mesma ordem, com uma linha por série', () => {
        const before = dataset().history;
        expect(migrated.history.map((e) => e.id)).toEqual(before.map((e) => String(e.id)));
        migrated.history.forEach((entry, i) => {
            expect(entry.workoutId).toBe(before[i].workout);
            expect(entry.workoutNome).toBe(v1Names[before[i].workout]);
            expect(entry.planId).toBe(V1_PLAN_ID);
            expect([entry.doneCount, entry.totalCount, entry.workoutNote]).toEqual([before[i].doneCount, before[i].totalCount, before[i].workoutNote]);
            entry.exercises.forEach((ex, j) => {
                const old = before[i].exercises[j];
                expect(ex.nome).toBe(old.nome);
                expect(ex.sets).toEqual(v1code.historySetsFor(old));
                expect([ex.setsDone, ex.setsTotal]).toEqual([old.setsDone, old.setsTotal]);
            });
        });
        // Treino antigo, feito pela metade: as séries mostram a carga e reps de antes
        const legPress = migrated.history.at(-1).exercises[0];
        expect(legPress).toMatchObject({ exerciseId: 'leg-press', setsDone: 2, setsTotal: 3 });
        expect(legPress.sets[0]).toEqual({ weight: '80', reps: '10', done: false });
    });

    it('exercício que saiu da ficha ganha um id próprio e continua no histórico', () => {
        const entry = migrated.history.find((e) => e.workoutId === 'B');
        expect(entry.exercises[1]).toMatchObject({ exerciseId: 'v1-supino-reto', nome: 'Supino Reto', note: 'saiu da ficha' });
        expect(migrated.lastValues['B|v1-supino-reto'].sets).toEqual([{ weight: '20', reps: '10' }, { weight: '20', reps: '8' }]);
    });

    it('treino em andamento, último treino escolhido e apagados passam para os novos ids', () => {
        expect(migrated.sessions.A).toEqual({ ...dataset().sessions.A, sets: { agachamento: [true, true, true, false, false] } });
        expect(migrated.sessions.C.sets).toEqual({});
        expect(migrated.lastWorkout).toEqual({ key: 'A' });
        expect(migrated.deletedIds).toEqual(['1755300000000']);
        expect(migrated.profile.lastSessionAt).toBe(dataset().history[0].date);
    });

    it('o formato antigo dos últimos valores sai dos dados, e o backup recomeça do zero', () => {
        expect(migrated.exerciseData).toBeUndefined();
        expect(migrated.cloudMeta).toEqual({ lastSyncAt: v1['treino.cloudMeta'].lastSyncAt });
    });

    it('migrar os mesmos dados de novo dá o mesmo resultado (ids fixos)', () => {
        expect(migrate(dataset(), 1, { target: 2 })).toEqual(migrated);
    });

    it('quem nunca usou o app fica sem ficha, para passar pelo primeiro acesso', () => {
        const empty = migrate({}, 1, { target: 2 });
        expect(empty.profile).toBeNull();
        expect(empty.plans).toEqual({});
        expect(empty.history).toEqual([]);
    });
});

describe('migrateRemote (backup v1 na nuvem)', () => {
    const remoteV1 = {
        history: v1['treino.history'],
        deletedIds: v1['treino.deletedIds'],
        exerciseData: v1['treino.exerciseData'],
        exerciseDataUpdatedAt: v1['treino.cloudMeta'].exerciseDataUpdatedAt
    };
    const payload = JSON.stringify(remoteV1);

    it('documento sem o campo schema é da versão 1, e vira os mesmos dados que a migração do celular', () => {
        const remote = migrateRemote({ payload });
        const local = migrate(dataset(), 1);
        expect(remote.history).toEqual(local.history);
        expect(remote.lastValues).toEqual(local.lastValues);
        expect(remote.plans).toEqual(local.plans);
        expect(remote.profile).toEqual(local.profile);
        expect(remote.deletedIds).toEqual(local.deletedIds);
    });

    it('recusa backup de uma versão mais nova', () => {
        expect(() => migrateRemote({ payload, schema: SCHEMA_VERSION + 1 })).toThrow(NewerSchemaError);
    });
});
