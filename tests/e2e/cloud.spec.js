// Login e backup contra o Firebase Emulator. Roda dentro do npm test (que sobe o emulador);
// sem o emulador, o teste é pulado.
import { test, expect, APP, exerciseCard, doSets, waitForSaved, savedSets } from './fixtures.js';

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-treino';

test.use({ blockFirebase: false });
// Os testes apagam os dados do emulador antes de começar, então não podem rodar juntos
test.describe.configure({ mode: 'serial' });
test.skip(!FIRESTORE || !AUTH, 'precisa do Firebase Emulator (npm test)');

// Servidores do Firebase de verdade (o emulador repete esses nomes só no caminho da URL)
const REAL_FIREBASE_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com'];

async function readBackup(request, uid) {
    const res = await request.get(
        `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`,
        { headers: { Authorization: 'Bearer owner' } }
    );
    if (!res.ok()) return null;
    return JSON.parse((await res.json()).fields.payload.stringValue);
}

// O emulador aceita um token Google falso; equivale a escolher a conta no popup.
// window.__emulatorSignIn só existe quando o app está ligado ao emulador (src/cloud.js).
function signIn(page) {
    const token = JSON.stringify({ sub: 'e2e-ana', email: 'ana@example.com', email_verified: true });
    return page.evaluate((t) => window.__emulatorSignIn(t), token);
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
    expect((await readBackup(request, uid)).history).toEqual([]);

    // Um treino finalizado chega ao backup
    const card = exerciseCard(page, 'Agachamento');
    const rows = [[40, 8], [40, 8], [40, 8]];
    await doSets(card, rows);
    await waitForSaved(page, 'A|Agachamento', savedSets(rows));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();

    await expect.poll(async () => (await readBackup(request, uid)).history.length, { timeout: 15000 }).toBe(1);
    const backup = await readBackup(request, uid);
    expect(backup.history[0].workout).toBe('A');
    expect(backup.history[0].exercises.find((e) => e.nome === 'Agachamento').sets[0])
        .toEqual({ weight: '40', reps: '8', done: true });
    expect(backup.exerciseData['A|Agachamento'].sets[2]).toEqual({ weight: '40', reps: '8' });

    // Outro aparelho com a mesma conta recebe o treino
    const other = await page.context().browser().newPage();
    watch(other);
    await other.goto(`${APP}?emulator`);
    await expect(other.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await signIn(other);
    await other.getByText('Histórico de treinos').click();
    await expect(other.locator('.history-entry')).toHaveCount(1);
    await expect(exerciseCard(other, 'Agachamento').locator('.suggestion')).toContainText('42,5 kg');
    await other.close();

    expect(realRequests).toEqual([]);
});

test('backup de uma versão mais nova do app não é lido nem sobrescrito', async ({ page, request }) => {
    // Cria a conta no emulador e fecha a página
    await page.goto(`${APP}?emulator`);
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    const uid = await signIn(page);
    await expect(page.locator('#cloud-detail')).toContainText('Último backup');
    const browser = page.context().browser();
    await page.close();

    // Outro aparelho, com uma versão mais nova do app, gravou o backup num formato novo
    const docUrl = `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`;
    const newer = { fields: { payload: { stringValue: '{"formatoNovo":true}' }, schema: { integerValue: '999' } } };
    expect((await request.patch(docUrl, { headers: { Authorization: 'Bearer owner' }, data: newer })).ok()).toBe(true);

    const other = await browser.newPage();
    other.on('dialog', (dialog) => dialog.accept());
    await other.goto(`${APP}?emulator`);
    await expect(other.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await signIn(other);
    await expect(other.locator('#cloud-detail')).toContainText('versão mais nova do app');

    // Um treino finalizado fica no celular, e o backup continua intacto
    await other.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect(other.locator('#toast')).toHaveText(/Treino salvo/);
    await other.waitForTimeout(3000);
    const doc = await (await request.get(docUrl, { headers: { Authorization: 'Bearer owner' } })).json();
    expect(doc.fields.payload.stringValue).toBe('{"formatoNovo":true}');
    expect(doc.fields.schema.integerValue).toBe('999');
    await other.close();
});
