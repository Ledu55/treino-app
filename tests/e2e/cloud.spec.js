// Login e backup contra o Firebase Emulator. Roda dentro do npm test (que sobe o emulador);
// sem o emulador, o teste é pulado.
import { test, expect, APP, exerciseCard, doSets, waitForSaved, savedSets } from './fixtures.js';

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-treino';
const DOCS = `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };
const ANA = { sub: 'e2e-ana', email: 'ana@example.com', email_verified: true };

test.use({ blockFirebase: false });
// Os testes apagam os dados do emulador antes de começar, então não podem rodar juntos
test.describe.configure({ mode: 'serial' });
test.skip(!FIRESTORE || !AUTH, 'precisa do Firebase Emulator (npm test)');

// Servidores do Firebase de verdade (o emulador repete esses nomes só no caminho da URL)
const REAL_FIREBASE_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com'];

// Valor no formato da API REST do Firestore → JS
function decode(value) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    throw new Error('Tipo desconhecido: ' + JSON.stringify(value));
}

function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

async function readDoc(request, path) {
    const res = await request.get(`${DOCS}/${path}`, { headers: OWNER });
    return res.ok() ? decodeFields((await res.json()).fields || {}) : null;
}

async function readCollection(request, path) {
    const res = await request.get(`${DOCS}/${path}?pageSize=300`, { headers: OWNER });
    const docs = (await res.json()).documents || [];
    return docs.map((d) => ({ id: d.name.split('/').pop(), ...decodeFields(d.fields || {}) }));
}

// O emulador aceita um token Google falso; equivale a escolher a conta no popup.
// window.__emulatorSignIn só existe quando o app está ligado ao emulador (src/cloud.js).
function signIn(page, account = ANA) {
    return page.evaluate((t) => window.__emulatorSignIn(t), JSON.stringify(account));
}

// Cria a conta no emulador sem passar pelo app; devolve o uid
async function createAccount(request, account = ANA) {
    const res = await request.post(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key`, {
        data: {
            postBody: `id_token=${encodeURIComponent(JSON.stringify(account))}&providerId=google.com`,
            requestUri: 'http://localhost',
            returnSecureToken: true
        }
    });
    return (await res.json()).localId;
}

// Outro celular, como quem já usava o app (mesma situação do fixture existingUser)
async function otherPhone(page) {
    const other = await page.context().browser().newPage();
    other.on('dialog', (dialog) => dialog.accept());
    await other.addInitScript(() => {
        if (!localStorage.getItem('treino.schemaVersion')) localStorage.setItem('treino.lastWorkout', '{"key":"A"}');
    });
    return other;
}

