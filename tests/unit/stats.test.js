// Gráficos, recordes e frequência semanal (src/stats.js)
import { describe, expect, it } from 'vitest';
import {
    exerciseProgress, exercisesWithProgress, findRecords, recordKeys, recordMessage, summarizeSets, weekStart, weekText,
    weeklyCounts
} from '../../src/stats.js';

const set = (weight, reps, done = true) => ({ weight: String(weight), reps: String(reps), done });

// Treino finalizado; exercises: { exerciseId: [séries] }
function entry(id, date, exercises, workoutNome = 'Treino A') {
    return {
        id,
        date: new Date(date).toISOString(),
        workoutId: 'A',
        workoutNome,
        exercises: Object.entries(exercises).map(([exerciseId, sets]) => ({ exerciseId, nome: exerciseId.toUpperCase(), sets }))
    };
}

describe('summarizeSets', () => {
    it('maior carga, reps da melhor série nessa carga e volume, só das séries feitas', () => {
        expect(summarizeSets([set(40, 8), set('42,5', 6), set('42,5', 7), set(50, 10, false)]))
            .toEqual({ weight: 42.5, reps: 7, volume: 40 * 8 + 42.5 * 6 + 42.5 * 7 });
    });

    it('sem série feita com carga não há resumo', () => {
        expect(summarizeSets([set(40, 8, false), set('', 10), set('peso do corpo', 12)])).toBeNull();
    });

    it('série sem reps conta para a carga, mas não para o volume', () => {
        expect(summarizeSets([set(30, '')])).toEqual({ weight: 30, reps: 0, volume: 0 });
    });
});

describe('exerciseProgress', () => {
    const history = [
        entry('3', '2026-10-08T10:00', { agachamento: [set(45, 6), set(45, 6)] }),
        entry('2', '2026-10-06T10:00', { agachamento: [set(40, 8), set(40, 8)], stiff: [set(30, 10)] }, 'Treino C'),
        entry('1', '2026-10-01T10:00', { agachamento: [set(40, 7), set(40, 6)] }),
        entry('0', '2026-09-28T10:00', { agachamento: [set(50, 8, false)] })
    ];

    it('um ponto por treino, do mais antigo para o mais novo, juntando os treinos da ficha', () => {
        const points = exerciseProgress(history, 'agachamento');
        expect(points.map((p) => p.entryId)).toEqual(['1', '2', '3']);
        expect(points[1]).toMatchObject({ weight: 40, reps: 8, volume: 640, workoutNome: 'Treino C' });
    });

    it('recorde só quando passa a maior carga anterior', () => {
        expect(exerciseProgress(history, 'agachamento').map((p) => p.record)).toEqual([false, false, true]);
        expect([...recordKeys(history)]).toEqual(['3|agachamento']);
    });

    it('lista os exercícios com dados, por nome', () => {
        expect(exercisesWithProgress(history)).toEqual([
            { exerciseId: 'agachamento', nome: 'Agachamento', count: 3, lastDate: history[0].date },
            { exerciseId: 'stiff', nome: 'Stiff', count: 1, lastDate: history[1].date }
        ]);
    });
});

describe('findRecords', () => {
    const previous = [
        entry('2', '2026-10-06T10:00', { agachamento: [set(40, 8)], stiff: [set(30, 10)] }),
        entry('1', '2026-10-01T10:00', { agachamento: [set(42.5, 5, false)] })
    ];

    it('avisa quem passou a maior carga feita antes', () => {
        const now = entry('3', '2026-10-08T10:00', { agachamento: [set('42,5', 6)], stiff: [set(30, 12)], remada: [set(20, 10)] });
        expect(findRecords(previous, now)).toEqual([{ exerciseId: 'agachamento', nome: 'AGACHAMENTO', weight: 42.5, previous: 40 }]);
    });

    it('igualar a carga, série não feita e exercício novo não são recorde', () => {
        const now = entry('3', '2026-10-08T10:00', { agachamento: [set(40, 10), set(60, 8, false)], remada: [set(20, 10)] });
        expect(findRecords(previous, now)).toEqual([]);
        expect(findRecords([], now)).toEqual([]);
    });

    it('mensagem com um ou vários recordes', () => {
        expect(recordMessage([{ nome: 'Agachamento', weight: 42.5 }])).toBe('🏆 Novo recorde: Agachamento (42,5 kg)');
        expect(recordMessage([{ nome: 'Agachamento', weight: 42.5 }, { nome: 'Remada', weight: 30 }]))
            .toBe('🏆 2 novos recordes: Agachamento (42,5 kg), Remada (30 kg)');
    });
});

describe('frequência semanal', () => {
    it('a semana começa na segunda-feira', () => {
        // 2026-10-11 é domingo; 2026-10-12, segunda
        expect(weekStart(new Date(2026, 9, 11, 23, 0))).toEqual(new Date(2026, 9, 5));
        expect(weekStart(new Date(2026, 9, 12, 0, 30))).toEqual(new Date(2026, 9, 12));
    });

    it('conta os treinos de cada semana, até a atual', () => {
        const now = new Date(2026, 9, 9, 18, 0); // sexta
        const at = (d, h = 10) => ({ date: new Date(2026, 9, d, h).toISOString() });
        const history = [
            at(9), at(6), at(5, 7), // esta semana (segunda 5 a domingo 11)
            at(4, 22), // domingo da semana anterior
            at(1),
            { date: new Date(2026, 7, 1).toISOString() }, // antes das 8 semanas
            { date: 'data inválida' }
        ];
        const weeks = weeklyCounts(history, 8, now);
        expect(weeks).toHaveLength(8);
        expect(weeks[7]).toEqual({ start: new Date(2026, 9, 5), count: 3 });
        expect(weeks[6]).toEqual({ start: new Date(2026, 8, 28), count: 2 });
        expect(weeks.slice(0, 6).every((w) => w.count === 0)).toBe(true);
    });

    it('texto', () => {
        expect(weekText(0)).toBe('Nenhum treino esta semana');
        expect(weekText(1)).toBe('1 treino esta semana');
        expect(weekText(3)).toBe('3 treinos esta semana');
    });
});
