// Primeiro acesso (item 8): celular sem nenhum dado do app
import { test, expect, APP, exerciseCard } from './fixtures.js';

test.use({ existingUser: false });

test('configura com um modelo e abre direto no treino nas próximas vezes', async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator('h1')).toHaveText('Meu Treino');
    // Sem o SDK do Firebase (como sem internet), o backup fica para depois e nada é bloqueado
    await expect(page.getByText('Você pode ativar o backup depois')).toBeVisible();

    await page.locator('#welcome-name').fill('Ana');
    await page.getByRole('button', { name: /Ficha A\/B\/C\/D/ }).click();
    await expect(page.getByRole('button', { name: /Ficha A\/B\/C\/D/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Começar', exact: true }).click();

    await expect(page.locator('h1')).toHaveText('Treino de Ana');
    await expect(page).toHaveTitle('Treino de Ana');
    await expect(page.locator('#progress-text')).toHaveText('0/6 exercícios');
    await exerciseCard(page, 'Agachamento').getByRole('button', { name: 'Série 1', exact: true }).click();

    await page.reload();
    await expect(page.locator('h1')).toHaveText('Treino de Ana');
    await expect(exerciseCard(page, 'Agachamento').getByRole('button', { name: 'Série 1', exact: true }))
        .toHaveAttribute('aria-pressed', 'true');
});

test('ficha do zero abre o editor', async ({ page }) => {
    await page.goto(APP);
    await page.getByRole('button', { name: /Montar do zero/ }).click();
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('Editar ficha');
    await page.locator('.editor-item-main').first().click();
    await page.getByRole('button', { name: '+ Adicionar exercício' }).click();
    await page.getByLabel('Buscar exercício').fill('leg press');
    await page.locator('.picker-item', { hasText: 'Leg Press' }).click();
    await page.goto(APP);
    await expect(page.locator('h1')).toHaveText('Meu Treino');
    await expect(page.locator('.exercise-title')).toHaveText(['Leg Press']);
});
