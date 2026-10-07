// Testes das regras do Firestore. Precisam do emulador rodando: npm test (ou npm run emulators).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

// Ana é aluna; Paulo é o personal dela; Bia é outra pessoa qualquer
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users/ana'), { nome: 'Ana', schema: 2, trainers: { paulo: true } });
        await setDoc(doc(db, 'users/ana/plans/p1'), { nome: 'Ficha', treinos: [], updatedBy: null });
        await setDoc(doc(db, 'users/ana/sessions/s1'), { date: '2026-10-07', exercises: [] });
        await setDoc(doc(db, 'users/ana/state/current'), { values: {} });
        await setDoc(doc(db, 'users/bia'), { nome: 'Bia', schema: 2 });
    });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const plan = (updatedBy) => ({ nome: 'Ficha nova', treinos: [], updatedBy });

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

    it('cria e edita fichas, identificando-se em updatedBy', async () => {
        const db = as('paulo');
        await assertSucceeds(setDoc(doc(db, 'users/ana/plans/p2'), plan('paulo')));
        await assertSucceeds(setDoc(doc(db, 'users/ana/plans/p1'), plan('paulo')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p1'), plan('ana')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p1'), plan(null)));
    });

    it('não apaga fichas nem treinos, não grava treinos e não altera o perfil', async () => {
        const db = as('paulo');
        await assertFails(deleteDoc(doc(db, 'users/ana/plans/p1')));
        await assertFails(deleteDoc(doc(db, 'users/ana/sessions/s1')));
        await assertFails(setDoc(doc(db, 'users/ana/sessions/s1'), { deleted: true }));
        await assertFails(setDoc(doc(db, 'users/ana/sessions/s2'), { date: '2026-10-07' }));
        await assertFails(updateDoc(doc(db, 'users/ana'), { nome: 'Outra' }));
    });

    it('não lê os últimos valores digitados', async () => {
        await assertFails(getDoc(doc(as('paulo'), 'users/ana/state/current')));
    });
});

describe('o personal removido', () => {
    it('perde o acesso assim que o aluno o tira da lista', async () => {
        await updateDoc(doc(as('ana'), 'users/ana'), { 'trainers.paulo': false });
        const db = as('paulo');
        await assertFails(getDoc(doc(db, 'users/ana')));
        await assertFails(getDoc(doc(db, 'users/ana/plans/p1')));
        await assertFails(getDocs(collection(db, 'users/ana/sessions')));
        await assertFails(setDoc(doc(db, 'users/ana/plans/p1'), plan('paulo')));
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
        await assertFails(getDoc(doc(db, 'invites/ABC123')));
    });
});
