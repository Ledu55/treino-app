// Carrega o app real (meu_treino_app.html) no jsdom e devolve o window, onde as funções do
// <script> ficam acessíveis (ex.: window.computeSuggestion). Variáveis `let`/`const` do script não
// ficam no window, então o estado inicial entra pelo localStorage, como no celular.
// Quando o JS virar módulos (fase 2, item 3), os testes passam a importar os módulos direto.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../../meu_treino_app.html', import.meta.url), 'utf8');

export function loadApp(storage = {}) {
    const dom = new JSDOM(html, {
        // Endereço sem configuração Firebase: o app não tenta carregar a nuvem
        url: 'http://app.test/meu_treino_app.html',
        runScripts: 'dangerously',
        beforeParse(window) {
            for (const [key, value] of Object.entries(storage)) {
                window.localStorage.setItem(key, JSON.stringify(value));
            }
        }
    });
    return dom.window;
}

// Converte valores do jsdom em objetos comuns, para comparar com toEqual
export function plain(value) {
    return JSON.parse(JSON.stringify(value));
}
