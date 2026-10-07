// Gera os dois builds usados por update.spec.js (v1 e v2), uma vez e antes dos testes: fazer o
// build dentro do teste, junto com os navegadores dos outros testes, esgotava a memória.
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default function globalSetup() {
    const dir = mkdtempSync(join(tmpdir(), 'treino-update-'));
    for (const version of ['e2e-v1', 'e2e-v2']) {
        execSync(`npx vite build --outDir "${join(dir, version)}" --emptyOutDir`, {
            env: { ...process.env, APP_VERSION: version },
            stdio: 'ignore'
        });
    }
    process.env.UPDATE_BUILDS_DIR = dir;
    return () => rmSync(dir, { recursive: true, force: true });
}
