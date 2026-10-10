// Tela ligada durante o treino (Wake Lock API): enquanto o timer de descanso corre e até 30 min
// depois da última série marcada ou do último descanso iniciado. O navegador solta o bloqueio
// quando o app sai da tela, e ele é pedido de novo quando o app volta. Sem a API, ou se o celular
// recusar (ex.: economia de bateria), a tela apaga como sempre.

export const WORKOUT_IDLE_MS = 30 * 60 * 1000;

let timerRunning = false;
let activeUntil = 0;
let idleTimeout;
let sentinel = null;
let requesting = false;

function wanted() {
    return document.visibilityState === 'visible' && (timerRunning || Date.now() < activeUntil);
}

async function sync() {
    if (!('wakeLock' in navigator)) return;
    if (!wanted()) {
        if (sentinel) {
            const held = sentinel;
            sentinel = null;
            held.release().catch(() => {});
        }
        return;
    }
    if (sentinel || requesting) return;
    requesting = true;
    try {
        const held = await navigator.wakeLock.request('screen');
        // Solto pelo navegador (app em segundo plano, tela desligada no botão)
        held.addEventListener('release', () => { if (sentinel === held) sentinel = null; });
        sentinel = held;
    } catch (err) {
        // Recusado: a tela apaga como sempre
    }
    requesting = false;
    // O treino pode ter acabado enquanto o pedido estava pendente
    if (!wanted()) sync();
}

export function setTimerRunning(running) {
    timerRunning = running;
    sync();
}

// Série marcada ou descanso iniciado
export function noteWorkoutActivity() {
    activeUntil = Date.now() + WORKOUT_IDLE_MS;
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(sync, WORKOUT_IDLE_MS + 1000);
    sync();
}

// Treino finalizado: a tela volta a apagar sozinha (a não ser que o timer esteja correndo)
export function endWorkoutActivity() {
    activeUntil = 0;
    clearTimeout(idleTimeout);
    sync();
}

export function initWakeLock() {
    document.addEventListener('visibilitychange', sync);
}
