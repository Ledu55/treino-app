// Timer de descanso: conta até a hora de término (não por ticks), então está certo ao voltar ao
// app; a hora de término fica no sessionStorage, para o timer continuar se o celular recarregar o
// app. O alarme no fim só toca com o app aberto e a tela ligada (wake-lock.js mantém a tela
// ligada durante o treino). A barra do timer (ui/TimerBar.jsx) assina as mudanças.
import { noteWorkoutActivity, setTimerRunning } from './wake-lock.js';

const SAVED_KEY = 'treino.timer';

// visible: barra aberta; finished: chegou a zero e o alarme tocou
const timer = { visible: false, remaining: 0, finished: false };
const listeners = new Set();

let interval;
let endTime;
let active = false;
let audioCtx;

export function getTimerState() {
    return timer;
}

export function subscribeTimer(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function update(changes) {
    Object.assign(timer, changes);
    listeners.forEach((listener) => listener());
}

export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function getAudioCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AudioCtx) audioCtx = new AudioCtx();
    return audioCtx;
}

// O áudio só pode ser liberado num toque da pessoa; o alarme toca depois, sem toque
function unlockAudio() {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
}

function saveEndTime() {
    try { sessionStorage.setItem(SAVED_KEY, JSON.stringify({ endTime })); } catch (e) { /* sem cópia */ }
}

function clearSavedEndTime() {
    try { sessionStorage.removeItem(SAVED_KEY); } catch (e) { /* sem cópia */ }
}

function readSavedEndTime() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY));
        return saved && typeof saved.endTime === 'number' ? saved.endTime : null;
    } catch (e) {
        return null;
    }
}

function remainingSeconds() {
    return Math.round((endTime - Date.now()) / 1000);
}

function tick() {
    const remaining = remainingSeconds();
    if (remaining <= 0) {
        clearInterval(interval);
        playAlarm();
    } else {
        update({ remaining });
    }
}

function run(end) {
    clearInterval(interval);
    endTime = end;
    active = true;
    saveEndTime();
    noteWorkoutActivity();
    setTimerRunning(true);
    update({ visible: true, finished: false, remaining: remainingSeconds() });
    interval = setInterval(tick, 1000);
}

export function startTimer(seconds) {
    unlockAudio();
    run(Date.now() + seconds * 1000);
}

export function addTime(seconds) {
    if (!active) return;
    endTime += seconds * 1000;
    saveEndTime();
    update({ remaining: remainingSeconds() });
}

export function stopTimer() {
    clearInterval(interval);
    active = false;
    clearSavedEndTime();
    setTimerRunning(false);
    update({ visible: false });
}

function playAlarm() {
    active = false;
    clearSavedEndTime();
    setTimerRunning(false);
    update({ remaining: 0, finished: true });

    if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
    }

    const ctx = getAudioCtx();
    if (ctx) {
        if (ctx.state === 'suspended') { ctx.resume(); }

        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, ctx.currentTime);

                gainNode.gain.setValueAtTime(1, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);

                oscillator.start();
                oscillator.stop(ctx.currentTime + 0.5);
            }, i * 500);
        }
    }

    // Fecha a barra sozinho, a não ser que outro descanso tenha começado
    setTimeout(() => {
        if (timer.finished && timer.visible) stopTimer();
    }, 5000);
}

export function initTimer() {
    // Acerta o timer quando o app volta para a tela: com a tela desligada ou o app em segundo
    // plano, o celular para o JavaScript
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && active) tick();
    });

    // Descanso que estava correndo quando o celular recarregou o app
    const savedEnd = readSavedEndTime();
    if (savedEnd && savedEnd > Date.now()) {
        run(savedEnd);
        // Depois de recarregar, o navegador só deixa o alarme tocar depois de um toque
        document.addEventListener('pointerdown', unlockAudio, { once: true });
    } else {
        clearSavedEndTime();
    }
}
