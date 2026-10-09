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

// JS → formato da API REST (só os tipos usados nos testes)
function encode(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    return { mapValue: { fields: encodeFields(value) } };
}

function encodeFields(data) {
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
}

// Grava um documento sem passar pelas regras; devolve true se deu certo
async function writeDoc(request, path, data) {
    return (await request.patch(`${DOCS}/${path}`, { headers: OWNER, data: { fields: encodeFields(data) } })).ok();
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

test('primeiro acesso com uma conta que já tem dados: restaura em vez de configurar', async ({ page, request }) => {
    await page.goto(`${APP}?emulator`);
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    const uid = await signIn(page);
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect.poll(async () => (await readCollection(request, `users/${uid}/sessions`)).length, { timeout: 15000 }).toBe(1);

    // Celular novo, sem nenhum dado
    const fresh = await page.context().browser().newPage();
    await fresh.goto(`${APP}?emulator`);
    await expect(fresh.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
    await signIn(fresh);
    await expect(fresh.locator('h1')).toHaveText('Treino do Meu Benzinho');
    await expect(fresh.locator('#toast')).toHaveText('Seus treinos foram restaurados ☁️');
    await expect(fresh.getByLabel('Escolher treino')).toHaveValue('A');
    await fresh.getByText('Histórico de treinos').click();
    await expect(fresh.locator('.history-entry')).toHaveCount(1);

    // Nada foi duplicado na nuvem
    await fresh.waitForTimeout(2500);
    expect((await readCollection(request, `users/${uid}/plans`)).map((p) => p.id)).toEqual(['abcd']);
    await fresh.close();
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

test('excluir conta apaga a nuvem, a conta e o celular; o outro aparelho para o backup', async ({ page, request }) => {
    await page.goto(`${APP}?emulator`);
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    const uid = await signIn(page);
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect.poll(async () => (await readCollection(request, `users/${uid}/sessions`)).length, { timeout: 15000 }).toBe(1);

    // Outro celular com a mesma conta
    const other = await otherPhone(page);
    await other.goto(`${APP}?emulator`);
    await expect(other.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await signIn(other);
    await expect(other.locator('#cloud-detail')).toContainText('Último backup');

    await page.getByRole('button', { name: 'Privacidade e seus dados' }).click();
    await expect(page.getByRole('heading', { name: 'Excluir conta' })).toBeVisible();
    await expect(page.locator('#delete-data')).toContainText('ana@example.com');
    await page.getByRole('button', { name: 'Excluir conta e dados' }).click();
    await page.getByRole('button', { name: 'Sim, excluir tudo' }).click();
    await expect(page.locator('#toast')).toHaveText('Conta excluída');
    await expect(page.locator('#welcome-name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();

    expect(await readDoc(request, `users/${uid}`)).toBeNull();
    for (const name of ['plans', 'sessions', 'state']) {
        expect(await readCollection(request, `users/${uid}/${name}`)).toEqual([]);
    }

    // O outro celular percebe na próxima sincronização: sai da conta, sem reenviar nada e sem
    // apagar os treinos que estão nele
    await other.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(other.locator('#cloud-detail')).toContainText('excluída em outro aparelho');
    await expect(other.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    await other.getByText('Histórico de treinos').click();
    await expect(other.locator('.history-entry')).toHaveCount(1);
    await other.waitForTimeout(2500);
    expect(await readDoc(request, `users/${uid}`)).toBeNull();
    expect(await readCollection(request, `users/${uid}/sessions`)).toEqual([]);
    await other.close();

    // A conta não existe mais: entrar de novo com a mesma conta Google cria outra
    expect(await createAccount(request)).not.toBe(uid);
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

// ---------- Modo personal (item 12) ----------

const PAULO = { sub: 'e2e-paulo', email: 'paulo@example.com', email_verified: true };

// Celular sem nenhum dado
async function freshPhone(browser) {
    const page = await browser.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    return page;
}

// Primeiro acesso (nome e o modelo "Corpo inteiro A/B") e login; devolve o uid
async function setUpPhone(page, nome, account) {
    await page.goto(`${APP}?emulator`);
    await page.locator('#welcome-name').fill(nome);
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await expect(page.locator('#cloud-title')).toHaveText('Backup desativado [emulator]');
    const uid = await signIn(page, account);
    await expect(page.locator('#cloud-detail')).toContainText('Último backup');
    return uid;
}

const back = (page) => page.getByRole('button', { name: '‹ Voltar' }).click();

test('modo personal: convite, ficha montada pelo personal, histórico da aluna e remoção do acesso', async ({ browser, request }) => {
    // Dois celulares e várias sincronizações
    test.slow();
    const trainer = await freshPhone(browser);
    const student = await freshPhone(browser);
    const pauloUid = await setUpPhone(trainer, 'Paulo', PAULO);
    const anaUid = await setUpPhone(student, 'Ana', ANA);

    // O personal ativa o modo personal e gera um código
    await trainer.getByRole('button', { name: 'Fichas', exact: true }).click();
    await trainer.getByRole('button', { name: 'Sou personal' }).click();
    await trainer.getByRole('button', { name: 'Ativar o modo personal' }).click();
    await trainer.getByRole('button', { name: 'Gerar código de convite' }).click();
    const code = (await trainer.locator('.invite-code').textContent()).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(trainer.locator('#students')).toContainText('Nenhum aluno ainda');
    await expect.poll(async () => (await readDoc(request, `users/${pauloUid}`)).isTrainer, { timeout: 15000 }).toBe(true);

    // A aluna digita o código (como ditado: minúsculas, com espaço) e confirma
    await student.getByRole('button', { name: 'Fichas', exact: true }).click();
    await student.getByRole('button', { name: 'Tenho um código de personal' }).click();
    await student.getByLabel('Código do personal').fill('XXXXXX');
    await student.getByRole('button', { name: 'Continuar' }).click();
    await expect(student.locator('#invite')).toContainText('Código não encontrado ou vencido');
    await student.getByLabel('Código do personal').fill(`${code.slice(0, 3)} ${code.slice(3)}`.toLowerCase());
    await student.getByRole('button', { name: 'Continuar' }).click();
    await expect(student.locator('.invite-confirm')).toContainText('Dar acesso a Paulo?');
    await student.getByRole('button', { name: 'Dar acesso' }).click();
    await expect(student.locator('.person-item[data-trainer="Paulo"]')).toBeVisible();
    expect(await readDoc(request, `users/${anaUid}`)).toMatchObject({ trainers: { [pauloUid]: true }, trainerNames: { [pauloUid]: 'Paulo' } });

    // O personal vê a aluna e monta uma ficha para ela
    await back(trainer);
    await trainer.getByRole('button', { name: '👥 Meus alunos' }).click();
    await expect(trainer.locator('.student-item[data-student="Ana"]')).toContainText('Nenhum treino ainda');
    await trainer.locator('.student-item[data-student="Ana"]').click();
    await expect(trainer.locator('h1')).toHaveText('Ana');
    await expect(trainer.locator('.plan-card[data-plan="Corpo inteiro A/B"]')).toContainText('Montada pelo aluno');
    await trainer.getByRole('button', { name: '+ Nova ficha para o aluno' }).click();
    await trainer.getByRole('button', { name: /Montar do zero/ }).click();
    await trainer.locator('#plan-name').fill('Ficha do Paulo');
    await trainer.locator('.editor-item-main', { hasText: 'Treino A' }).click();
    await trainer.getByRole('button', { name: '+ Adicionar exercício' }).click();
    await trainer.getByLabel('Buscar exercício').fill('agachamento livre');
    await trainer.locator('.picker-item', { hasText: 'Agachamento Livre com Barra' }).click();
    await trainer.locator('.editor-card[data-exercise="Agachamento Livre com Barra"]').getByLabel('Séries').selectOption('4');
    await expect.poll(async () => (await readCollection(request, `users/${anaUid}/plans`)).find((p) => p.nome === 'Ficha do Paulo'), { timeout: 15000 })
        .toMatchObject({
            createdBy: pauloUid, updatedBy: pauloUid,
            treinos: [{ nome: 'Treino A', exercicios: [{ exerciseId: 'agachamento-livre', series: 4 }] }]
        });

    // A aluna recebe o aviso e passa a usar a ficha
    await back(student);
    await back(student);
    await student.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const notice = student.locator('#trainer-notice');
    await expect(notice).toContainText('Ficha atualizada pelo seu personal: Ficha do Paulo');
    await notice.getByRole('button', { name: 'Usar esta ficha' }).click();
    await expect(notice).toHaveCount(0);
    const card = exerciseCard(student, 'Agachamento Livre com Barra');
    await doSets(card, [[60, 8], [60, 8], [60, 8], [60, 8]]);
    await expect.poll(() => student.evaluate(() => Object.values(JSON.parse(localStorage.getItem('treino.lastValues') || '{}'))
        .some((v) => v.sets && v.sets.length === 4 && v.sets[3].reps === '8'))).toBe(true);
    await student.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect.poll(async () => (await readCollection(request, `users/${anaUid}/sessions`)).length, { timeout: 15000 }).toBe(1);

    // Para ela, a ficha do personal é só leitura
    await student.getByRole('button', { name: 'Fichas', exact: true }).click();
    const trainerPlan = student.locator('.plan-card[data-plan="Ficha do Paulo"]');
    await expect(trainerPlan).toContainText('Montada por Paulo');
    await trainerPlan.getByRole('button', { name: 'Ver' }).click();
    await expect(student.locator('.trainer-plan-note')).toContainText('Paulo');
    await expect(student.locator('.plan-summary')).toContainText('4 séries de 10 a 12 repetições');
    await expect(student.locator('#plan-name')).toHaveCount(0);

    // O personal vê o histórico e os gráficos da aluna, sem editar
    await back(trainer);
    await back(trainer);
    await expect(trainer.locator('h1')).toHaveText('Ana');
    await expect(trainer.locator('.progress-link')).toContainText('Último treino: hoje');
    await trainer.getByRole('button', { name: /Histórico e gráficos/ }).click();
    await expect(trainer.locator('h1')).toHaveText('Treinos de Ana');
    await expect(trainer.locator('#weekly')).toContainText('1 treino esta semana');
    await expect(trainer.locator('#exercise-progress')).toContainText('60 kg');
    await trainer.locator('.history-entry summary').click();
    await expect(trainer.locator('.history-entry')).toContainText('Agachamento Livre com Barra');
    await expect(trainer.getByRole('button', { name: /Editar|Apagar/ })).toHaveCount(0);

    // A aluna remove o acesso: a ficha passa a ser dela, e o personal não a vê mais
    await back(student);
    await student.getByRole('button', { name: 'Ver quem tem acesso' }).click();
    await student.locator('.person-item[data-trainer="Paulo"]').getByRole('button', { name: 'Remover acesso' }).click();
    await expect(student.locator('#toast')).toHaveText('Acesso removido');
    await expect(student.locator('#trainers')).toContainText('Nenhum personal tem acesso');
    expect((await readDoc(request, `users/${anaUid}`)).trainers || {}).toEqual({});
    await back(student);
    await expect(trainerPlan.getByRole('button', { name: 'Editar' })).toBeVisible();
    await back(student);
    await expect(student.locator('#cloud-detail')).toContainText('Último backup');

    await back(trainer);
    await back(trainer);
    await expect(trainer.locator('#students')).toContainText('Nenhum aluno ainda');
    await trainer.close();
    await student.close();
});

test('personal que exclui a conta sai da lista dos alunos e apaga os convites', async ({ browser, request }) => {
    const anaUid = await createAccount(request, ANA);
    const pauloUid = await createAccount(request, PAULO);
    expect(await writeDoc(request, `users/${anaUid}`, {
        nome: 'Ana', schema: 2, profileUpdatedAt: 1, trainers: { [pauloUid]: true }, trainerNames: { [pauloUid]: 'Paulo' }
    })).toBe(true);
    expect(await writeDoc(request, `users/${anaUid}/plans/pp`, {
        nome: 'Do Paulo', treinos: [], createdBy: pauloUid, updatedBy: pauloUid, updatedAt: 1
    })).toBe(true);
    expect(await writeDoc(request, 'invites/ABCDEF', {
        trainerUid: pauloUid, trainerNome: 'Paulo', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    })).toBe(true);

    const trainer = await freshPhone(browser);
    await setUpPhone(trainer, 'Paulo', PAULO);
    await trainer.getByRole('button', { name: 'Privacidade e seus dados' }).click();
    await trainer.getByRole('button', { name: 'Excluir conta e dados' }).click();
    await trainer.getByRole('button', { name: 'Sim, excluir tudo' }).click();
    await expect(trainer.locator('#toast')).toHaveText('Conta excluída');

    // A aluna continua com os dados dela, inclusive a ficha que o personal montou
    const ana = await readDoc(request, `users/${anaUid}`);
    expect(ana).toMatchObject({ nome: 'Ana' });
    expect(ana.trainers || {}).toEqual({});
    expect(ana.trainerNames || {}).toEqual({});
    expect((await readCollection(request, `users/${anaUid}/plans`)).map((p) => p.id)).toEqual(['pp']);
    expect(await readCollection(request, 'invites')).toEqual([]);
    expect(await readDoc(request, `users/${pauloUid}`)).toBeNull();
    await trainer.close();
});
