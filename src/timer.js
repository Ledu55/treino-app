// Timer de descanso: conta até a hora de término (não por ticks), mantém a tela ligada enquanto
// corre e toca um alarme no fim. A barra do timer (ui/TimerBar.jsx) assina as mudanças.

// visible: barra aberta; finished: chegou a zero e o alarme tocou
const timer = { visible: false, remaining: 0, finished: false };
const listeners = new Set();

let interval;
let endTime;
let active = false;
let wakeLock = null;
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
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
        wakeLock = null;
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
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

export function startTimer(seconds) {
    // O áudio só pode ser liberado num toque da pessoa; o alarme toca depois, sem toque
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') { ctx.resume(); }

    clearInterval(interval);
    endTime = Date.now() + seconds * 1000;
    active = true;
    acquireWakeLock();
    update({ visible: true, finished: false, remaining: seconds });
    interval = setInterval(tick, 1000);
}

export function addTime(seconds) {
    if (!active) return;
    endTime += seconds * 1000;
    update({ remaining: remainingSeconds() });
}

export function stopTimer() {
    clearInterval(interval);
    active = false;
    releaseWakeLock();
    update({ visible: false });
}

function playAlarm() {
    active = false;
    releaseWakeLock();
    update({ remaining: 0, finished: true });

    if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
    }

    const ctx = getAudioCtx();
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

    // Fecha a barra sozinho, a não ser que outro descanso tenha começado
    setTimeout(() => {
        if (timer.finished && timer.visible) stopTimer();
    }, 5000);
}

export function initTimer() {
    // Acerta o timer se a tela foi desligada ou o app foi para segundo plano
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && active) {
            if (remainingSeconds() <= 0) {
                clearInterval(interval);
                playAlarm();
            } else {
                update({ remaining: remainingSeconds() });
                acquireWakeLock();
            }
        }
    });
}
