// Exportação dos dados (LGPD: portabilidade): tudo num arquivo JSON e o histórico numa planilha
// (CSV, uma linha por série). JS puro; o download fica na tela (ui/PrivacyScreen.jsx).
import { SCHEMA_VERSION } from './migrations.js';

// Tudo o que é da pessoa; ficam de fora só os controles internos (sincronização, ids apagados)
export function exportData(state, now = new Date()) {
    return {
        app: 'Meu Treino',
        exportedAt: now.toISOString(),
        schema: SCHEMA_VERSION,
        profile: state.profile,
        plans: Object.values(state.plans).filter((plan) => !plan.deleted),
        history: state.history,
        lastValues: state.lastValues,
        inProgress: state.sessions
    };
}

const CSV_COLUMNS = ['Data', 'Treino', 'Exercício', 'Série', 'Carga (kg)', 'Reps', 'Feita', 'Observação do exercício', 'Observação do treino'];

// ";" separa as colunas porque a vírgula é o decimal em português (é o que o Excel em pt-BR espera)
function csvCell(value) {
    const text = String(value ?? '');
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function localDateTime(isoDate) {
    const date = new Date(isoDate);
    if (isNaN(date)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Do treino mais antigo para o mais novo, só os exercícios com algo registrado (como no histórico)
export function historyToCsv(history) {
    const rows = [CSV_COLUMNS];
    for (const entry of [...history].reverse()) {
        for (const ex of entry.exercises) {
            if (!(ex.setsDone > 0 || ex.note || ex.sets.some((s) => s.weight || s.reps || s.done))) continue;
            ex.sets.forEach((s, w) => {
                rows.push([
                    localDateTime(entry.date), entry.workoutNome, ex.nome, w + 1, s.weight, s.reps,
                    s.done ? 'sim' : 'não', ex.note, entry.workoutNote
                ]);
            });
        }
    }
    // BOM: para o Excel ler os acentos
    return '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
