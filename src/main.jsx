import './app.css';
import { render } from 'preact';
import { initStore } from './store.js';
import { initTimer } from './timer.js';
import { initCloud } from './cloud.js';
import { App } from './ui/App.jsx';
import { initUpdates } from './ui/UpdateBanner.jsx';

initStore();
initTimer();
render(<App />, document.getElementById('app'));
initUpdates();

// Pede ao navegador para não apagar os dados locais quando faltar espaço
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
initCloud();
