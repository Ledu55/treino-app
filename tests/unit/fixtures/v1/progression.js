// Cópia congelada do código da v1 (commit 8063fa1), usada como referência nos testes da migração.
// Sugestão de carga por progressão dupla, a partir do histórico de treinos finalizados.

export const DEFAULT_INCREMENT = 2.5;

// Reparte o campo antigo de reps ("8, 8, 6") por série; valor único vale para todas
export function legacyRepsFor(repsStr, w) {
    if (!repsStr) return '';
    const parts = String(repsStr).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts[w] || '';
}

// Valores da série w (0 = primeira série de trabalho); dados antigos servem de semente
export function getSetValues(saved, w) {
    const s = (saved.sets && saved.sets[w]) || {};
    return {
        weight: s.weight !== undefined ? s.weight : (saved.weight || ''),
        reps: s.reps !== undefined ? s.reps : legacyRepsFor(saved.reps, w)
    };
}

export function parseRepRange(repsStr) {
    const m = /(\d+)\s*a\s*(\d+)/.exec(repsStr || '');
    return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

// Primeiro número de um texto livre ("22,5kg" → 22.5); NaN se não houver
export function parseNumber(str) {
    const m = /\d+(?:[.,]\d+)?/.exec(String(str || ''));
    return m ? Number(m[0].replace(',', '.')) : NaN;
}

export function formatWeight(n) {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatKg(n) {
    return formatWeight(n) + ' kg';
}

// Séries de trabalho de um exercício do histórico, aceitando o formato antigo
export function historySetsFor(entryEx) {
    if (Array.isArray(entryEx.sets)) return entryEx.sets;
    const allDone = entryEx.setsDone >= entryEx.setsTotal;
    const sets = [];
    for (let w = 0; w < (entryEx.setsTotal || 0); w++) {
        sets.push({ weight: entryEx.weight || '', reps: legacyRepsFor(entryEx.reps, w), done: allDone });
    }
    return sets;
}

// Resume uma sessão: carga de referência (maior carga) e se bateu o topo / falhou
function evaluateSession(sets, ex, range) {
    const weights = sets.map((s) => parseNumber(s.weight)).filter((n) => !isNaN(n) && n > 0);
    if (weights.length === 0) return null;
    const done = sets.slice(0, ex.series).filter((s) => s.done);
    const reps = done.map((s) => parseNumber(s.reps));
    const allDone = done.length >= ex.series;
    return {
        weight: Math.max(...weights),
        hitTop: allDone && reps.length > 0 && reps.every((r) => r >= range.max),
        failed: done.length < ex.series / 2 || reps.some((r) => !isNaN(r) && r < range.min)
    };
}

// history: treinos finalizados, do mais novo para o mais antigo. Cada treino (A/B/C/D) tem a
// própria progressão, mesmo com exercícios de mesmo nome.
export function computeSuggestion(history, workoutKey, ex) {
    const range = parseRepRange(ex.reps);
    if (!range) return null;
    const inc = ex.incremento || DEFAULT_INCREMENT;

    const recent = [];
    for (const entry of history) {
        if (entry.workout !== workoutKey || !Array.isArray(entry.exercises)) continue;
        const entryEx = entry.exercises.find((e) => e.nome === ex.nome);
        if (!entryEx) continue;
        const result = evaluateSession(historySetsFor(entryEx), ex, range);
        if (result) recent.push(result);
        if (recent.length === 2) break;
    }
    if (recent.length === 0) return null;

    const last = recent[0];
    if (last.hitTop) {
        return {
            action: 'up',
            weight: last.weight + inc,
            message: `você fez ${range.max}+ reps em todas as séries — hora de subir!`
        };
    }
    if (last.failed && recent[1] && recent[1].failed && recent[1].weight === last.weight) {
        const deload = Math.max(inc, Math.round((last.weight * 0.9) / inc) * inc);
        if (deload < last.weight) {
            return {
                action: 'down',
                weight: deload,
                message: `2 treinos seguidos abaixo de ${range.min} reps — reduza um pouco e suba de novo.`
            };
        }
    }
    if (last.failed) {
        return {
            action: 'keep',
            weight: last.weight,
            message: `mantenha e busque o mínimo de ${range.min} reps em cada série.`
        };
    }
    return {
        action: 'keep',
        weight: last.weight,
        message: `mantenha e tente +1 rep até chegar a ${range.max} em todas.`
    };
}
