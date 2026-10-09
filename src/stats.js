// Números do histórico para os gráficos e recordes (item 11): melhor série e volume de cada treino,
// evolução de um exercício, recordes pessoais e frequência semanal. JS puro, sem depender das telas.
import { getLibraryExercise } from './data/library.js';
import { formatKg, parseNumber } from './progression.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function time(entry) {
    const t = new Date(entry.date).getTime();
    return isNaN(t) ? 0 : t;
}

// Do mais antigo para o mais novo
function chronological(history) {
    return history.filter((entry) => Array.isArray(entry.exercises)).sort((a, b) => time(a) - time(b));
}

// Séries de um exercício num treino (o mesmo exercício pode aparecer mais de uma vez)
function exerciseSets(entry, exerciseId) {
    return entry.exercises
        .filter((ex) => ex && ex.exerciseId === exerciseId && Array.isArray(ex.sets))
        .flatMap((ex) => ex.sets);
}

// Só as séries marcadas como feitas contam: as não feitas podem ter só a carga que veio preenchida
// do treino anterior. Devolve a maior carga (com as reps da melhor série nessa carga) e o volume
// (carga × reps), ou null se não houver série feita com carga.
export function summarizeSets(sets) {
    let weight = 0;
    let reps = 0;
    let volume = 0;
    for (const s of sets) {
        if (!s || !s.done) continue;
        const w = parseNumber(s.weight);
        if (isNaN(w) || w <= 0) continue;
        const r = parseNumber(s.reps);
        if (!isNaN(r)) volume += w * r;
        if (w > weight) {
            weight = w;
            reps = isNaN(r) ? 0 : r;
        } else if (w === weight && r > reps) {
            reps = r;
        }
    }
    return weight > 0 ? { weight, reps, volume: Math.round(volume * 100) / 100 } : null;
}

// Um ponto por treino em que o exercício teve série feita com carga, do mais antigo para o mais
// novo. Junta todos os treinos da ficha (o Agachamento do treino A e do C são o mesmo exercício).
// record: passou a maior carga de antes (o primeiro treino do exercício não conta como recorde).
export function exerciseProgress(history, exerciseId) {
    const points = [];
    let best = 0;
    for (const entry of chronological(history)) {
        const summary = summarizeSets(exerciseSets(entry, exerciseId));
        if (!summary) continue;
        points.push({
            entryId: entry.id,
            date: entry.date,
            workoutNome: entry.workoutNome || '',
            ...summary,
            record: best > 0 && summary.weight > best
        });
        best = Math.max(best, summary.weight);
    }
    return points;
}

// Exercícios com algum ponto para o gráfico: { exerciseId, nome, count, lastDate }, por nome
export function exercisesWithProgress(history) {
    const found = new Map();
    for (const entry of chronological(history)) {
        for (const ex of entry.exercises) {
            if (!ex || !ex.exerciseId || !Array.isArray(ex.sets) || !summarizeSets(ex.sets)) continue;
            const item = found.get(ex.exerciseId) || { exerciseId: ex.exerciseId, count: 0 };
            const lib = getLibraryExercise(ex.exerciseId);
            item.nome = (lib && lib.nome) || ex.nome || 'Exercício';
            if (item.lastDate !== entry.date) item.count++;
            item.lastDate = entry.date;
            found.set(ex.exerciseId, item);
        }
    }
    return Array.from(found.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function bestWeight(history, exerciseId) {
    let best = 0;
    for (const entry of history) {
        if (!Array.isArray(entry.exercises)) continue;
        const summary = summarizeSets(exerciseSets(entry, exerciseId));
        if (summary) best = Math.max(best, summary.weight);
    }
    return best;
}

// Recordes de um treino recém-finalizado em relação aos anteriores: [{ exerciseId, nome, weight,
// previous }]. Um exercício feito pela primeira vez não é recorde, e igualar a carga também não.
export function findRecords(previousHistory, entry) {
    const records = [];
    for (const ex of entry.exercises) {
        if (!ex || records.some((r) => r.exerciseId === ex.exerciseId)) continue;
        const summary = summarizeSets(exerciseSets(entry, ex.exerciseId));
        if (!summary) continue;
        const previous = bestWeight(previousHistory, ex.exerciseId);
        if (previous > 0 && summary.weight > previous) {
            records.push({ exerciseId: ex.exerciseId, nome: ex.nome, weight: summary.weight, previous });
        }
    }
    return records;
}

// Chaves 'idDoTreinoFinalizado|idDoExercício' de todos os recordes do histórico (🏆 no histórico)
export function recordKeys(history) {
    const keys = new Set();
    const best = new Map();
    for (const entry of chronological(history)) {
        const seen = new Set();
        for (const ex of entry.exercises) {
            if (!ex || seen.has(ex.exerciseId)) continue;
            seen.add(ex.exerciseId);
            const summary = summarizeSets(exerciseSets(entry, ex.exerciseId));
            if (!summary) continue;
            const previous = best.get(ex.exerciseId) || 0;
            if (previous > 0 && summary.weight > previous) keys.add(entry.id + '|' + ex.exerciseId);
            best.set(ex.exerciseId, Math.max(previous, summary.weight));
        }
    }
    return keys;
}

// Aviso ao finalizar o treino. "Novo recorde: Agachamento", e não "no Agachamento", porque o
// artigo muda com o exercício ("na Remada").
export function recordMessage(records) {
    if (records.length === 1) return `🏆 Novo recorde: ${records[0].nome} (${formatKg(records[0].weight)})`;
    return `🏆 ${records.length} novos recordes: ` + records.map((r) => `${r.nome} (${formatKg(r.weight)})`).join(', ');
}

// ---------- Frequência semanal ----------

// Segunda-feira, 0h (hora local), da semana da data
export function weekStart(date) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return day;
}

// Treinos finalizados em cada uma das últimas `weeks` semanas (a última é a atual):
// [{ start, count }], da mais antiga para a atual
export function weeklyCounts(history, weeks = 8, now = new Date()) {
    const current = weekStart(now);
    const result = [];
    for (let i = weeks - 1; i >= 0; i--) {
        const start = new Date(current);
        start.setDate(start.getDate() - 7 * i);
        result.push({ start, count: 0 });
    }
    const first = result[0].start;
    for (const entry of history) {
        const date = new Date(entry.date);
        if (isNaN(date) || date < first) continue;
        // round: a semana do horário de verão tem uma hora a mais ou a menos
        const index = Math.round((weekStart(date) - first) / (7 * DAY_MS));
        if (index < weeks) result[index].count++;
    }
    return result;
}

export function weekText(count) {
    if (count === 0) return 'Nenhum treino esta semana';
    return `${count} ${count === 1 ? 'treino' : 'treinos'} esta semana`;
}
