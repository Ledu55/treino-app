import { addTime, formatTime, getTimerState, stopTimer, subscribeTimer } from '../timer.js';
import { useSubscription } from './hooks.js';

const ALARM_COLOR = '#ef4444';

export function TimerBar() {
    useSubscription(subscribeTimer);
    const { visible, remaining, finished } = getTimerState();
    const color = finished ? ALARM_COLOR : 'var(--success)';

    return (
        <div id="timer-bar" class={visible ? 'visible' : ''} aria-live="assertive" style={{ backgroundColor: color }}>
            <span id="timer-display">{finished ? 'Acabou!' : formatTime(remaining)}</span>
            <button id="add-time" onClick={() => addTime(30)} style={{ display: finished ? 'none' : '' }}>+30s</button>
            <button id="stop-timer" onClick={stopTimer} style={{ color }}>Fechar / Parar</button>
            {!finished && <span id="timer-hint">🔔 O alarme só toca com a tela ligada e o app aberto</span>}
        </div>
    );
}
