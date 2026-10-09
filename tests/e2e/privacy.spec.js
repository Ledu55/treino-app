// Privacidade e dados (item 10): texto de privacidade, exportação e apagar os dados sem login.
// A exclusão da conta com login fica em cloud.spec.js (precisa do emulador).
import { readFile } from 'node:fs/promises';
import { test, expect, APP, exerciseCard, doSets, waitForSaved, savedSets } from './fixtures.js';

async function openPrivacy(page) {
    await page.getByRole('button', { name: 'Privacidade e seus dados' }).click();
    await expect(page.locator('h1')).toHaveText('Privacidade e dados');
}

async function downloaded(page, buttonName) {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: buttonName }).click()
    ]);
    return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

test('baixa os dados em JSON e o histórico em planilha', async ({ page }) => {
    await page.goto(APP);
    const rows = [[40, 8], [40, 8], [40, 7]];
    await doSets(exerciseCard(page, 'Agachamento'), rows);
    await waitForSaved(page, 'A|agachamento', savedSets(rows));
    await page.getByRole('button', { name: /Finalizar treino/ }).click();

    await openPrivacy(page);
    await expect(page.getByText('O que o app guarda')).toBeVisible();
    // Sem DSN do Sentry, nada de relatórios de erro (nem no texto)
    await expect(page.getByText('Relatórios de erro')).toHaveCount(0);

    const json = await downloaded(page, /Tudo \(JSON\)/);
    expect(json.name).toMatch(/^meu-treino-\d{4}-\d\d-\d\d\.json$/);
    const data = JSON.parse(json.text);
    expect(data).toMatchObject({ app: 'Meu Treino', schema: 2, profile: { titulo: 'Treino do Meu Benzinho' } });
    expect(data.plans.map((p) => p.id)).toEqual(['abcd']);
    expect(data.history).toHaveLength(1);
    expect(data.history[0].exercises.find((e) => e.exerciseId === 'agachamento').sets[2]).toEqual({ weight: '40', reps: '7', done: true });

    const csv = await downloaded(page, /Histórico \(planilha\)/);
    expect(csv.name).toMatch(/^meu-treino-historico-\d{4}-\d\d-\d\d\.csv$/);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Data;Treino;Exercício;Série/);
    expect(lines.slice(1).map((l) => l.split(';').slice(2, 7))).toEqual([
        ['Agachamento', '1', '40', '8', 'sim'],
        ['Agachamento', '2', '40', '8', 'sim'],
        ['Agachamento', '3', '40', '7', 'sim']
    ]);

    // Voltar leva ao treino
    await page.getByRole('button', { name: '‹ Voltar' }).click();
    await expect(page.locator('h1')).toHaveText('Treino do Meu Benzinho');
});

test('sem login, apaga todos os dados do celular e volta ao primeiro acesso', async ({ page }) => {
    await page.goto(APP);
    await page.getByRole('button', { name: /Finalizar treino/ }).click();
    await page.getByRole('button', { name: 'Fichas' }).click();
    await openPrivacy(page);

    await expect(page.getByRole('heading', { name: 'Apagar meus dados' })).toBeVisible();
    await page.getByRole('button', { name: 'Apagar dados deste celular' }).click();
    await expect(page.locator('.delete-confirm')).toContainText('1 ficha e 1 treino do histórico');
    // Cancelar não apaga nada
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Apagar dados deste celular' }).click();
    await page.getByRole('button', { name: 'Sim, excluir tudo' }).click();

    await expect(page.locator('h1')).toHaveText('Meu Treino');
    await expect(page.locator('#toast')).toHaveText('Dados apagados');
    await expect(page.locator('#welcome-name')).toBeVisible();
    // Só o que o app recria vazio ao abrir num celular sem dados
    const saved = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
        .filter((k) => k.startsWith('treino.')).map((k) => [k, JSON.parse(localStorage.getItem(k))])));
    expect(saved).toMatchObject({
        'treino.profile': null, 'treino.plans': {}, 'treino.history': [], 'treino.lastValues': {}, 'treino.session': {}
    });
    expect(saved['treino.cloudMeta']).toBeUndefined();
    expect(Object.values(saved['treino.backupBeforeMigration'].data).filter((v) => v !== null)).toEqual([]);
});

test.describe('primeiro acesso', () => {
    test.use({ existingUser: false });

    test('o texto de privacidade abre antes de configurar o app', async ({ page }) => {
        await page.goto(APP);
        await openPrivacy(page);
        await expect(page.getByText('Neste celular')).toBeVisible();
        await expect(page.locator('#privacy-contact')).toHaveAttribute('href', 'mailto:empulse.impulse@gmail.com');
        // Ainda não há dados para baixar nem apagar
        await expect(page.locator('#export-data')).toHaveCount(0);
        await expect(page.locator('#delete-data')).toHaveCount(0);
        await page.getByRole('button', { name: '‹ Voltar' }).click();
        await expect(page.locator('#welcome-name')).toBeVisible();
    });
});
