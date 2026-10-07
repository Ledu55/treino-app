import { useSubscription } from './hooks.js';

const toast = { message: '', show: false };
const listeners = new Set();
let hideTimer;

function subscribeToast(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function update(changes) {
    Object.assign(toast, changes);
    listeners.forEach((listener) => listener());
}

export function showToast(message) {
    update({ message, show: true });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => update({ show: false }), 2500);
}

export function Toast() {
    useSubscription(subscribeToast);
    return <div id="toast" role="status" class={toast.show ? 'show' : ''}>{toast.message}</div>;
}
