import { describe, expect, it } from 'vitest';
import { mergeCloudData as merge } from '../../src/cloud.js';

function h(id, extra = {}) {
    return { id, workout: 'A', exercises: [], ...extra };
}

function snapshot(overrides = {}) {
    return { history: [], deletedIds: [], exerciseData: {}, exerciseDataUpdatedAt: 0, ...overrides };
}

describe('mergeCloudData', () => {
    it('sem dados na nuvem, mantém os dados locais', () => {
        const local = snapshot({ history: [h(1)] });
        expect(merge(local, null)).toEqual(local);
    });

    it('junta o histórico dos dois lados, do mais novo para o mais antigo', () => {
        const result = merge(
            snapshot({ history: [h(3), h(1)] }),
            snapshot({ history: [h(4), h(2), h(1)] })
        );
        expect(result.history.map((e) => e.id)).toEqual([4, 3, 2, 1]);
    });

    it('com o mesmo id nos dois lados, fica a versão local', () => {
        const result = merge(
            snapshot({ history: [h(1, { workoutNote: 'local' })] }),
            snapshot({ history: [h(1, { workoutNote: 'nuvem' })] })
        );
        expect(result.history).toEqual([h(1, { workoutNote: 'local' })]);
    });

    it('treinos apagados em qualquer lado não voltam', () => {
        const result = merge(
            snapshot({ history: [h(3), h(2)], deletedIds: [1] }),
            snapshot({ history: [h(2), h(1)], deletedIds: [3] })
        );
        expect(result.history.map((e) => e.id)).toEqual([2]);
        expect(result.deletedIds.sort()).toEqual([1, 3]);
    });

    it('ignora entradas sem id', () => {
        const result = merge(snapshot({ history: [h(1), { workout: 'A' }, null] }), snapshot());
        expect(result.history.map((e) => e.id)).toEqual([1]);
    });

    it('limita o histórico aos 50 treinos mais recentes', () => {
        const local = snapshot({ history: Array.from({ length: 40 }, (_, i) => h(i + 1)) });
        const remote = snapshot({ history: Array.from({ length: 40 }, (_, i) => h(i + 41)) });
        const result = merge(local, remote);
        expect(result.history).toHaveLength(50);
        expect(result.history[0].id).toBe(80);
        expect(result.history[49].id).toBe(31);
    });

    it('limita a lista de apagados aos 200 últimos', () => {
        const ids = Array.from({ length: 250 }, (_, i) => i + 1);
        const result = merge(snapshot({ deletedIds: ids }), snapshot());
        expect(result.deletedIds).toHaveLength(200);
        expect(result.deletedIds[0]).toBe(51);
    });

    it('últimos valores: o lado editado mais recentemente vence, sem perder exercícios', () => {
        const local = snapshot({
            exerciseData: { 'A|Supino': { note: 'local' }, 'A|Remada': { note: 'só local' } },
            exerciseDataUpdatedAt: 100
        });
        const remote = snapshot({
            exerciseData: { 'A|Supino': { note: 'nuvem' }, 'B|Rosca': { note: 'só nuvem' } },
            exerciseDataUpdatedAt: 200
        });
        const result = merge(local, remote);
        expect(result.exerciseData).toEqual({
            'A|Supino': { note: 'nuvem' },
            'A|Remada': { note: 'só local' },
            'B|Rosca': { note: 'só nuvem' }
        });
        expect(result.exerciseDataUpdatedAt).toBe(200);
    });

    it('últimos valores: com o local mais recente (ou empate), o local vence', () => {
        const local = snapshot({ exerciseData: { 'A|Supino': { note: 'local' } }, exerciseDataUpdatedAt: 200 });
        const remote = snapshot({ exerciseData: { 'A|Supino': { note: 'nuvem' } }, exerciseDataUpdatedAt: 200 });
        expect(merge(local, remote).exerciseData['A|Supino'].note).toBe('local');
    });

    it('aceita dados da nuvem com campos faltando', () => {
        const result = merge(snapshot({ history: [h(1)] }), {});
        expect(result.history.map((e) => e.id)).toEqual([1]);
        expect(result.deletedIds).toEqual([]);
    });
});
