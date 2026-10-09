// Exportação dos dados (LGPD: portabilidade)
import { describe, expect, it } from 'vitest';
import { exportData, historyToCsv } from '../../src/export.js';
import { SCHEMA_VERSION } from '../../src/migrations.js';

const set = (weight, reps, done = true) => ({ weight, reps, done });

const history = [
    {
        id: 'b', date: '2026-10-08T21:30:00.000Z', workoutId: 'A', workoutNome: 'Treino A', workoutNote: 'Bom; "pesado"',
        exercises: [
            { exerciseId: 'agachamento', nome: 'Agachamento', note: 'joelho ok', sets: [set('42,5', '8'), set('42,5', '7', false)], setsDone: 1, setsTotal: 2 },
            { exerciseId: 'stiff', nome: 'Stiff', note: '', sets: [set('', '', false)], setsDone: 0, setsTotal: 1 }
        ]
    },
    {
        id: 'a', date: '2026-10-06T21:30:00.000Z', workoutId: 'A', workoutNome: 'Treino A', workoutNote: '',
        exercises: [{ exerciseId: 'agachamento', nome: 'Agachamento', note: '', sets: [set('40', '8')], setsDone: 1, setsTotal: 1 }]
    }
];

describe('exportData', () => {
    const state = {
        profile: { nome: 'Ana', titulo: '', activePlanId: 'p1' },
        plans: { p1: { id: 'p1', nome: 'Minha ficha', treinos: [] }, p2: { id: 'p2', nome: 'Velha', deleted: true } },
        history,
        deletedIds: ['x'],
        lastValues: { 'A|agachamento': { sets: [{ weight: '42,5', reps: '8' }] } },
        sessions: { A: { sets: {} } },
        cloudMeta: { uid: 'u1', dirty: {} }
    };

    it('leva tudo o que é da pessoa, sem as fichas apagadas nem os controles da sincronização', () => {
        const data = exportData(state, new Date('2026-10-08T22:00:00Z'));
        expect(data).toEqual({
            app: 'Meu Treino',
            exportedAt: '2026-10-08T22:00:00.000Z',
            schema: SCHEMA_VERSION,
            profile: state.profile,
            plans: [state.plans.p1],
            history,
            lastValues: state.lastValues,
            inProgress: state.sessions
        });
        expect(JSON.stringify(data)).not.toContain('u1');
    });
});

describe('historyToCsv', () => {
    const lines = historyToCsv(history).split('\r\n');

    it('começa com o BOM e o cabeçalho, separado por ponto e vírgula', () => {
        expect(lines[0]).toBe('﻿Data;Treino;Exercício;Série;Carga (kg);Reps;Feita;Observação do exercício;Observação do treino');
    });

    it('tem uma linha por série, do treino mais antigo para o mais novo, sem os exercícios em branco', () => {
        const rows = lines.slice(1, -1).map((line) => line.split(';').slice(1, 7));
        expect(rows).toEqual([
            ['Treino A', 'Agachamento', '1', '40', '8', 'sim'],
            ['Treino A', 'Agachamento', '1', '42,5', '8', 'sim'],
            ['Treino A', 'Agachamento', '2', '42,5', '7', 'não']
        ]);
        expect(lines[lines.length - 1]).toBe('');
    });

    it('põe aspas no texto com ponto e vírgula ou aspas', () => {
        expect(lines[2].endsWith(';joelho ok;"Bom; ""pesado"""')).toBe(true);
    });

    it('mostra a data e a hora locais', () => {
        expect(lines[1]).toMatch(/^2026-10-0[67] \d\d:30;/);
    });
});
