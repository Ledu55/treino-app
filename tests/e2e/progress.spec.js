// Gráficos e recordes (item 11): aviso de recorde ao finalizar, frequência semanal e evolução
// por exercício.
import { test, expect, APP, seedStorage, exerciseCard, doSets, waitForSaved, savedSets } from './fixtures.js';

const AGACHAMENTO = 'Agachamento';
const RECORD_SETS = [['42,5', 6], ['42,5', 6], ['42,5', 6]];

// Treino A antigo (formato v1, migrado ao abrir): Agachamento 40 × 8 nas 3 séries
const previous = {
    id: 1759000000000,
    date: new Date(1759000000000).toISOString(),
    workout: 'A',
    workoutNote: '',
    doneCount: 1,
    totalCount: 6,
    exercises: [{
        nome: AGACHAMENTO,
        note: '',
        sets: [1, 2, 3].map(() => ({ weight: '40', reps: '8', done: true })),
        setsDone: 3,
        setsTotal: 3
    }]
};

test('recorde ao finalizar, frequência semanal e gráfico do exercício', async ({ page }) => {
    await seedStorage(page, { 'treino.history': [previous] });
    await page.goto(APP);
    await expect(page.locator('.progress-link-week')).toHaveText('Nenhum treino esta semana');

    await doSets(exerciseCard(page, AGACHAMENTO), RECORD_SETS);
    await waitForSaved(page, 'A|agachamento', savedSets(RECORD_SETS));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await expect(page.locator('#toast')).toHaveText('🏆 Novo recorde: Agachamento (42,5 kg)');
    await expect(page.locator('.progress-link-week')).toHaveText('1 treino esta semana');

    // O recorde fica marcado no histórico
    await page.getByText('Histórico de treinos').click();
    const entry = page.locator('.history-entry').first();
    await entry.locator('summary').click();
    await expect(entry.locator('tr', { hasText: AGACHAMENTO }).locator('.entry-record')).toBeVisible();
    await expect(page.locator('.entry-record')).toHaveCount(1);

    await page.getByRole('button', { name: /Gráficos e recordes/ }).click();
    await expect(page).toHaveURL(/#progresso$/);
    await expect(page.locator('h1')).toHaveText('Gráficos e recordes');
    await expect(page.locator('.week-count')).toHaveText('1 treino esta semana');
    await expect(page.locator('#weekly .chart-bar')).toHaveCount(1);

    const progress = page.locator('#exercise-progress');
    await expect(progress.getByLabel('Exercício')).toHaveValue('agachamento');
    await expect(progress.locator('.stat-tile').first()).toContainText('42,5 kg');
    await expect(progress.locator('.chart-readout strong')).toHaveText('42,5 kg × 6');
    await expect(progress.locator('.chart-dot')).toHaveCount(2);
    await expect(progress.locator('.progress-table tbody tr')).toHaveCount(2);
    await expect(progress.locator('.progress-table tbody tr').first()).toContainText('🏆');

    // Setas do teclado escolhem o treino mostrado; Volume troca o gráfico
    await progress.getByRole('img').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(progress.locator('.chart-readout strong')).toHaveText('40 kg × 8');
    await progress.getByRole('button', { name: 'Volume' }).click();
    await expect(progress.getByRole('button', { name: 'Volume' })).toHaveAttribute('aria-pressed', 'true');
    await expect(progress.locator('.chart-readout strong')).toHaveText('960 kg');
    await page.keyboard.press('ArrowRight');
    await expect(progress.locator('.chart-readout strong')).toHaveText('960 kg');
    await progress.getByRole('img').focus();
    await page.keyboard.press('ArrowRight');
    await expect(progress.locator('.chart-readout strong')).toHaveText('765 kg');

    // Nada sai da largura do celular
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // O botão voltar do Android volta ao treino
    await page.goBack();
    await expect(exerciseCard(page, AGACHAMENTO)).toBeVisible();
});

test('sem treinos com carga, a tela explica quando os gráficos aparecem', async ({ page }) => {
    await page.goto(APP + '#progresso');
    await expect(page.locator('.week-count')).toHaveText('Nenhum treino esta semana');
    await expect(page.getByText('Os gráficos aparecem depois do primeiro treino finalizado')).toBeVisible();
    await page.getByRole('button', { name: /Voltar/ }).click();
    await expect(exerciseCard(page, AGACHAMENTO)).toBeVisible();
});
