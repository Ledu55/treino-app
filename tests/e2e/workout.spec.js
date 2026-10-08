import { test, expect, APP, seedStorage, exerciseCard, doSets, waitForSaved, savedSets } from './fixtures.js';

// Treino A tem 6 exercícios; o Agachamento tem 3 séries de 6 a 8 repetições
const AGACHAMENTO = 'Agachamento';
const TOP_SETS = [[40, 8], [40, 8], [40, 8]];

test('marcar séries atualiza o progresso e continua marcado ao reabrir', async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator('#progress-text')).toHaveText('0/6 exercícios');

    const card = exerciseCard(page, AGACHAMENTO);
    await card.getByRole('button', { name: 'Aquec. 1' }).click();
    await expect(card.getByRole('button', { name: 'Aquec. 1' })).toHaveAttribute('aria-pressed', 'true');

    for (const n of [1, 2, 3]) {
        await expect(card).not.toHaveClass(/\bdone\b/);
        await card.getByRole('button', { name: `Série ${n}`, exact: true }).click();
    }
    await expect(card).toHaveClass(/\bdone\b/);
    await expect(page.locator('#progress-text')).toHaveText('1/6 exercícios');

    // Desmarcar uma série tira o exercício de concluído
    await card.getByRole('button', { name: 'Série 2', exact: true }).click();
    await expect(card).not.toHaveClass(/\bdone\b/);
    await card.getByRole('button', { name: 'Série 2', exact: true }).click();

    await page.reload();
    await expect(exerciseCard(page, AGACHAMENTO)).toHaveClass(/\bdone\b/);
    await expect(page.locator('#progress-text')).toHaveText('1/6 exercícios');
});

test('carga, reps e observação digitadas ficam salvas', async ({ page }) => {
    await page.goto(APP);
    const card = exerciseCard(page, AGACHAMENTO);
    await card.locator('.set-weight-input').nth(0).fill('40');
    await card.locator('.set-reps-input').nth(0).fill('8');
    await card.locator('.exercise-note-input').fill('banco no 4');
    await waitForSaved(page, 'A|agachamento', { note: 'banco no 4', sets: [{ weight: '40', reps: '8' }] });

    await page.reload();
    const reopened = exerciseCard(page, AGACHAMENTO);
    await expect(reopened.locator('.set-weight-input').nth(0)).toHaveValue('40');
    await expect(reopened.locator('.set-reps-input').nth(0)).toHaveValue('8');
    await expect(reopened.locator('.exercise-note-input')).toHaveValue('banco no 4');
});

test('pausa no meio da digitação não come o espaço', async ({ page }) => {
    await page.goto(APP);
    const note = exerciseCard(page, AGACHAMENTO).locator('.exercise-note-input');
    // O campo salva 300 ms depois da última tecla, sem os espaços das pontas
    await note.pressSequentially('banco ');
    await waitForSaved(page, 'A|agachamento', { note: 'banco' });
    await note.pressSequentially('no 4');
    await expect(note).toHaveValue('banco no 4');
    await waitForSaved(page, 'A|agachamento', { note: 'banco no 4' });
});

test('o que foi digitado logo antes de trocar de treino fica salvo', async ({ page }) => {
    await page.goto(APP);
    await exerciseCard(page, AGACHAMENTO).locator('.set-weight-input').nth(0).fill('50');
    await page.getByLabel('Escolher treino').selectOption('B');
    await waitForSaved(page, 'A|agachamento', { sets: [{ weight: '50' }] });
});

test('timer de descanso: abre, ganha +30s e fecha', async ({ page }) => {
    await page.goto(APP);
    const bar = page.locator('#timer-bar');
    await expect(bar).not.toHaveClass(/visible/);

    // Agachamento: 150 s de descanso
    await exerciseCard(page, AGACHAMENTO).getByRole('button', { name: /Descanso \(2:30\)/ }).click();
    await expect(bar).toHaveClass(/visible/);
    await expect(page.locator('#timer-display')).toHaveText(/^2:(30|29)$/);

    await page.getByRole('button', { name: '+30s' }).click();
    await expect(page.locator('#timer-display')).toHaveText(/^(3:00|2:59)$/);

    await page.getByRole('button', { name: 'Fechar / Parar' }).click();
    await expect(bar).not.toHaveClass(/visible/);
});

