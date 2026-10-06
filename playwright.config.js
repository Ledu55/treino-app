import { defineConfig, devices } from '@playwright/test';

const PORT = 8123;

export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://localhost:${PORT}/treino-app/`,
        // O service worker guardaria versões antigas entre os testes
        serviceWorkers: 'block',
        trace: 'retain-on-failure'
    },
    projects: [
        { name: 'celular', use: { ...devices['Pixel 7'] } }
    ],
    // Testa o build, que é o que vai para o celular
    webServer: {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/treino-app/meu_treino_app.html`,
        reuseExistingServer: !process.env.CI
    }
});
