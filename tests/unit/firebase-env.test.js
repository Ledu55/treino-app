import { afterAll, describe, expect, it } from 'vitest';
import { loadApp } from './load-app.js';

const app = loadApp();
afterAll(() => app.close());

const envFor = (url) => app.pickFirebaseEnv(new URL(url));

describe('pickFirebaseEnv', () => {
    it('só o endereço publicado usa a produção', () => {
        expect(envFor('https://ledu55.github.io/treino/meu_treino_app.html')).toBe('prod');
    });

    it('localhost nunca usa a produção', () => {
        // dev, ou o emulador enquanto o projeto de dev não estiver configurado
        expect(['dev', 'emulator']).toContain(envFor('http://localhost:8000/meu_treino_app.html'));
        expect(['dev', 'emulator']).toContain(envFor('http://127.0.0.1:8000/meu_treino_app.html'));
        expect(envFor('http://localhost:8000/meu_treino_app.html?emulator')).toBe('emulator');
    });

    it('outros endereços ficam sem nuvem', () => {
        expect(envFor('http://192.168.0.10:8000/meu_treino_app.html')).toBeNull();
        expect(envFor('file:///E:/New%20folder/meu_treino_app.html')).toBeNull();
        expect(envFor('https://outro.github.io/meu_treino_app.html')).toBeNull();
    });
});
