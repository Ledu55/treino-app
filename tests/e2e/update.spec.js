// Atualização do app pelo service worker: serve dois builds (v1 e v2) em sequência no mesmo
// endereço, como acontece no celular depois de um push no main.
import { cpSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { extname, join } from 'node:path';
import { test, expect, exerciseCard } from './fixtures.js';

const PORT = 8124;
// ?emulator: este servidor é localhost, que sem isso usaria o projeto Firebase de dev
const APP_URL = `http://localhost:${PORT}/treino-app/?emulator`;
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
    '.gif': 'image/gif', '.webmanifest': 'application/manifest+json'
};

// Builds gerados por global-setup.js
const dir = process.env.UPDATE_BUILDS_DIR;
const builds = { v1: join(dir, 'e2e-v1'), v2: join(dir, 'e2e-v2'), legacy: join(dir, 'legacy') };
let server;
let root;   // pasta servida no momento

test.describe.configure({ mode: 'serial' });
test.use({ serviceWorkers: 'allow' });

test.beforeAll(async () => {
    // v1 com o sw.js escrito à mão que está no celular de quem já usa o app (v9)
    cpSync(builds.v1, builds.legacy, { recursive: true });
    cpSync(new URL('./legacy-sw.js', import.meta.url), join(builds.legacy, 'sw.js'));

    server = http.createServer((req, res) => {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (!path.startsWith('/treino-app/')) { res.writeHead(404); res.end(); return; }
        path = path.slice('/treino-app/'.length) || 'index.html';
        try {
            const body = readFileSync(join(root, path));
            res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache' });
            res.end(body);
        } catch (e) {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => server.listen(PORT, resolve));
});

test.afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
});

// Espera o service worker da página assumir o controle
async function waitForControl(page) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('nova versão: aparece o aviso e "Atualizar" carrega a versão nova', async ({ page }) => {
    root = builds.v1;
    await page.goto(APP_URL);
    await expect(page.locator('.app-version')).toHaveText('Versão e2e-v1');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await waitForControl(page);

    // Push no main: o próximo acesso encontra o sw.js novo
    root = builds.v2;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
    // Até a pessoa tocar em "Atualizar", continua a versão antiga
    await expect(page.locator('.app-version')).toHaveText('Versão e2e-v1');

    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(page.locator('.app-version')).toHaveText('Versão e2e-v2');
    await expect(page.getByRole('button', { name: 'Atualizar' })).toHaveCount(0);
});

test('o app abre sem internet depois da primeira visita', async ({ page, context }) => {
    root = builds.v1;
    await page.goto(APP_URL);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await waitForControl(page);

    await context.setOffline(true);
    await page.reload();
    await expect(exerciseCard(page, 'Agachamento')).toBeVisible();
    await expect(page.locator('.app-version')).toHaveText('Versão e2e-v1');
    // GIF que nunca foi aberto também está no cache
    const gifOk = await page.evaluate(async () => (await fetch('gifs/leg-press.gif')).ok);
    expect(gifOk).toBe(true);
    await context.setOffline(false);
});

test('quem tem o sw.js antigo passa para o novo sem precisar tocar em nada', async ({ page }) => {
    root = builds.legacy;
    await page.goto(`http://localhost:${PORT}/treino-app/meu_treino_app.html`);
    await page.waitForURL(/\/treino-app\/$/);
    await waitForControl(page);
    expect(await page.evaluate(() => caches.keys())).toContain('meu-treino-v9');

    root = builds.v2;
    await page.reload();
    // O novo assume sozinho e apaga os caches antigos
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 15000 })
        .not.toContain('meu-treino-v9');
    await page.reload();
    await expect(page.locator('.app-version')).toHaveText('Versão e2e-v2');
    await expect(page.getByRole('button', { name: 'Atualizar' })).toHaveCount(0);
});