test('o endereço antigo (meu_treino_app.html) leva ao app', async ({ page }) => {
    await page.goto('meu_treino_app.html');
    await expect(page).toHaveURL(/\/treino-app\/$/);
    await expect(exerciseCard(page, AGACHAMENTO)).toBeVisible();
});

test('finalizar o treino guarda no histórico e mostra a sugestão de carga', async ({ page }) => {
    await page.goto(APP);
    const card = exerciseCard(page, AGACHAMENTO);
    await expect(card.locator('.suggestion')).toHaveCount(0);

    // Topo da faixa (8 reps) nas 3 séries → sugestão de subir 2,5 kg
    await page.locator('#workout-note').fill('treino bom');
    await doSets(card, TOP_SETS);
    await waitForSaved(page, 'A|agachamento', savedSets(TOP_SETS));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect(page.locator('#toast')).toHaveText(/Treino salvo/);

    // A sessão recomeça zerada, mas a carga digitada continua lá
    await expect(page.locator('#progress-text')).toHaveText('0/6 exercícios');
    await expect(card.getByRole('button', { name: 'Série 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(card.locator('.set-weight-input').nth(0)).toHaveValue('40');
    await expect(page.locator('#workout-note')).toHaveValue('');

    await expect(card.locator('.suggestion')).toHaveClass(/suggestion-up/);
    await expect(card.locator('.suggestion')).toContainText('42,5 kg');

    // Histórico
    await page.getByText('Histórico de treinos').click();
    const entry = page.locator('.history-entry').first();
    await expect(page.locator('.history-entry')).toHaveCount(1);
    await expect(entry).toContainText('Treino A');
    await expect(entry).toContainText('1/6 exercícios');
    await entry.locator('summary').click();
    await expect(entry).toContainText('S1: 40 × 8');
    await expect(entry).toContainText('"treino bom"');
});

test('"Usar" aplica a carga sugerida em todas as séries', async ({ page }) => {
    // Dois treinos seguidos abaixo da faixa com 40 kg → sugestão de reduzir para 35 kg
    const failed = (id) => ({
        id,
        date: new Date(id).toISOString(),
        workout: 'A',
        workoutNote: '',
        doneCount: 1,
        totalCount: 6,
        exercises: [{
            nome: AGACHAMENTO,
            note: '',
            sets: [1, 2, 3].map(() => ({ weight: '40', reps: '5', done: true })),
            setsDone: 3,
            setsTotal: 3
        }]
    });
    await seedStorage(page, { 'treino.history': [failed(1760000000000), failed(1759000000000)] });
    await page.goto(APP);

    const card = exerciseCard(page, AGACHAMENTO);
    await expect(card.locator('.suggestion')).toHaveClass(/suggestion-down/);
    await expect(card.locator('.suggestion')).toContainText('35 kg');

    // A sugestão não preenche nada sozinha
    await expect(card.locator('.set-weight-input').nth(0)).toHaveValue('');

    await card.getByRole('button', { name: 'Usar' }).click();
    for (const i of [0, 1, 2]) {
        await expect(card.locator('.set-weight-input').nth(i)).toHaveValue('35');
    }
    await expect(page.locator('#toast')).toHaveText('Carga de 35 kg aplicada');

    await page.reload();
    await expect(exerciseCard(page, AGACHAMENTO).locator('.set-weight-input').nth(2)).toHaveValue('35');
});

test('apagar um treino do histórico remove a sugestão que vinha dele', async ({ page }) => {
    await page.goto(APP);
    const card = exerciseCard(page, AGACHAMENTO);
    await doSets(card, TOP_SETS);
    await waitForSaved(page, 'A|agachamento', savedSets(TOP_SETS));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect(card.locator('.suggestion')).toBeVisible();

    await page.getByText('Histórico de treinos').click();
    await page.locator('.history-entry summary').first().click();
    await page.getByRole('button', { name: /Apagar/ }).click();

    await expect(page.locator('.history-entry')).toHaveCount(0);
    await expect(exerciseCard(page, AGACHAMENTO).locator('.suggestion')).toHaveCount(0);
});

test('corrigir um treino do histórico atualiza a sugestão de carga', async ({ page }) => {
    await page.goto(APP);
    const card = exerciseCard(page, AGACHAMENTO);
    await doSets(card, TOP_SETS);
    await waitForSaved(page, 'A|agachamento', savedSets(TOP_SETS));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect(card.locator('.suggestion')).toContainText('42,5 kg');

    await page.getByText('Histórico de treinos').click();
    const entry = page.locator('.history-entry').first();
    await entry.locator('summary').click();
    await entry.getByRole('button', { name: /Editar/ }).click();

    // Na verdade a 3ª série foi de 6 reps e a observação ficou faltando
    const editor = entry.locator(`.history-editor-exercise[data-exercise="${AGACHAMENTO}"]`);
    await expect(editor.getByLabel('Carga da série 1')).toHaveValue('40');
    await editor.getByLabel('Reps da série 3').fill('6');
    await editor.locator('.exercise-note-input').fill('banco no 4');
    await entry.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('#toast')).toHaveText('Treino corrigido');

    await expect(entry).toContainText('S3: 40 × 6');
    await expect(entry).toContainText('banco no 4');
    await expect(card.locator('.suggestion')).toHaveClass(/suggestion-keep/);
    await expect(card.locator('.suggestion')).toContainText('40 kg');
    // Os últimos valores digitados no treino não mudam com a correção do histórico
    await expect(card.locator('.set-reps-input').nth(2)).toHaveValue('8');

    // Desmarcar uma série tira o exercício dos concluídos
    await entry.getByRole('button', { name: /Editar/ }).click();
    await editor.getByRole('button', { name: 'Série 2 feita' }).click();
    await expect(editor.getByRole('button', { name: 'Série 2 feita' })).toHaveAttribute('aria-pressed', 'false');
    await entry.getByRole('button', { name: 'Salvar' }).click();
    await expect(entry.locator('.entry-meta')).toHaveText('0/6 exercícios');

    // Cancelar descarta o que foi digitado
    await entry.getByRole('button', { name: /Editar/ }).click();
    await editor.getByLabel('Carga da série 1').fill('99');
    await entry.getByRole('button', { name: 'Cancelar' }).click();
    await expect(entry).not.toContainText('99');

    await page.reload();
    await page.getByText('Histórico de treinos').click();
    await page.locator('.history-entry summary').first().click();
    await expect(page.locator('.history-entry').first()).toContainText('S3: 40 × 6');
    await expect(page.locator('.history-entry').first()).toContainText('✓ S1');
    await expect(page.locator('.history-entry').first()).toContainText('· S2');
});

test('cada treino tem sua sessão, e o app reabre no último treino escolhido', async ({ page }) => {
    await page.goto(APP);
    await exerciseCard(page, AGACHAMENTO).getByRole('button', { name: 'Série 1', exact: true }).click();

    await page.getByLabel('Escolher treino').selectOption('B');
    await expect(exerciseCard(page, 'Supino Inclinado Máquina')).toBeVisible();
    await expect(page.locator('.set-box.active')).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel('Escolher treino')).toHaveValue('B');

    await page.getByLabel('Escolher treino').selectOption('A');
    await expect(exerciseCard(page, AGACHAMENTO).getByRole('button', { name: 'Série 1', exact: true }))
        .toHaveAttribute('aria-pressed', 'true');
});

test.describe('celular sem dados do app', () => {
    test.use({ existingUser: false });

test('dados de uma versão mais nova do app: não abre o treino nem altera nada', async ({ page }) => {
    const data = {
        'treino.schemaVersion': { version: 999 },
        'treino.history': [{ id: 1, formatoNovo: true }],
        'treino.exerciseData': { 'x': { y: 1 } }
    };
    await seedStorage(page, data);
    await page.goto(APP);
    await expect(page.getByText('Seus treinos foram salvos por uma versão mais nova do app')).toBeVisible();
    await expect(page.locator('.exercise-card')).toHaveCount(0);

    const stored = await page.evaluate(() => Object.fromEntries(
        Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))])
    ));
    expect(stored).toEqual(data);
});
});
