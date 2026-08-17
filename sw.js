const CACHE_VERSION = 'meu-treino-v1';
const RUNTIME_CACHE = 'meu-treino-runtime-v1';

const APP_SHELL = [
    './meu_treino_app.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
                .map((key) => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const isAppShell = url.origin === self.location.origin;
    const isExerciseImage = request.destination === 'image';

    if (isAppShell) {
        // Cache-first for the app shell, fall back to network.
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request))
        );
        return;
    }

    if (isExerciseImage) {
        // Runtime cache-first for exercise GIFs so previously viewed workouts work offline.
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    const copy = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
                    return response;
                }).catch(() => cached);
            })
        );
    }
});
