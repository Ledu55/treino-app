import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Publicado em https://ledu55.github.io/treino-app/. GIFs, ícones, manifest e sw.js ficam em
// public/ e são copiados sem alteração; o sw.js vira gerado no item 4 do roadmap.
export default defineConfig({
    base: '/treino-app/',
    plugins: [preact()],
    server: { port: 8000 },
    build: {
        rollupOptions: {
            input: {
                app: 'meu_treino_app.html',
                // Redireciona para o app; vira o app de fato quando ele for renomeado (item 3)
                index: 'index.html'
            }
        }
    }
});
