// Quem já usava o app (dados v1) abre a versão nova e encontra tudo igual
import { readFileSync } from 'node:fs';
import { test, expect, APP, seedStorage, exerciseCard } from './fixtures.js';

const v1 = JSON.parse(readFileSync(new URL('../unit/fixtures/dados-v1.json', import.meta.url), 'utf8'));
delete v1._sobre;

// Valores de vários campos (ex.: a carga de cada série)
function expectValues(locator, expected) {
    return expect.poll(() => locator.evaluateAll((els) => els.map((el) => el.value))).toEqual(expected);
}

test('dados da v1 abrem iguais depois da migração', async ({ page }) => {
    await seedStorage(page, v1);
    await page.goto(APP);

    await expect(page.locator('h1')).toHaveText('Treino do Meu Benzinho');
    await expect(page.getByLabel('Escolher treino')).toHaveValue('A');
    await expect(page.getByLabel('Escolher treino').locator('option')).toHaveText([
        'Treino A - Inferiores', 'Treino B - Superiores', 'Treino C - Inferiores 2', 'Treino D - Superiores 2'
    ]);

    // Valores digitados, inclusive os do formato antigo (uma carga e "10, 10, 9" para as reps)
    const agachamento = exerciseCard(page, 'Agachamento');
    await expectValues(agachamento.locator('.set-weight-input'), ['40', '40', '37,5']);
    await expectValues(agachamento.locator('.set-reps-input'), ['8', '7', '']);
    await expect(agachamento.locator('.exercise-note-input')).toHaveValue('banco no 4');
    await expectValues(exerciseCard(page, 'Stiff').locator('.set-reps-input'), ['10', '10', '9']);

    // Treino em andamento: os 2 aquecimentos e a S1 do agachamento continuam marcados
    await expect(agachamento.locator('.set-box.active')).toHaveCount(3);
    await expect(page.locator('#workout-note')).toHaveValue('dor leve no joelho');

    // Sugestão de carga calculada pelo histórico migrado (8, 8, 7 com 40 kg: mantém)
    await expect(agachamento.locator('.suggestion')).toContainText('40 kg');
    await expect(agachamento.locator('.suggestion')).toContainText('+1 rep');

    await page.getByText('Histórico de treinos').click();
    await expect(page.locator('.history-entry')).toHaveCount(4);
    const legacy = page.locator('.history-entry').nth(2);
    await legacy.locator('summary').click();
    await expect(legacy).toContainText('S3: 35 × 6');

    await page.getByLabel('Escolher treino').selectOption('B');
    await expect(exerciseCard(page, 'Elevação Lateral').locator('.suggestion')).toContainText('7 kg');
    await expectValues(exerciseCard(page, 'Elevação Lateral').locator('.set-weight-input'), ['6kg', '6kg', '']);
});
