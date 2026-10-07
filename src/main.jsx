import './app.css';
import { render } from 'preact';
import { initStore } from './store.js';
import { initTimer } from './timer.js';
import { initCloud } from './cloud.js';
import { App } from './ui/App.jsx';

initStore();
initTimer();
render(<App />, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

// Pede ao navegador para não apagar os dados locais quando faltar espaço
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
initCloud();
