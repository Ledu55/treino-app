// @vitest-environment jsdom
// Modo personal (item 12): código de convite, ficha só leitura para o aluno, aviso de ficha
// atualizada e o que vai para a nuvem
import { beforeEach, describe, expect, it } from 'vitest';
import { rootToProfile } from '../../src/cloud.js';
import {
    INVITE_CODE_LENGTH, isInviteCode, lastSessionText, linkedTrainers, newInviteCode, normalizeInviteCode, planTrainer
} from '../../src/personal.js';
import { KEYS } from '../../src/storage.js';
import {
    completeOnboarding, dismissTrainerNotice, duplicatePlan, getState, initStore, newPlan, notifyTrainerPlans,
    setTrainerLinks, updatePlan
} from '../../src/store.js';
import { mergeData, trainerPlanUpdates } from '../../src/sync.js';

const PAULO = { trainers: { paulo: true }, trainerNames: { paulo: 'Paulo' } };

describe('código de convite', () => {
    it('tem 6 letras e números, sem os que se confundem (0/O, 1/I)', () => {
        for (let i = 0; i < 200; i++) {
            const code = newInviteCode();
            expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
            expect(isInviteCode(code)).toBe(true);
        }
        expect(INVITE_CODE_LENGTH).toBe(6);
    });

    it('aceita o que a pessoa digita com minúsculas, espaços e traços', () => {
        expect(normalizeInviteCode(' k7p-2qx ')).toBe('K7P2QX');
        expect(isInviteCode(normalizeInviteCode('k7p 2qx'))).toBe(true);
        expect(isInviteCode('K7P2Q')).toBe(false);
        expect(isInviteCode('K7P2Q0')).toBe(false);
    });
});

describe('personais com acesso', () => {
    it('só os marcados como true, com o nome (ou "Personal")', () => {
        const profile = { trainers: { paulo: true, carla: false, zeca: true }, trainerNames: { paulo: 'Paulo' } };
        expect(linkedTrainers(profile)).toEqual([{ uid: 'paulo', nome: 'Paulo' }, { uid: 'zeca', nome: 'Personal' }]);
        expect(linkedTrainers(null)).toEqual([]);
        expect(linkedTrainers({})).toEqual([]);
    });

    it('a ficha do personal é só leitura enquanto ele tem acesso', () => {
        const plan = { id: 'p', createdBy: 'paulo' };
        expect(planTrainer(plan, PAULO)).toEqual({ uid: 'paulo', nome: 'Paulo' });
        expect(planTrainer(plan, { trainers: { paulo: false } })).toBeNull();
        expect(planTrainer(plan, {})).toBeNull();
        expect(planTrainer({ id: 'p', createdBy: null }, PAULO)).toBeNull();
    });
});

describe('último treino do aluno', () => {
    const now = new Date(2026, 9, 9, 20, 0);
    it('conta em dias do calendário', () => {
        expect(lastSessionText(null, now)).toBe('Nenhum treino ainda');
        expect(lastSessionText(new Date(2026, 9, 9, 7, 0).toISOString(), now)).toBe('Último treino: hoje');
        expect(lastSessionText(new Date(2026, 9, 8, 23, 0).toISOString(), now)).toBe('Último treino: ontem');
        expect(lastSessionText(new Date(2026, 9, 2, 10, 0).toISOString(), now)).toBe('Último treino: há 7 dias');
    });
});

describe('aviso "Ficha atualizada pelo seu personal"', () => {
    const local = { a: { id: 'a', nome: 'A', updatedBy: 'paulo', updatedAt: 1 }, b: { id: 'b', nome: 'B', updatedBy: null, updatedAt: 1 } };

    it('avisa das fichas que chegaram mudadas pelo personal', () => {
        const remote = {
            a: { id: 'a', nome: 'A ajustada', updatedBy: 'paulo', updatedAt: 2 },
            n: { id: 'n', nome: 'Nova', updatedBy: 'paulo', updatedAt: 2 }
        };
        const merged = mergeData({ plans: local }, { plans: remote }).plans;
        expect(trainerPlanUpdates(local, remote, merged, 'ana').sort()).toEqual(['a', 'n']);
    });

    it('não avisa do que a própria pessoa gravou, do que não mudou, do que perdeu na mesclagem nem de ficha apagada', () => {
        const remote = {
            a: { ...local.a },
            b: { id: 'b', nome: 'B', updatedBy: 'ana', updatedAt: 2 },
            c: { id: 'c', nome: 'C', updatedBy: 'paulo', updatedAt: 2, deleted: true }
        };
        const newerLocal = { ...local, a: { ...local.a, updatedAt: 9 } };
        const remoteOlder = { a: { id: 'a', nome: 'Velha', updatedBy: 'paulo', updatedAt: 5 } };
        expect(trainerPlanUpdates(local, remote, mergeData({ plans: local }, { plans: remote }).plans, 'ana')).toEqual([]);
        expect(trainerPlanUpdates(newerLocal, remoteOlder, mergeData({ plans: newerLocal }, { plans: remoteOlder }).plans, 'ana')).toEqual([]);
    });
});

