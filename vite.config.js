import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Publicado em https://ledu55.github.io/treino-app/. GIFs, ícones, manifest, sw.js e o
// redirecionamento do endereço antigo (meu_treino_app.html) ficam em public/ e são copiados sem
// alteração; o sw.js vira gerado no item 4 do roadmap.
export default defineConfig({
    base: '/treino-app/',
    plugins: [preact()],
    server: { port: 8000 }
});
