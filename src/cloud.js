// Backup na nuvem (Firebase): login Google e sincronização de um documento por pessoa em
// users/{uid}. O celular é a fonte principal; sem login ou sem internet o app funciona igual.
import { HISTORY_LIMIT, getState, localSnapshot, onDataChange, replaceData, saveCloudMeta } from './store.js';
import { debounce } from './util.js';

// Um projeto Firebase por ambiente. O objeto firebaseConfig vem do Console do Firebase →
// Configurações do projeto → Seus apps. Ambiente sem configuração: a seção de backup fica
// escondida e o app funciona só com os dados do celular.
export const FIREBASE_CONFIGS = {
    prod: {
        apiKey: "AIzaSyB_tGeQxXB0SUGIlVCOHKDbAQpZfUSuRac",
        authDomain: "treino-app-21fcd.firebaseapp.com",
        projectId: "treino-app-21fcd",
        storageBucket: "treino-app-21fcd.firebasestorage.app",
        messagingSenderId: "1012262948925",
        appId: "1:1012262948925:web:e0ae7e5cd4b4e270631a54"
    },
    // Projeto de desenvolvimento (treino-app-dev-306d2). Se for null, localhost usa o emulador.
    dev: {
        apiKey: "AIzaSyAdGCccw1ml7vlC7Dj5-eZNVB3zvDCEva8",
        authDomain: "treino-app-dev-306d2.firebaseapp.com",
        projectId: "treino-app-dev-306d2",
        storageBucket: "treino-app-dev-306d2.firebasestorage.app",
        messagingSenderId: "642701751250",
        appId: "1:642701751250:web:8338a3a5e93efb94eb8e0b"
    },
    // Firebase Emulator (npm run emulators). Projetos "demo-" nunca acessam a nuvem.
    emulator: {
        apiKey: "demo-api-key",
        authDomain: "demo-treino.firebaseapp.com",
        projectId: "demo-treino"
    }
};
const EMULATOR_HOSTS = { auth: 'http://localhost:9099', firestore: ['localhost', 8080] };
const DELETED_IDS_LIMIT = 200;

// localhost usa o projeto de dev (ou o emulador, com ?emulator na URL ou sem projeto de dev);
// só o endereço publicado usa a produção; qualquer outro endereço fica sem nuvem.
export function pickFirebaseEnv(loc) {
    if (loc.hostname === 'ledu55.github.io') return 'prod';
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
        const wantsEmulator = new URLSearchParams(loc.search).has('emulator');
        return wantsEmulator || !FIREBASE_CONFIGS.dev ? 'emulator' : 'dev';
    }
    return null;
}

// JSON com chaves ordenadas, para comparar dados sem depender da ordem
export function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
}

// Junta os dados deste celular com os da nuvem: histórico pela união dos ids (menos os apagados),
// últimos valores digitados por exercício com prioridade para o lado editado mais recentemente
export function mergeCloudData(local, remote) {
    if (!remote) return local;
    const deleted = Array.from(new Set([...(remote.deletedIds || []), ...(local.deletedIds || [])])).slice(-DELETED_IDS_LIMIT);
    const deletedSet = new Set(deleted);

    const byId = new Map();
    [...(remote.history || []), ...(local.history || [])].forEach((entry) => {
        if (entry && entry.id != null && !deletedSet.has(entry.id)) byId.set(entry.id, entry);
    });
    const history = Array.from(byId.values()).sort((a, b) => b.id - a.id).slice(0, HISTORY_LIMIT);

    const localAt = local.exerciseDataUpdatedAt || 0;
    const remoteAt = remote.exerciseDataUpdatedAt || 0;
    const exerciseDataMerged = remoteAt > localAt
        ? { ...(local.exerciseData || {}), ...(remote.exerciseData || {}) }
        : { ...(remote.exerciseData || {}), ...(local.exerciseData || {}) };

    return {
        history: history,
        deletedIds: deleted,
        exerciseData: exerciseDataMerged,
        exerciseDataUpdatedAt: Math.max(localAt, remoteAt)
    };
}

// ---------- Sincronização ----------

