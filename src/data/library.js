// Biblioteca de exercícios (exercises.json): id fixo, nome, grupo muscular, GIF, instruções e
// incremento de carga. As fichas guardam só o id; um exercício criado pela pessoa (fora da
// biblioteca) leva o próprio nome na ficha.
import exercises from './exercises.json';

export const DEFAULT_INCREMENT = 2.5;

const byId = new Map(exercises.map((ex) => [ex.id, ex]));

export function getLibraryExercise(id) {
    return byId.get(id) || null;
}

// Sem acentos e em minúsculas, para a busca achar "triceps" em "Tríceps"
export function normalizeText(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Busca por nome ou grupo muscular; sem texto, devolve a biblioteca toda (por grupo e nome)
export function searchLibrary(query) {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    return exercises
        .filter((ex) => {
            const text = normalizeText(ex.nome + ' ' + ex.grupo);
            return words.every((w) => text.includes(w));
        })
        .sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Exercícios criados pela pessoa (fora da biblioteca) nas fichas dadas: [{ exerciseId, nome }]
export function findCustomExercises(plans) {
    const found = new Map();
    for (const plan of plans) {
        for (const workout of plan.treinos) {
            for (const ex of workout.exercicios) {
                if (ex.nome && !getLibraryExercise(ex.exerciseId)) found.set(ex.exerciseId, { exerciseId: ex.exerciseId, nome: ex.nome });
            }
        }
    }
    return Array.from(found.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Exercício de uma ficha com os dados da biblioteca: { exerciseId, nome, grupo, img, instrucoes,
// incremento, series, reps, descanso, obs }
export function resolveExercise(planEx) {
    const lib = getLibraryExercise(planEx.exerciseId) || {};
    return {
        ...lib,
        ...planEx,
        nome: lib.nome || planEx.nome || 'Exercício',
        incremento: lib.incremento || DEFAULT_INCREMENT
    };
}
