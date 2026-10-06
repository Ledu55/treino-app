const CACHE_VERSION = 'meu-treino-v8';
const RUNTIME_CACHE = 'meu-treino-runtime-v1';

const EXERCISE_GIFS = [
    './gifs/standing-calf-raise.gif',
    './gifs/hip-abduction-machine.gif',
    './gifs/seated-leg-curl.gif',
    './gifs/barbell-squat.gif',
    './gifs/barbell-romanian-deadlift.gif',
    './gifs/leg-extension.gif',
    './gifs/incline-chest-press-machine.gif',
    './gifs/seated-row-machine.gif',
    './gifs/dumbbell-lateral-raise.gif',
    './gifs/elevacao-frontal-inclinada.gif',
    './gifs/seated-dumbbell-triceps-extension.gif',
    './gifs/lying-leg-raise.gif',
    './gifs/hip-adduction-machine.gif',
    './gifs/weighted-back-extension.gif',
    './gifs/leg-press.gif',
    './gifs/dumbbell-bulgarian-split-squat.gif',
    './gifs/lever-shoulder-press.gif',
    './gifs/lat-pulldown.gif',
    './gifs/dumbbell-fly.gif',
    './gifs/dumbbell-curl.gif',
    './gifs/seated-ab-crunch-machine.gif'
];

const APP_SHELL = [
    './meu_treino_app.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    ...EXERCISE_GIFS
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
    // Scripts do Firebase têm a versão na URL, então podem ficar em cache para o app abrir offline.
    const isFirebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');

    if (isAppShell) {
        // Cache-first for the app shell, fall back to network.
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request))
        );
        return;
    }

    if (isExerciseImage || isFirebaseSdk) {
        // Runtime cache-first for exercise GIFs (and the versioned Firebase SDK) so the app works offline.
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
