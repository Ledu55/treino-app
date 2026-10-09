// Testes das regras do Firestore. Precisam do emulador rodando: npm test (ou npm run emulators).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
    Timestamp, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where
} from 'firebase/firestore';

let env;

beforeAll(async () => {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080').split(':');
    env = await initializeTestEnvironment({
        projectId: 'demo-treino',
        firestore: {
            host,
            port: Number(port),
            rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
        }
    });
});

afterAll(() => env && env.cleanup());

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days) => Timestamp.fromMillis(Date.now() + days * DAY);

// Ana é aluna; Paulo é o personal dela; Bia é outra pessoa qualquer. Fichas da Ana: p1 é dela,
// pp foi montada pelo Paulo e pc por Carlos, um personal que ela já removeu.
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users/ana'), { nome: 'Ana', schema: 2, trainers: { paulo: true }, trainerNames: { paulo: 'Paulo' } });
        await setDoc(doc(db, 'users/ana/plans/p1'), { nome: 'Ficha', treinos: [], createdBy: null, updatedBy: null });
        await setDoc(doc(db, 'users/ana/plans/pp'), { nome: 'Do Paulo', treinos: [], createdBy: 'paulo', updatedBy: 'paulo', updatedAt: 1 });
        await setDoc(doc(db, 'users/ana/plans/pc'), { nome: 'Do Carlos', treinos: [], createdBy: 'carlos', updatedBy: 'carlos', updatedAt: 1 });
        await setDoc(doc(db, 'users/ana/sessions/s1'), { date: '2026-10-07', exercises: [] });
        await setDoc(doc(db, 'users/ana/state/current'), { values: {} });
        await setDoc(doc(db, 'users/bia'), { nome: 'Bia', schema: 2 });
        await setDoc(doc(db, 'invites/PAULO2'), { trainerUid: 'paulo', trainerNome: 'Paulo', expiresAt: inDays(7) });
        await setDoc(doc(db, 'invites/VENCID'), { trainerUid: 'paulo', trainerNome: 'Paulo', expiresAt: inDays(-1) });
    });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
// Ficha gravada pelo personal: createdBy e updatedBy com o uid dele
const plan = (updatedBy, createdBy = updatedBy) => ({ nome: 'Ficha nova', treinos: [], createdBy, updatedBy, updatedAt: 2 });
const unlink = (uid) => ({ [`trainers.${uid}`]: deleteField(), [`trainerNames.${uid}`]: deleteField() });
const invite = (trainerUid, extra = {}) => ({ trainerUid, trainerNome: 'Paulo', expiresAt: inDays(7), createdAt: serverTimestamp(), ...extra });

describe('o aluno', () => {
    it('lê e grava o perfil, as fichas, os treinos e os últimos valores', async () => {
        const db = as('ana');
        for (const path of ['users/ana', 'users/ana/plans/p1', 'users/ana/sessions/s1', 'users/ana/state/current']) {
            await assertSucceeds(getDoc(doc(db, path)));
            await assertSucceeds(setDoc(doc(db, path), { a: 1 }, { merge: true }));
        }
        await assertSucceeds(getDocs(collection(db, 'users/ana/sessions')));
    });

    it('apaga treinos e fichas', async () => {
        const db = as('ana');
        await assertSucceeds(deleteDoc(doc(db, 'users/ana/sessions/s1')));
        await assertSucceeds(deleteDoc(doc(db, 'users/ana/plans/p1')));
    });

    it('lista e apaga todos os próprios documentos (excluir conta)', async () => {
        const db = as('ana');
        for (const name of ['plans', 'sessions', 'state']) {
            await assertSucceeds(getDocs(collection(db, `users/ana/${name}`)));
        }
        for (const path of ['users/ana/plans/p1', 'users/ana/plans/pp', 'users/ana/sessions/s1', 'users/ana/state/current', 'users/ana']) {
            await assertSucceeds(deleteDoc(doc(db, path)));
        }
    });

    it('não muda a estrutura de uma ficha do personal, mas pode apagá-la', async () => {
        const db = as('ana');
        const ref = doc(db, 'users/ana/plans/pp');
        await assertFails(setDoc(ref, { ...plan('ana', 'paulo'), nome: 'Mudei' }));
        await assertFails(updateDoc(ref, { treinos: [{ id: 'x', nome: 'Treino A', exercicios: [] }] }));
        await assertFails(updateDoc(ref, { createdBy: null }));
        // O que o app envia ao apagar (cloud.js → push)
        await assertSucceeds(setDoc(ref, { deleted: true, updatedAt: 3, syncedAt: serverTimestamp() }, { merge: true }));
        await assertSucceeds(deleteDoc(ref));
    });

    it('a ficha de um personal removido volta a ser dela', async () => {
        await assertSucceeds(updateDoc(doc(as('ana'), 'users/ana/plans/pc'), { nome: 'Agora é minha' }));
        await updateDoc(doc(as('ana'), 'users/ana'), unlink('paulo'));
        await assertSucceeds(updateDoc(doc(as('ana'), 'users/ana/plans/pp'), { nome: 'Agora é minha' }));
    });

    it('dá acesso a um personal (código de convite) e remove', async () => {
        const db = as('ana');
        await assertSucceeds(setDoc(doc(db, 'users/ana'), { trainers: { carla: true }, trainerNames: { carla: 'Carla' } }, { merge: true }));
        await assertSucceeds(updateDoc(doc(db, 'users/ana'), unlink('carla')));
    });

    it('cria tudo na primeira sincronização', async () => {
        const db = as('carla');
        await assertSucceeds(setDoc(doc(db, 'users/carla'), { schema: 2 }));
        await assertSucceeds(setDoc(doc(db, 'users/carla/plans/x'), plan(null)));
        await assertSucceeds(setDoc(doc(db, 'users/carla/sessions/x'), { date: '2026-10-07' }));
    });

    it('é o único que grava a lista de personais', async () => {
        await assertSucceeds(updateDoc(doc(as('ana'), 'users/ana'), { 'trainers.paulo': false }));
        await assertFails(updateDoc(doc(as('paulo'), 'users/ana'), { 'trainers.paulo': true }));
        await assertFails(updateDoc(doc(as('bia'), 'users/ana'), { 'trainers.bia': true }));
    });
});

