import './app.css';
import { render } from 'preact';
import { completeOnboarding, getState, initStore } from './store.js';
import { onStorageError } from './storage.js';
import { initTimer } from './timer.js';
import { initCloud } from './cloud.js';
import { App } from './ui/App.jsx';
import { BlockedScreen } from './ui/BlockedScreen.jsx';
import { showToast } from './ui/Toast.jsx';
import { initUpdates } from './ui/UpdateBanner.jsx';

const root = document.getElementById('app');
const problem = initStore();
if (!problem) {
    // Primeiro acesso: por enquanto, a ficha A/B/C/D (a tela de boas-vindas vem no item 8)
    if (!getState().profile) completeOnboarding({ nome: '', templateId: 'abcd' });
    onStorageError(() => showToast('⚠️ Não foi possível salvar neste celular (armazenamento cheio?)'));
    initTimer();
    render(<App />, root);
    // Pede ao navegador para não apagar os dados locais quando faltar espaço
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    initCloud();
} else {
    render(<BlockedScreen reason={problem} />, root);
}
initUpdates();
