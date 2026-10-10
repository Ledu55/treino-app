import './app.css';
import { render } from 'preact';
import { initStore } from './store.js';
import { onStorageError } from './storage.js';
import { initTimer } from './timer.js';
import { initWakeLock } from './wake-lock.js';
import { initCloud, pickFirebaseEnv } from './cloud.js';
import { initMonitoring, reportError } from './monitoring.js';
import { App } from './ui/App.jsx';
import { BlockedScreen } from './ui/BlockedScreen.jsx';
import { NOTICE_KEY } from './ui/PrivacyScreen.jsx';
import { showToast } from './ui/Toast.jsx';
import { initUpdates } from './ui/UpdateBanner.jsx';

// Antes de tudo, para pegar também os erros da abertura
initMonitoring(pickFirebaseEnv(location));

const root = document.getElementById('app');
const problem = initStore();
if (!problem) {
    onStorageError((err) => {
        showToast('⚠️ Não foi possível salvar neste celular (armazenamento cheio?)');
        reportError(err, 'storage');
    });
    initWakeLock();
    initTimer();
    // Antes de desenhar: as telas já precisam saber se há nuvem neste endereço
    initCloud();
    // Aviso deixado antes de recarregar (ex.: "Conta excluída")
    try {
        const notice = sessionStorage.getItem(NOTICE_KEY);
        sessionStorage.removeItem(NOTICE_KEY);
        if (notice) showToast(notice);
    } catch (e) { /* sem aviso */ }
    render(<App />, root);
    // Pede ao navegador para não apagar os dados locais quando faltar espaço
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
} else {
    render(<BlockedScreen reason={problem} />, root);
}
initUpdates();
