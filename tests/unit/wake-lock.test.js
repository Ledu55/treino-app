// @vitest-environment jsdom
// Tela ligada durante o treino (wake-lock.js), com um navigator.wakeLock de mentira
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let wakeLock;
let visibility;
let loaded;

// Imita a Wake Lock API: guarda os bloqueios pedidos; release() solta como o navegador faria
function fakeWakeLock({ refuse = false } = {}) {
    const fake = {
        requests: 0,
        held: [],
        async request(type) {
            expect(type).toBe('screen');
            fake.requests++;
            if (refuse) throw new DOMException('Bateria fraca', 'NotAllowedError');
            const listeners = [];
            const sentinel = {
                released: false,
                addEventListener: (name, fn) => { if (name === 'release') listeners.push(fn); },
                async release() {
                    if (sentinel.released) return;
                    sentinel.released = true;
                    fake.held = fake.held.filter((s) => s !== sentinel);
                    listeners.forEach((fn) => fn());
                }
            };
            fake.held.push(sentinel);
            return sentinel;
        }
    };
    return fake;
}

function setVisibility(state) {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
}

// O módulo guarda estado; cada teste começa com uma cópia nova
async function load({ api = fakeWakeLock() } = {}) {
    vi.resetModules();
    wakeLock = api;
    if (api) Object.defineProperty(navigator, 'wakeLock', { value: api, configurable: true });
    loaded = await import('../../src/wake-lock.js');
    loaded.initWakeLock();
    return loaded;
}

// Deixa os pedidos (assíncronos) terminarem
const settle = () => vi.advanceTimersByTimeAsync(0);
const held = () => wakeLock.held.length;

beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
});

afterEach(() => {
    // O módulo do teste continua ouvindo visibilitychange: não pode mais querer a tela ligada
    loaded.setTimerRunning(false);
    loaded.endWorkoutActivity();
    vi.useRealTimers();
    delete navigator.wakeLock;
});

describe('tela ligada durante o treino', () => {
    it('marcar uma série mantém a tela ligada por 30 min, contados do último toque', async () => {
        const { noteWorkoutActivity, WORKOUT_IDLE_MS } = await load();
        expect(held()).toBe(0);

        noteWorkoutActivity();
        await settle();
        expect(held()).toBe(1);

        await vi.advanceTimersByTimeAsync(WORKOUT_IDLE_MS - 60 * 1000);
        noteWorkoutActivity();
        await settle();
        expect(held()).toBe(1);
        expect(wakeLock.requests).toBe(1);

        await vi.advanceTimersByTimeAsync(WORKOUT_IDLE_MS - 60 * 1000);
        expect(held()).toBe(1);
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
        expect(held()).toBe(0);
    });

    it('o timer de descanso segura a tela mesmo depois dos 30 min', async () => {
        const { noteWorkoutActivity, setTimerRunning, WORKOUT_IDLE_MS } = await load();
        noteWorkoutActivity();
        setTimerRunning(true);
        await vi.advanceTimersByTimeAsync(WORKOUT_IDLE_MS + 60 * 1000);
        expect(held()).toBe(1);

        setTimerRunning(false);
        await settle();
        expect(held()).toBe(0);
    });

    it('finalizar o treino solta a tela', async () => {
        const { noteWorkoutActivity, endWorkoutActivity } = await load();
        noteWorkoutActivity();
        await settle();
        endWorkoutActivity();
        await settle();
        expect(held()).toBe(0);
    });

    it('pede de novo quando o app volta para a tela, e não pede em segundo plano', async () => {
        const { noteWorkoutActivity } = await load();
        noteWorkoutActivity();
        await settle();

        // Fora da tela o bloqueio é solto (pelo app ou pelo navegador)
        setVisibility('hidden');
        await settle();
        expect(held()).toBe(0);
        noteWorkoutActivity();
        await settle();
        expect(held()).toBe(0);

        setVisibility('visible');
        await settle();
        expect(held()).toBe(1);
        expect(wakeLock.requests).toBe(2);
    });

    it('bloqueio solto pelo navegador (tela desligada no botão): pede de novo na volta', async () => {
        const { noteWorkoutActivity } = await load();
        noteWorkoutActivity();
        await settle();
        await wakeLock.held[0].release();
        setVisibility('hidden');
        setVisibility('visible');
        await settle();
        expect(held()).toBe(1);
        expect(wakeLock.requests).toBe(2);
    });

    it('não volta a pedir se o treino acabou fora da tela', async () => {
        const { noteWorkoutActivity, endWorkoutActivity } = await load();
        noteWorkoutActivity();
        await settle();
        setVisibility('hidden');
        endWorkoutActivity();

        setVisibility('visible');
        await settle();
        expect(held()).toBe(0);
        expect(wakeLock.requests).toBe(1);
    });

    it('treino finalizado enquanto o pedido ainda estava pendente: solta assim que chega', async () => {
        const { noteWorkoutActivity, endWorkoutActivity } = await load();
        noteWorkoutActivity();
        endWorkoutActivity();
        await settle();
        expect(held()).toBe(0);
    });

    it('celular que recusa o bloqueio: segue sem erro e sem insistir', async () => {
        const { noteWorkoutActivity } = await load({ api: fakeWakeLock({ refuse: true }) });
        noteWorkoutActivity();
        await settle();
        expect(wakeLock.requests).toBe(1);
        expect(held()).toBe(0);
    });

    it('navegador sem a Wake Lock API: nada acontece', async () => {
        const { noteWorkoutActivity, setTimerRunning, endWorkoutActivity } = await load({ api: null });
        noteWorkoutActivity();
        setTimerRunning(true);
        endWorkoutActivity();
        await settle();
    });
});
