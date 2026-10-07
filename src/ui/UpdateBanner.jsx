import { registerSW } from 'virtual:pwa-register';
import { useSubscription } from './hooks.js';

const update = { available: false };
const listeners = new Set();
let updateServiceWorker = () => {};

function subscribeUpdate(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// Registra o service worker. Uma versão nova fica esperando até a pessoa tocar em "Atualizar",
// para a página não recarregar no meio de uma série.
export function initUpdates() {
    updateServiceWorker = registerSW({
        onNeedRefresh() {
            update.available = true;
            listeners.forEach((listener) => listener());
        },
        onRegisteredSW(swUrl, registration) {
            if (!registration) return;
            // O app pode ficar dias aberto no celular: procura versão nova ao voltar para ele
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') registration.update().catch(() => {});
            });
        }
    });
}

export function UpdateBanner() {
    useSubscription(subscribeUpdate);
    if (!update.available) return null;
    return (
        <div class="update-banner" role="status">
            <span>Nova versão disponível</span>
            <button type="button" class="update-btn" onClick={() => updateServiceWorker(true)}>Atualizar</button>
        </div>
    );
}
