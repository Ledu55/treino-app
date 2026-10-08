// Editor de fichas (item 7): criar, editar, duplicar, apagar e escolher a ficha ativa
import { test, expect, APP, exerciseCard } from './fixtures.js';

function planCard(page, nome) {
    return page.locator(`.plan-card[data-plan="${nome}"]`);
}

function editorCard(page, nome) {
    return page.locator(`.editor-card[data-exercise="${nome}"]`);
}

async function openPlans(page) {
    await page.getByRole('button', { name: 'Fichas', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('Fichas');
}

async function addExercise(page, search, nome) {
    await page.getByRole('button', { name: '+ Adicionar exercício' }).click();
    await page.getByLabel('Buscar exercício').fill(search);
    await page.locator('.picker-item', { hasText: nome }).click();
    await expect(editorCard(page, nome)).toBeVisible();
}

test('montar uma ficha do zero e treinar com ela', async ({ page }) => {
    await page.goto(APP);
    await openPlans(page);
    await expect(planCard(page, 'Ficha A/B/C/D')).toContainText('Ativa');

    await page.getByRole('button', { name: '+ Nova ficha' }).click();
    await page.getByRole('button', { name: /Montar do zero/ }).click();
    await expect(page.locator('h1')).toHaveText('Editar ficha');
    await page.locator('#plan-name').fill('Minha ficha de casa');

    // Já vem com um treino vazio
    await page.locator('.editor-item-main', { hasText: 'Treino A' }).click();
    await page.locator('#workout-name').fill('Treino A - Pernas');

    // Busca sem acento e por grupo muscular; exercício que não está na biblioteca
    await addExercise(page, 'agachamento livre', 'Agachamento Livre com Barra');
    await addExercise(page, 'triceps', 'Tríceps na Polia com Corda');
    await page.getByRole('button', { name: '+ Adicionar exercício' }).click();
    await page.getByLabel('Buscar exercício').fill('Agachamento Livre com Barra');
    await expect(page.locator('.picker-item', { hasText: 'Agachamento Livre com Barra' })).toBeDisabled();
    await page.getByLabel('Buscar exercício').fill('Polichinelo');
    await page.getByRole('button', { name: '+ Criar exercício "Polichinelo"' }).click();
    await expect(editorCard(page, 'Polichinelo')).toBeVisible();

    // Séries, reps, descanso e observações
    const squat = editorCard(page, 'Agachamento Livre com Barra');
    await squat.getByLabel('Séries').selectOption('4');
    await squat.getByLabel('Reps (mín.)').selectOption('8');
    await squat.getByLabel('Reps (máx.)').selectOption('10');
    await squat.getByLabel('Descanso').selectOption('120');
    await squat.getByLabel('Observações').fill('barra no ombro');
    // Mínimo maior que o máximo puxa o máximo junto
    const triceps = editorCard(page, 'Tríceps na Polia com Corda');
    await triceps.getByLabel('Reps (mín.)').selectOption('15');
    await expect(triceps.getByLabel('Reps (máx.)')).toHaveValue('15');

    // Reordenar: polichinelo primeiro
    await page.getByRole('button', { name: 'Subir Polichinelo' }).click();
    await page.getByRole('button', { name: 'Subir Polichinelo' }).click();
    await expect(page.locator('.editor-card h3')).toHaveText(['Polichinelo', 'Agachamento Livre com Barra', 'Tríceps na Polia com Corda']);

    // Voltar (botão do Android) até a ficha e usá-la
    await page.goBack();
    await expect(page.locator('.editor-item-main')).toContainText(['Treino A - Pernas3 exercícios']);
    await page.getByRole('button', { name: 'Usar esta ficha' }).click();
    await page.getByRole('button', { name: '‹ Voltar' }).click();
    await expect(page.locator('h1')).toHaveText('Fichas');
    await expect(planCard(page, 'Minha ficha de casa')).toContainText('Ativa');
    await page.getByRole('button', { name: '‹ Voltar' }).click();

    // Tela do treino com a ficha nova
    await expect(page.getByLabel('Escolher treino').locator('option')).toHaveText(['Treino A - Pernas']);
    await expect(page.locator('.exercise-title')).toHaveText(['Polichinelo', 'Agachamento Livre com Barra', 'Tríceps na Polia com Corda']);
    const card = exerciseCard(page, 'Agachamento Livre com Barra');
    await expect(card.locator('.exercise-info')).toHaveText('📊 4 séries de 8 a 10 repetições');
    await expect(card.locator('.exercise-obs')).toHaveText('📌 barra no ombro');
    await expect(card.getByRole('button', { name: /Descanso \(2:00\)/ })).toBeVisible();
    await expect(card.locator('.set-weight-input')).toHaveCount(4);
    await expect(exerciseCard(page, 'Tríceps na Polia com Corda').locator('.exercise-info')).toHaveText('📊 3 séries de 15 repetições');
    // Sem GIF: só as instruções; exercício criado: sem detalhes
    await expect(card.locator('.exercise-img')).toHaveCount(0);
    await expect(card.locator('.exercise-instructions')).toBeAttached();
    await expect(exerciseCard(page, 'Polichinelo').locator('.gif-details')).toHaveCount(0);

    // Tudo fica salvo
    await page.reload();
    await expect(page.locator('.exercise-title')).toHaveText(['Polichinelo', 'Agachamento Livre com Barra', 'Tríceps na Polia com Corda']);
});

test('modelo pronto, duplicar e apagar fichas', async ({ page }) => {
    await page.goto(APP);
    await openPlans(page);

    await page.getByRole('button', { name: '+ Nova ficha' }).click();
    await page.getByRole('button', { name: /Corpo inteiro A\/B/ }).click();
    await expect(page.locator('.editor-item-main strong')).toHaveText(['Treino A', 'Treino B']);
    await page.getByRole('button', { name: 'Usar esta ficha' }).click();
    await page.getByRole('button', { name: '‹ Voltar' }).click();
    await page.getByRole('button', { name: '‹ Voltar' }).click();
    await expect(page.getByLabel('Escolher treino').locator('option')).toHaveText(['Treino A', 'Treino B']);
    await expect(exerciseCard(page, 'Leg Press')).toBeVisible();

    // Duplicar a A/B/C/D e apagar a ativa: a ativa passa a ser outra ficha
    await openPlans(page);
    await planCard(page, 'Ficha A/B/C/D').getByRole('button', { name: 'Duplicar' }).click();
    await expect(planCard(page, 'Ficha A/B/C/D (cópia)')).toBeVisible();
    await planCard(page, 'Corpo inteiro A/B').getByRole('button', { name: 'Apagar' }).click();
    await expect(planCard(page, 'Corpo inteiro A/B')).toHaveCount(0);
    await expect(page.locator('.plan-badge')).toHaveCount(1);

    // A cópia é independente: mudar a cópia não muda a original
    await planCard(page, 'Ficha A/B/C/D (cópia)').getByRole('button', { name: 'Editar' }).click();
    await page.locator('.editor-item-main', { hasText: 'Treino A - Inferiores' }).click();
    await page.getByRole('button', { name: 'Tirar Stiff' }).click();
    await expect(editorCard(page, 'Stiff')).toHaveCount(0);
    // A ativa é a original (a primeira em ordem alfabética depois de apagar a outra)
    await page.goto(APP);
    await expect(page.getByLabel('Escolher treino')).toHaveValue('A');
    await expect(exerciseCard(page, 'Stiff')).toBeVisible();
});

test('mudar a ficha no meio do treino não perde as séries marcadas', async ({ page }) => {
    await page.goto(APP);
    await exerciseCard(page, 'Agachamento').getByRole('button', { name: 'Série 1', exact: true }).click();

    await openPlans(page);
    await planCard(page, 'Ficha A/B/C/D').getByRole('button', { name: 'Editar' }).click();
    await page.locator('.editor-item-main', { hasText: 'Treino A - Inferiores' }).click();
    await editorCard(page, 'Agachamento').getByLabel('Séries').selectOption('4');
    await page.getByRole('button', { name: 'Subir Agachamento' }).click();
    await page.goto(APP);

    const card = exerciseCard(page, 'Agachamento');
    await expect(card).toHaveAttribute('data-index', '2');
    await expect(card.getByRole('button', { name: 'Série 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('.set-weight-input')).toHaveCount(4);
});

test('perfil: nome e título do app', async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator('h1')).toHaveText('Treino do Meu Benzinho');
    await openPlans(page);
    await page.locator('#profile-title').fill('');
    await page.locator('#profile-name').fill('Ana');
    await expect(page.locator('#profile-title')).toHaveAttribute('placeholder', 'Treino de Ana');
    await page.getByRole('button', { name: '‹ Voltar' }).click();
    await expect(page.locator('h1')).toHaveText('Treino de Ana');
});

test('sem ficha ativa, a tela do treino leva às fichas', async ({ page }) => {
    await page.goto(APP);
    await openPlans(page);
    await planCard(page, 'Ficha A/B/C/D').getByRole('button', { name: 'Apagar' }).click();
    await expect(page.getByText('Você ainda não tem nenhuma ficha.')).toBeVisible();
    await page.getByRole('button', { name: '‹ Voltar' }).click();
    await expect(page.getByText('Nenhuma ficha ativa.')).toBeVisible();
    await page.getByRole('button', { name: 'Escolher ou criar ficha' }).click();
    await expect(page.locator('h1')).toHaveText('Fichas');
});
