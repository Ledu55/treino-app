import './app.css';
import { render } from 'preact';
import { initStore } from './store.js';
import { initTimer } from './timer.js';
import { initCloud } from './cloud.js';
import { App } from './ui/App.jsx';
import { BlockedScreen } from './ui/BlockedScreen.jsx';
import { initUpdates } from './ui/UpdateBanner.jsx';

const root = document.getElementById('app');
const problem = initStore();
if (!problem) {
    initTimer();
    render(<App />, root);
    // Pede ao navegador para não apagar os dados locais quando faltar espaço
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    initCloud();
} else {
    render(<BlockedScreen reason={problem} />, root);
}
initUpdates();