test.beforeEach(async ({ request }) => {
    await request.delete(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
    await request.delete(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
});

test('login e backup em localhost usam o emulador, nunca a produção', async ({ page, request }) => {
    const realRequests = [];
    const watch = (p) => p.on('request', (req) => {
        if (REAL_FIREBASE_HOSTS.includes(new URL(req.url()).hostname)) realRequests.push(req.url());
    });
    watch(page);

    await page.goto(`${APP}?emulator`);
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();

    const uid = await signIn(page);

    await expect(page.locator('#cloud-title')).toHaveText('Backup ativo [emulator]');
    await expect(page.locator('#cloud-detail')).toContainText('ana@example.com');
    await expect(page.locator('#cloud-detail')).toContainText('Último backup');
    expect(await readDoc(request, `users/${uid}`)).toMatchObject({ schema: 2, titulo: 'Treino do Meu Benzinho', activePlanId: 'abcd' });
    expect((await readCollection(request, `users/${uid}/plans`)).map((p) => p.id)).toEqual(['abcd']);
    expect(await readCollection(request, `users/${uid}/sessions`)).toEqual([]);

    // Um treino finalizado chega ao backup, num documento só dele
    const card = exerciseCard(page, 'Agachamento');
    const rows = [[40, 8], [40, 8], [40, 8]];
    await doSets(card, rows);
    await waitForSaved(page, 'A|agachamento', savedSets(rows));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();

    await expect.poll(async () => (await readCollection(request, `users/${uid}/sessions`)).length, { timeout: 15000 }).toBe(1);
    const [session] = await readCollection(request, `users/${uid}/sessions`);
    expect(session).toMatchObject({ planId: 'abcd', workoutId: 'A' });
    expect(session.exercises.find((e) => e.exerciseId === 'agachamento').sets[0]).toEqual({ weight: '40', reps: '8', done: true });
    const state = await readDoc(request, `users/${uid}/state/current`);
    expect(state.values['A|agachamento'].sets[2]).toEqual({ weight: '40', reps: '8' });
    await expect.poll(async () => (await readDoc(request, `users/${uid}`)).lastSessionAt).toBe(session.date);

    // Outro aparelho com a mesma conta recebe o treino
    const other = await otherPhone(page);
    watch(other);
    await other.goto(`${APP}?emulator`);
    await expect(other.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await signIn(other);
    await other.getByText('Histórico de treinos').click();
    await expect(other.locator('.history-entry')).toHaveCount(1);
    await expect(exerciseCard(other, 'Agachamento').locator('.suggestion')).toContainText('42,5 kg');

    // Apagar o treino num aparelho apaga no outro (o documento fica marcado como apagado)
    await other.locator('.history-entry summary').click();
    await other.getByRole('button', { name: /Apagar/ }).click();
    await expect.poll(async () => (await readCollection(request, `users/${uid}/sessions`))[0].deleted, { timeout: 15000 }).toBe(true);
    await other.close();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.getByText('Histórico de treinos').click();
    await expect(page.locator('.history-entry')).toHaveCount(0);

    expect(realRequests).toEqual([]);
});

test('backup da v1 na nuvem é migrado e guardado como cópia', async ({ page, request }) => {
    // Backup no formato antigo: um documento com tudo em payload
    const uid = await createAccount(request);
    const payload = JSON.stringify({
        history: [{
            id: 1759700000000, date: '2026-10-05T21:33:20.000Z', workout: 'A', workoutNote: 'do outro celular',
            doneCount: 1, totalCount: 6,
            exercises: [{ nome: 'Agachamento', note: '', sets: [1, 2, 3].map(() => ({ weight: '40', reps: '8', done: true })), setsDone: 3, setsTotal: 3 }]
        }],
        deletedIds: [],
        exerciseData: { 'A|Stiff': { weight: '30', reps: '10' } },
        exerciseDataUpdatedAt: 1
    });
    const created = await request.patch(`${DOCS}/users/${uid}`, {
        headers: OWNER, data: { fields: { payload: { stringValue: payload }, schema: { integerValue: '1' } } }
    });
    expect(created.ok()).toBe(true);

    await page.goto(`${APP}?emulator`);
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await signIn(page);
    await expect(page.locator('#cloud-detail')).toContainText('Último backup');
    await page.getByText('Histórico de treinos').click();
    await expect(page.locator('.history-entry')).toHaveCount(1);
    await expect(page.locator('.history-entry')).toContainText('Treino A');
    await expect(exerciseCard(page, 'Stiff').locator('.set-weight-input').nth(2)).toHaveValue('30');

    const root = await readDoc(request, `users/${uid}`);
    expect(root).toMatchObject({ schema: 2, previousSchema: 1, previousPayload: payload });
    expect(root.payload).toBeUndefined();
    const sessions = await readCollection(request, `users/${uid}/sessions`);
    expect(sessions.map((s) => s.id)).toEqual(['1759700000000']);
    expect(sessions[0].workoutNote).toBe('do outro celular');
});

test('backup de uma versão mais nova do app não é lido nem sobrescrito', async ({ page, request }) => {
    // Outro aparelho, com uma versão mais nova do app, gravou o backup num formato novo
    const uid = await createAccount(request);
    const newer = { fields: { formatoNovo: { booleanValue: true }, schema: { integerValue: '999' } } };
    expect((await request.patch(`${DOCS}/users/${uid}`, { headers: OWNER, data: newer })).ok()).toBe(true);

    await page.goto(`${APP}?emulator`);
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await signIn(page);
    await expect(page.locator('#cloud-detail')).toContainText('versão mais nova do app');

    // Um treino finalizado fica no celular, e o backup continua intacto
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect(page.locator('#toast')).toHaveText(/Treino salvo/);
    await page.waitForTimeout(3000);
    expect(await readDoc(request, `users/${uid}`)).toEqual({ formatoNovo: true, schema: 999 });
    expect(await readCollection(request, `users/${uid}/plans`)).toEqual([]);
    expect(await readCollection(request, `users/${uid}/sessions`)).toEqual([]);
});
