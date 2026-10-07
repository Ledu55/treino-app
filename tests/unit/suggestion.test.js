import { describe, expect, it } from 'vitest';
import { computeSuggestion } from '../../src/progression.js';

// Exercício de referência: 3 séries de 10 a 12, incremento padrão (2,5 kg)
const SUPINO = { exerciseId: 'supino', series: 3, reps: '10 a 12 repetições' };
const ELEVACAO = { exerciseId: 'elevacao-lateral', series: 3, reps: '10 a 12 repetições', incremento: 1 };

let nextId = 1000;

// Uma série de trabalho: [kg, reps] ou [kg, reps, false] para série não marcada
function sets(...rows) {
    return rows.map(([weight, reps, done = true]) => ({ weight: String(weight), reps: String(reps), done }));
}

// nome: 'Supino' ou 'Elevação Lateral' (o id vem de IDS)
const IDS = { Supino: 'supino', 'Elevação Lateral': 'elevacao-lateral' };

function entry(workoutId, nome, workSets) {
    return {
        id: String(nextId--),
        date: new Date().toISOString(),
        workoutId,
        exercises: [{
            exerciseId: IDS[nome],
            nome,
            note: '',
            sets: workSets,
            setsDone: workSets.filter((s) => s.done).length,
            setsTotal: workSets.length
        }]
    };
}

// O histórico fica do mais novo para o mais antigo, como no app
function suggest(history, ex = SUPINO, workout = 'A') {
    return computeSuggestion(history, workout, ex);
}

describe('computeSuggestion', () => {
    it('sem histórico, não sugere nada', () => {
        expect(suggest([])).toBeNull();
    });

    it('sem faixa de reps no exercício, não sugere nada', () => {
        const history = [entry('A', 'Supino', sets([40, 12], [40, 12], [40, 12]))];
        expect(suggest(history, { ...SUPINO, reps: 'até a falha' })).toBeNull();
    });

    it('sobe a carga quando bateu o topo da faixa em todas as séries', () => {
        const history = [entry('A', 'Supino', sets([40, 12], [40, 12], [40, 13]))];
        const s = suggest(history);
        expect(s.action).toBe('up');
        expect(s.weight).toBe(42.5);
        expect(s.message).toContain('12+');
    });

    it('usa o incremento do exercício', () => {
        const history = [entry('A', 'Elevação Lateral', sets([8, 12], [8, 12], [8, 12]))];
        const s = suggest(history, ELEVACAO);
        expect(s.action).toBe('up');
        expect(s.weight).toBe(9);
    });

    it('a carga de referência é a maior carga das séries', () => {
        const history = [entry('A', 'Supino', sets([35, 12], [40, 12], [37.5, 12]))];
        expect(suggest(history).weight).toBe(42.5);
    });

    it('lê cargas com vírgula e unidade', () => {
        const history = [entry('A', 'Supino', sets(['22,5kg', 12], ['22,5kg', 12], ['22,5kg', 12]))];
        expect(suggest(history).weight).toBe(25);
    });

    it('mantém a carga quando está dentro da faixa mas não no topo', () => {
        const history = [entry('A', 'Supino', sets([40, 12], [40, 11], [40, 10]))];
        const s = suggest(history);
        expect(s.action).toBe('keep');
        expect(s.weight).toBe(40);
        expect(s.message).toContain('+1 rep');
    });

    it('não sobe se alguma série não foi marcada como feita', () => {
        const history = [entry('A', 'Supino', sets([40, 12], [40, 12], [40, 12, false]))];
        const s = suggest(history);
        expect(s.action).toBe('keep');
        expect(s.weight).toBe(40);
    });

    it('mantém e pede o mínimo quando ficou abaixo da faixa', () => {
        const history = [entry('A', 'Supino', sets([40, 10], [40, 9], [40, 8]))];
        const s = suggest(history);
        expect(s.action).toBe('keep');
        expect(s.weight).toBe(40);
        expect(s.message).toContain('mínimo de 10');
    });

    it('reduz ~10% após 2 treinos seguidos abaixo da faixa com a mesma carga', () => {
        const history = [
            entry('A', 'Supino', sets([40, 9], [40, 8], [40, 8])),
            entry('A', 'Supino', sets([40, 9], [40, 9], [40, 8]))
        ];
        const s = suggest(history);
        expect(s.action).toBe('down');
        expect(s.weight).toBe(35); // 40 × 0,9 = 36 → múltiplo de 2,5 mais próximo
    });

    it('não reduz se as 2 falhas foram com cargas diferentes', () => {
        const history = [
            entry('A', 'Supino', sets([40, 9], [40, 8], [40, 8])),
            entry('A', 'Supino', sets([37.5, 9], [37.5, 9], [37.5, 8]))
        ];
        const s = suggest(history);
        expect(s.action).toBe('keep');
        expect(s.weight).toBe(40);
    });

    it('não reduz abaixo do incremento', () => {
        const history = [
            entry('A', 'Supino', sets([2.5, 5], [2.5, 5], [2.5, 5])),
            entry('A', 'Supino', sets([2.5, 5], [2.5, 5], [2.5, 5]))
        ];
        const s = suggest(history);
        expect(s.action).toBe('keep');
        expect(s.weight).toBe(2.5);
    });

    it('considera menos da metade das séries feitas como falha', () => {
        const history = [entry('A', 'Supino', sets([40, 12], [40, 12, false], [40, 12, false]))];
        expect(suggest(history).message).toContain('mínimo');
    });

    it('usa só o treino mais recente com carga registrada', () => {
        const history = [
            entry('A', 'Supino', sets(['', 12], ['', 12], ['', 12])),
            entry('A', 'Supino', sets([30, 12], [30, 12], [30, 12])),
            entry('A', 'Supino', sets([20, 10], [20, 10], [20, 10]))
        ];
        const s = suggest(history);
        expect(s.action).toBe('up');
        expect(s.weight).toBe(32.5);
    });

    it('não mistura treinos diferentes, mesmo com o mesmo exercício', () => {
        const history = [
            entry('C', 'Supino', sets([60, 12], [60, 12], [60, 12])),
            entry('A', 'Supino', sets([40, 11], [40, 11], [40, 11]))
        ];
        expect(suggest(history, SUPINO, 'A').weight).toBe(40);
        expect(suggest(history, SUPINO, 'C').weight).toBe(62.5);
        expect(suggest(history, SUPINO, 'B')).toBeNull();
    });

});
