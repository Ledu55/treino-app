// Testes das regras do Firestore. Precisam do emulador rodando: npm test (ou npm run emulators).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

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

beforeEach(async () => {
    await env.clearFirestore();
    // Dados da Ana já existentes, gravados sem passar pelas regras
    await env.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), 'users/ana'), { payload: '{}', schema: 1 })
    );
});

const backup = { payload: '{"history":[]}', schema: 1 };

describe('users/{uid}', () => {
    it('a pessoa lê, grava e apaga o próprio backup', async () => {
        const db = env.authenticatedContext('ana').firestore();
        await assertSucceeds(getDoc(doc(db, 'users/ana')));
        await assertSucceeds(setDoc(doc(db, 'users/ana'), backup));
        await assertSucceeds(deleteDoc(doc(db, 'users/ana')));
    });

    it('a pessoa cria o backup na primeira sincronização', async () => {
        const db = env.authenticatedContext('bia').firestore();
        await assertSucceeds(setDoc(doc(db, 'users/bia'), backup));
    });

    it('outra pessoa logada não lê nem grava o backup alheio', async () => {
        const db = env.authenticatedContext('bia').firestore();
        await assertFails(getDoc(doc(db, 'users/ana')));
        await assertFails(setDoc(doc(db, 'users/ana'), backup));
        await assertFails(deleteDoc(doc(db, 'users/ana')));
    });

    it('acesso anônimo é negado', async () => {
        const db = env.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'users/ana')));
        await assertFails(setDoc(doc(db, 'users/ana'), backup));
    });

    it('ninguém lista a coleção de usuários', async () => {
        const db = env.authenticatedContext('ana').firestore();
        await assertFails(getDocs(collection(db, 'users')));
    });
});

describe('outras coleções', () => {
    it('são negadas, mesmo para quem está logado', async () => {
        const db = env.authenticatedContext('ana').firestore();
        await assertFails(getDoc(doc(db, 'qualquer/coisa')));
        await assertFails(setDoc(doc(db, 'qualquer/coisa'), { a: 1 }));
        await assertFails(setDoc(doc(db, 'users/ana/sub/doc'), { a: 1 }));
    });
});