describe('perfil na nuvem', () => {
    it('lê o modo personal e os nomes dos personais', () => {
        expect(rootToProfile({ schema: 2, nome: 'Ana', profileUpdatedAt: 1, isTrainer: true, ...PAULO }))
            .toMatchObject({ isTrainer: true, ...PAULO });
        expect(rootToProfile({ schema: 2, nome: 'Ana', profileUpdatedAt: 1, isTrainer: false })).not.toHaveProperty('isTrainer');
    });

    it('a lista de personais e os nomes vêm sempre da nuvem', () => {
        const profile = { nome: 'Ana', updatedAt: 5, trainers: { velho: true }, trainerNames: { velho: 'Velho' } };
        const result = mergeData({ profile }, { profile: { nome: 'Ana', updatedAt: 1, ...PAULO } });
        expect(result.profile).toMatchObject(PAULO);
    });
});

describe('fichas no celular do aluno', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(KEYS.schemaVersion, JSON.stringify({ version: 2 }));
        expect(initStore()).toBeNull();
        completeOnboarding({ nome: 'Ana', templateId: null });
    });

    function addTrainerPlan() {
        const plan = newPlan({ templateId: 'corpo-inteiro', by: 'paulo' });
        getState().plans[plan.id] = plan;
        return plan;
    }

    it('a ficha do personal não muda pelo editor; a cópia é da pessoa e muda', () => {
        setTrainerLinks(PAULO.trainers, PAULO.trainerNames);
        const plan = addTrainerPlan();
        expect(plan).toMatchObject({ createdBy: 'paulo', updatedBy: 'paulo' });
        updatePlan(plan.id, (draft) => { draft.nome = 'Mudei'; });
        expect(getState().plans[plan.id].nome).toBe(plan.nome);

        const copyId = duplicatePlan(plan.id);
        expect(getState().plans[copyId]).toMatchObject({ nome: `${plan.nome} (cópia)`, createdBy: null, updatedBy: null });
        expect(getState().plans[copyId].treinos.map((t) => t.id)).not.toEqual(plan.treinos.map((t) => t.id));
        updatePlan(copyId, (draft) => { draft.nome = 'Minha'; });
        expect(getState().plans[copyId].nome).toBe('Minha');
    });

    it('sem o personal na lista, a ficha volta a ser da pessoa', () => {
        const plan = addTrainerPlan();
        updatePlan(plan.id, (draft) => { draft.nome = 'Agora é minha'; });
        expect(getState().plans[plan.id].nome).toBe('Agora é minha');
    });

    it('a lista de personais não conta como edição do perfil (não vai para a nuvem)', () => {
        const before = getState().profile.updatedAt;
        const dirty = structuredClone(getState().cloudMeta.dirty);
        setTrainerLinks(PAULO.trainers, PAULO.trainerNames);
        expect(getState().profile).toMatchObject({ ...PAULO, updatedAt: before });
        expect(getState().cloudMeta.dirty).toEqual(dirty);
        expect(JSON.parse(localStorage.getItem(KEYS.profile))).toMatchObject(PAULO);
    });

    it('o aviso fica guardado até ser fechado', () => {
        notifyTrainerPlans(['a', 'b']);
        notifyTrainerPlans(['b', 'c']);
        expect(getState().trainerNotice).toEqual(['a', 'b', 'c']);
        expect(JSON.parse(localStorage.getItem(KEYS.trainerNotice))).toEqual(['a', 'b', 'c']);
        dismissTrainerNotice();
        expect(JSON.parse(localStorage.getItem(KEYS.trainerNotice))).toEqual([]);
    });
});
