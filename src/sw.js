// Service worker. O vite-plugin-pwa troca self.__WB_MANIFEST pela lista de arquivos do build (com
// a versão de cada um), então cada build gera um sw.js diferente e o celular percebe a atualização.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

// Parâmetros na URL (ex.: ?emulator) não mudam os arquivos, então não impedem o uso do cache
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/.*/] });
cleanupOutdatedCaches();

// Caches do sw.js escrito à mão, usado até a versão v10
const isLegacyCache = (name) => name.startsWith('meu-treino-');

self.addEventListener('install', (event) => {
    // Quem vem do sw.js antigo tem um app que não sabe mostrar o aviso de atualização, então o
    // service worker novo assume direto. Nos outros casos ele espera o toque em "Atualizar".
    event.waitUntil(caches.keys().then((names) => {
        if (names.some(isLegacyCache)) return self.skipWaiting();
    }));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((names) =>
        Promise.all(names.filter(isLegacyCache).map((name) => caches.delete(name)))
    ));
});

// Enviada pelo app quando a pessoa toca em "Atualizar"
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
