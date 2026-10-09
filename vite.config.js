import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Versão mostrada no rodapé do app: commit + data do build (APP_VERSION substitui, nos testes)
function appVersion() {
    if (process.env.APP_VERSION) return process.env.APP_VERSION;
    let commit = 'dev';
    try {
        commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch (e) { /* sem git */ }
    return `${new Date().toISOString().slice(0, 10)} ${commit}`;
}

// Publicado em https://ledu55.github.io/treino-app/. GIFs, ícones, manifest e o redirecionamento
// do endereço antigo (meu_treino_app.html) ficam em public/ e são copiados sem alteração.
export default defineConfig({
    base: '/treino-app/',
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: [
        preact(),
        // O service worker sai de src/sw.js com a lista de arquivos do build. Mesmo nome (sw.js) e
        // escopo do antigo, para substituir o que já está instalado no celular.
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            registerType: 'prompt',
            injectRegister: false,
            manifest: false,
            injectManifest: {
                // Tudo, inclusive os GIFs e o SDK do Firebase, para o app abrir sem internet
                globPatterns: ['**/*.{html,js,css,png,gif,webmanifest}'],
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
            }
        })
    ],
    // Só a porta 8000: a chave da API do Firebase de dev só aceita localhost:8000. Sem strictPort,
    // com a 8000 ocupada o Vite passaria para a 8001 em silêncio e o login com Google falharia.
    server: { port: 8000, strictPort: true }
});
