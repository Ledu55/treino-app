import { test as base, expect } from '@playwright/test';

export const APP = './';

export const test = base.extend({
    // false no arquivo de teste da nuvem, que precisa carregar o Firebase
    blockFirebase: [true, { option: true }],

    page: async ({ page, blockFirebase }, use) => {
        // confirm() do app ("Finalizar mesmo assim?", "Apagar?") é sempre aceito
        page.on('dialog', (dialog) => dialog.accept());
        if (blockFirebase) {
            // Sem o SDK (carregado sob demanda), o app fica como se estivesse sem internet
            // e não fala com o projeto Firebase de dev que localhost usaria
            await page.route('**/assets/firebase-sdk-*.js', (route) => route.abort());
        }
        await use(page);
    }
});

export { expect };

// Grava dados no localStorage antes do app abrir (só na primeira carga da página)
export async function seedStorage(page, data) {
    await page.addInitScript((entries) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        for (const [key, value] of Object.entries(entries)) {
            localStorage.setItem(key, JSON.stringify(value));
        }
    }, data);
}

export function exerciseCard(page, nome) {
    return page.locator(`.exercise-card[data-exercise="${nome}"]`);
}

// Preenche carga e reps de cada série de trabalho e marca a série como feita
export async function doSets(card, rows) {
    for (const [i, [kg, reps]] of rows.entries()) {
        await card.locator('.set-weight-input').nth(i).fill(String(kg));
        await card.locator('.set-reps-input').nth(i).fill(String(reps));
        await card.getByRole('button', { name: `Série ${i + 1}`, exact: true }).click();
    }
}

// Os campos salvam com 300 ms de atraso; espera os valores do exercício (ex.: 'A|Agachamento')
// chegarem ao localStorage. `expected` é comparado com toMatchObject.
export async function waitForSaved(page, key, expected) {
    await expect.poll(() => page.evaluate((k) => {
        const data = JSON.parse(localStorage.getItem('treino.exerciseData') || '{}');
        return data[k] || {};
    }, key)).toMatchObject(expected);
}

// Valores esperados das séries salvas, a partir das mesmas linhas passadas para doSets
export function savedSets(rows) {
    return { sets: rows.map(([kg, reps]) => ({ weight: String(kg), reps: String(reps) })) };
}