describe('o personal autorizado', () => {
    it('lê o perfil, as fichas e o histórico', async () => {
        const db = as('paulo');
        await assertSucceeds(getDoc(doc(db, 'users/ana')));
        await assertSucceeds(getDoc(doc(db, 'users/ana/plans/p1')));
        await assertSucceeds(getDocs(collection(db, 'users/ana/sessions')));
    });

    it('lista os próprios alunos', async () => {
        const db = as('paulo');
        await assertSucceeds(getDocs(query(collection(db, 'users'), where('trainers.paulo', '==', true))));
    });

    it('cria fichas em nome próprio (createdBy e updatedBy)', async () => {
        const db = as('paulo');
        await assertSucceeds(setDoc(doc(db, 'users/ana/plans/p2'), plan('paulo')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p3'), plan('paulo', 'ana')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p3'), plan('paulo', null)));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p3'), plan('ana', 'paulo')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p3'), { ...plan('paulo'), deleted: true }));
    });

    it('edita só as fichas que ele montou', async () => {
        const db = as('paulo');
        await assertSucceeds(setDoc(doc(db, 'users/ana/plans/pp'), { ...plan('paulo'), nome: 'Ajustada' }));
        // A ficha da própria aluna e a de outro personal ele só vê
        await assertFails(setDoc(doc(db, 'users/ana/plans/p1'), plan('paulo')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/pc'), plan('paulo')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/pp'), plan('paulo', 'ana')));
    });

    it('não edita uma ficha que a aluna apagou', async () => {
        await setDoc(doc(as('ana'), 'users/ana/plans/pp'), { deleted: true, updatedAt: 3 }, { merge: true });
        await assertFails(setDoc(doc(as('paulo'), 'users/ana/plans/pp'), plan('paulo')));
    });

    it('não apaga fichas nem treinos, não grava treinos e não altera o perfil', async () => {
        const db = as('paulo');
        await assertFails(deleteDoc(doc(db, 'users/ana/plans/p1')));
        await assertFails(deleteDoc(doc(db, 'users/ana/plans/pp')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/pp'), { deleted: true }, { merge: true }));
        await assertFails(deleteDoc(doc(db, 'users/ana/sessions/s1')));
        await assertFails(setDoc(doc(db, 'users/ana/sessions/s1'), { deleted: true }));
        await assertFails(setDoc(doc(db, 'users/ana/sessions/s2'), { date: '2026-10-07' }));
        await assertFails(updateDoc(doc(db, 'users/ana'), { nome: 'Outra' }));
    });

    it('não lê os últimos valores digitados', async () => {
        await assertFails(getDoc(doc(as('paulo'), 'users/ana/state/current')));
    });

    it('sai da lista da aluna, sem mexer em mais nada', async () => {
        await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'users/ana'), { 'trainers.carla': true, 'trainerNames.carla': 'Carla' }));
        const db = as('paulo');
        await assertFails(updateDoc(doc(db, 'users/ana'), unlink('carla')));
        await assertFails(updateDoc(doc(db, 'users/ana'), { ...unlink('paulo'), nome: 'Outra' }));
        await assertFails(updateDoc(doc(db, 'users/ana'), { 'trainerNames.paulo': 'Paulo Silva' }));
        await assertSucceeds(updateDoc(doc(db, 'users/ana'), unlink('paulo')));
        await assertFails(getDoc(doc(db, 'users/ana')));
    });
});

