import { describe, expect, it } from 'vitest';
import { mergeData as merge } from '../../src/sync.js';
import { rootToProfile } from '../../src/cloud.js';

function h(id, extra = {}) {
    return { id, date: `2026-10-${String(id).padStart(2, '0')}T10:00:00.000Z`, workoutId: 'A', exercises: [], updatedAt: 0, ...extra };
}

function data(overrides = {}) {
    return { profile: null, plans: {}, history: [], deletedIds: [], lastValues: {}, ...overrides };
}

const profile = (extra) => ({ nome: 'Ana', titulo: '', activePlanId: 'p1', lastSessionAt: null, updatedAt: 0, ...extra });

describe('mergeData: histórico', () => {
    it('sem dados na nuvem, mantém os dados locais', () => {
        const local = data({ history: [h('01')] });
        expect(merge(local, null)).toEqual(local);
    });

    it('junta os treinos dos dois lados, do mais novo para o mais antigo, sem limite', () => {
        const local = data({ history: Array.from({ length: 40 }, (_, i) => h(String(i + 1).padStart(2, '0'))) });
        const remote = data({ history: [h('41'), h('42'), h('03')] });
        const result = merge(local, remote);
        expect(result.history).toHaveLength(42);
        expect(result.history.slice(0, 3).map((e) => e.id)).toEqual(['42', '41', '40']);
    });

    it('com o mesmo id nos dois lados, vence o editado por último (empate: o local)', () => {
        const local = data({ history: [h('01', { workoutNote: 'local', updatedAt: 5 })] });
        expect(merge(local, data({ history: [h('01', { workoutNote: 'nuvem', updatedAt: 5 })] })).history[0].workoutNote).toBe('local');
        expect(merge(local, data({ history: [h('01', { workoutNote: 'nuvem', updatedAt: 9 })] })).history[0].workoutNote).toBe('nuvem');
    });

    it('treinos apagados em qualquer lado não voltam', () => {
        const result = merge(
            data({ history: [h('03'), h('02')], deletedIds: ['01'] }),
            data({ history: [h('02'), h('01')], deletedIds: ['03'] })
        );
        expect(result.history.map((e) => e.id)).toEqual(['02']);
        expect(result.deletedIds.sort()).toEqual(['01', '03']);
    });
});

describe('mergeData: fichas e últimos valores', () => {
    it('cada ficha fica com a versão editada por último, sem perder as que só existem de um lado', () => {
        const result = merge(
            data({ plans: { p1: { id: 'p1', nome: 'local', updatedAt: 10 }, p2: { id: 'p2', nome: 'só local', updatedAt: 1 } } }),
            data({ plans: { p1: { id: 'p1', nome: 'nuvem', updatedAt: 20 }, p3: { id: 'p3', nome: 'só nuvem', updatedAt: 1 } } })
        );
        expect(Object.values(result.plans).map((p) => p.nome).sort()).toEqual(['nuvem', 'só local', 'só nuvem']);
    });

    it('ficha apagada num celular fica apagada, a não ser que tenha sido editada depois no outro', () => {
        const deleted = { id: 'p1', nome: 'Ficha', deleted: true, updatedAt: 20 };
        expect(merge(data({ plans: { p1: { id: 'p1', nome: 'Ficha', updatedAt: 10 } } }), data({ plans: { p1: deleted } })).plans.p1.deleted).toBe(true);
        expect(merge(data({ plans: { p1: { id: 'p1', nome: 'Ficha', updatedAt: 30 } } }), data({ plans: { p1: deleted } })).plans.p1.deleted).toBeUndefined();
    });

    it('últimos valores: por exercício, vence o editado por último (empate: o local)', () => {
        const result = merge(
            data({ lastValues: { 'A|supino': { note: 'local', updatedAt: 100 }, 'A|remada': { note: 'só local', updatedAt: 1 }, 'B|rosca': { note: 'local', updatedAt: 50 } } }),
            data({ lastValues: { 'A|supino': { note: 'nuvem', updatedAt: 200 }, 'C|leg': { note: 'só nuvem', updatedAt: 1 }, 'B|rosca': { note: 'nuvem', updatedAt: 50 } } })
        );
        expect(Object.fromEntries(Object.entries(result.lastValues).map(([k, v]) => [k, v.note]))).toEqual({
            'A|supino': 'nuvem', 'A|remada': 'só local', 'B|rosca': 'local', 'C|leg': 'só nuvem'
        });
    });
});

describe('mergeData: perfil', () => {
    it('celular sem perfil (primeiro acesso) recebe o perfil da nuvem', () => {
        expect(merge(data(), data({ profile: profile() })).profile).toEqual(profile());
    });

    it('vence o editado por último, mas o último treino é sempre o mais recente', () => {
        const result = merge(
            data({ profile: profile({ nome: 'local', updatedAt: 1, lastSessionAt: '2026-10-07T10:00:00.000Z' }) }),
            data({ profile: profile({ nome: 'nuvem', updatedAt: 2, lastSessionAt: '2026-10-01T10:00:00.000Z' }) })
        );
        expect(result.profile).toMatchObject({ nome: 'nuvem', lastSessionAt: '2026-10-07T10:00:00.000Z' });
    });

    it('a lista de personais vem sempre da nuvem', () => {
        const result = merge(
            data({ profile: profile({ updatedAt: 5, trainers: { velho: true } }) }),
            data({ profile: profile({ updatedAt: 1, trainers: { paulo: true } }) })
        );
        expect(result.profile.trainers).toEqual({ paulo: true });
    });
});

describe('rootToProfile', () => {
    it('documento sem perfil (backup v1 ou primeiro acesso não terminado) não tem perfil', () => {
        expect(rootToProfile(null)).toBeNull();
        expect(rootToProfile({ payload: '{}', schema: 1 })).toBeNull();
        expect(rootToProfile({ schema: 2 })).toBeNull();
    });

    it('lê o perfil gravado pelo app', () => {
        expect(rootToProfile({ schema: 2, nome: 'Ana', titulo: 'T', activePlanId: 'p1', lastSessionAt: null, profileUpdatedAt: 3, trainers: { paulo: true } }))
            .toEqual({ nome: 'Ana', titulo: 'T', activePlanId: 'p1', lastSessionAt: null, updatedAt: 3, trainers: { paulo: true } });
    });
});