// Estado mostrado na seção de backup (ui/CloudSection.jsx)
const cloud = { env: null, ready: false, loadFailed: false, user: null, syncing: false, error: false };
let sdk = null;
let auth = null;
let db = null;
let pending = false;
let changeSeq = 0;
const listeners = new Set();
const scheduleSync = debounce(() => syncCloud(), 2000);

export function getCloudState() {
    return cloud;
}

export function subscribeCloud(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit() {
    listeners.forEach((listener) => listener());
}

function applyCloudData(data) {
    const { history, exerciseData } = getState();
    const changed = stableStringify(data.history) !== stableStringify(history)
        || stableStringify(data.exerciseData) !== stableStringify(exerciseData);
    replaceData(data, changed);
}

async function syncCloud() {
    if (!cloud.user) return;
    if (cloud.syncing) { pending = true; return; }
    if (!navigator.onLine) { emit(); return; }

    const { cloudMeta } = getState();
    cloud.syncing = true;
    emit();
    const seq = changeSeq;
    const ref = sdk.doc(db, 'users', cloud.user.uid);

    try {
        const local = localSnapshot();
        const merged = await sdk.runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const remote = snap.exists() ? JSON.parse(snap.data().payload) : null;
            const result = mergeCloudData(local, remote);
            tx.set(ref, {
                payload: JSON.stringify(result),
                schema: 1,
                updatedAt: sdk.serverTimestamp()
            });
            return result;
        });
        // Mescla de novo com o que mudou aqui enquanto a sincronização rodava
        applyCloudData(mergeCloudData(localSnapshot(), merged));
        if (changeSeq === seq) cloudMeta.dirty = false;
        cloudMeta.lastSyncAt = Date.now();
        saveCloudMeta();
        cloud.error = false;
    } catch (err) {
        console.warn('Falha no backup:', err);
        cloud.error = true;
        setTimeout(() => { if (getState().cloudMeta.dirty) syncCloud(); }, 60000);
    } finally {
        cloud.syncing = false;
        emit();
        if (pending) {
            pending = false;
            scheduleSync();
        }
    }
}

async function loadSdk(config) {
    if (sdk) return;
    const mod = await import('./firebase-sdk.js');
    const app = mod.initializeApp(config);
    auth = mod.getAuth(app);
    db = mod.getFirestore(app);
    if (cloud.env === 'emulator') {
        mod.connectAuthEmulator(auth, EMULATOR_HOSTS.auth, { disableWarnings: true });
        mod.connectFirestoreEmulator(db, ...EMULATOR_HOSTS.firestore);
        // Usado pelos testes: o emulador aceita um token Google falso no lugar do popup
        window.__emulatorSignIn = async (token) =>
            (await mod.signInWithCredential(auth, mod.GoogleAuthProvider.credential(token))).user.uid;
    }
    sdk = mod;
}

async function connect() {
    if (cloud.ready) return;
    cloud.loadFailed = false;
    emit();
    try {
        await loadSdk(FIREBASE_CONFIGS[cloud.env]);
    } catch (err) {
        cloud.loadFailed = true;
        emit();
        window.addEventListener('online', connect, { once: true });
        return;
    }
    cloud.ready = true;
    sdk.onAuthStateChanged(auth, (user) => {
        cloud.user = user;
        cloud.error = false;
        emit();
        if (user) syncCloud();
    });
}

export function initCloud() {
    cloud.env = pickFirebaseEnv(location);
    if (!FIREBASE_CONFIGS[cloud.env]) return;

    onDataChange(() => {
        changeSeq++;
        if (cloud.user) scheduleSync();
    });
    window.addEventListener('online', () => {
        emit();
        if (cloud.user && getState().cloudMeta.dirty) syncCloud();
    });
    window.addEventListener('offline', emit);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && cloud.user) syncCloud();
    });
    connect();
}

// Devolve true se o login deu certo; false se a pessoa fechou o popup
export async function cloudSignIn() {
    try {
        await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
        return true;
    } catch (err) {
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return false;
        throw err;
    }
}

export function cloudSignOut() {
    return sdk.signOut(auth);
}