describe('o personal removido', () => {
    it('perde o acesso assim que o aluno o tira da lista', async () => {
        await updateDoc(doc(as('ana'), 'users/ana'), unlink('paulo'));
        const db = as('paulo');
        await assertFails(getDoc(doc(db, 'users/ana')));
        await assertFails(getDoc(doc(db, 'users/ana/plans/p1')));
        await assertFails(getDocs(collection(db, 'users/ana/sessions')));
        // A consulta dos alunos continua permitida, mas a Ana não aparece mais
        expect((await getDocs(query(collection(db, 'users'), where('trainers.paulo', '==', true)))).size).toBe(0);
        await assertFails(setDoc(doc(db, 'users/ana/plans/p2'), plan('paulo')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/pp'), plan('paulo')));
    });

    it('também perde com trainers.<uid> = false', async () => {
        await updateDoc(doc(as('ana'), 'users/ana'), { 'trainers.paulo': false });
        await assertFails(getDoc(doc(as('paulo'), 'users/ana/plans/p1')));
    });
});

describe('convites', () => {
    it('o personal cria convites válidos em nome próprio', async () => {
        const db = as('paulo');
        await assertSucceeds(setDoc(doc(db, 'invites/K7P2QX'), invite('paulo')));
        await assertFails(setDoc(doc(db, 'invites/K7P2QY'), invite('carla')));
        await assertFails(setDoc(doc(db, 'invites/K7P2QZ'), invite('paulo', { expiresAt: inDays(30) })));
        await assertFails(setDoc(doc(db, 'invites/K7P2QW'), invite('paulo', { trainers: { bia: true } })));
        await assertFails(setDoc(doc(db, 'invites/abc'), invite('paulo')));
        await assertFails(setDoc(doc(db, 'invites/K7P2Q0'), invite('paulo')));
    });

    it('não sobrescreve nem altera um convite que já existe', async () => {
        await assertFails(setDoc(doc(as('bia'), 'invites/PAULO2'), invite('bia')));
        await assertFails(setDoc(doc(as('paulo'), 'invites/PAULO2'), invite('paulo')));
    });

    it('quem tem o código lê o convite enquanto ele vale', async () => {
        const db = as('bia');
        await assertSucceeds(getDoc(doc(db, 'invites/PAULO2')));
        await assertFails(getDoc(doc(db, 'invites/VENCID')));
        await assertFails(getDoc(doc(db, 'invites/NAOEXI')));
        await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'invites/PAULO2')));
    });

    it('ninguém lista os convites dos outros; o personal lista e apaga os dele', async () => {
        await assertFails(getDocs(collection(as('bia'), 'invites')));
        await assertFails(getDocs(query(collection(as('bia'), 'invites'), where('trainerUid', '==', 'paulo'))));
        await assertFails(deleteDoc(doc(as('bia'), 'invites/PAULO2')));
        const db = as('paulo');
        await assertSucceeds(getDocs(query(collection(db, 'invites'), where('trainerUid', '==', 'paulo'))));
        await assertSucceeds(getDoc(doc(db, 'invites/VENCID')));
        await assertSucceeds(deleteDoc(doc(db, 'invites/VENCID')));
    });
});

describe('quem não tem vínculo', () => {
    it('não lê nem grava nada do aluno', async () => {
        const db = as('bia');
        for (const path of ['users/ana', 'users/ana/plans/p1', 'users/ana/sessions/s1', 'users/ana/state/current']) {
            await assertFails(getDoc(doc(db, path)));
            await assertFails(setDoc(doc(db, path), { a: 1 }));
        }
        await assertFails(setDoc(doc(db, 'users/ana/plans/p2'), plan('bia')));
        await assertFails(deleteDoc(doc(db, 'users/ana')));
        await assertFails(updateDoc(doc(db, 'users/ana'), unlink('paulo')));
        await assertFails(updateDoc(doc(db, 'users/ana'), unlink('bia')));
    });

    it('não lista os alunos de outro personal nem a coleção inteira', async () => {
        const db = as('bia');
        await assertFails(getDocs(query(collection(db, 'users'), where('trainers.paulo', '==', true))));
        await assertFails(getDocs(collection(db, 'users')));
    });

    it('acesso anônimo é negado', async () => {
        const db = env.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'users/ana')));
        await assertFails(getDoc(doc(db, 'users/ana/plans/p1')));
        await assertFails(setDoc(doc(db, 'users/ana'), { a: 1 }));
    });
});

describe('outras coleções', () => {
    it('são negadas, mesmo para quem está logado', async () => {
        const db = as('ana');
        await assertFails(getDoc(doc(db, 'qualquer/coisa')));
        await assertFails(setDoc(doc(db, 'qualquer/coisa'), { a: 1 }));
        await assertFails(setDoc(doc(db, 'users/ana/outra/doc'), { a: 1 }));
    });
});
