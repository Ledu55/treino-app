// @vitest-environment jsdom
// Correção de um treino já finalizado (updateHistoryEntry)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { KEYS } from '../../src/storage.js';
import { computeSuggestion } from '../../src/progression.js';
import { getActivePlan, getState, initStore, updateHistoryEntry, workoutExercises } from '../../src/store.js';

const v1 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'dados-v1.json'), 'utf8'));
delete v1._sobre;

// Treino A de 2026-10-05: Agachamento 40 × 8, 8, 7 (todas feitas), Cadeira Flexora 2/2, Stiff 0/3
const ENTRY_ID = '1759700000000';

function entry(id = ENTRY_ID) {
    return getState().history.find((e) => e.id === id);
}

function agachamentoSuggestion() {
    const workout = getActivePlan().treinos.find((t) => t.id === 'A');
    const ex = workoutExercises(workout).find((e) => e.exerciseId === 'agachamento');
    return computeSuggestion(getState().history, 'A', ex);
}

beforeEach(() => {
    localStorage.clear();
    for (const [key, value] of Object.entries(v1)) localStorage.setItem(key, JSON.stringify(value));
    expect(initStore()).toBeNull();
});

describe('updateHistoryEntry', () => {
    it('corrigir as reps recalcula a sugestão de carga', () => {
        expect(agachamentoSuggestion()).toMatchObject({ action: 'keep', weight: 40 });
        updateHistoryEntry(ENTRY_ID, (draft) => { draft.exercises[0].sets[2].reps = '8'; });
        expect(agachamentoSuggestion()).toMatchObject({ action: 'up', weight: 42.5 });

        updateHistoryEntry(ENTRY_ID, (draft) => { draft.exercises[0].sets.forEach((s) => { s.weight = '45'; }); });
        expect(agachamentoSuggestion()).toMatchObject({ action: 'up', weight: 47.5 });
    });

    it('séries feitas refazem as contagens do exercício e do treino', () => {
        updateHistoryEntry(ENTRY_ID, (draft) => { draft.exercises[2].sets.forEach((s) => { s.done = true; }); });
        expect(entry().exercises[2].setsDone).toBe(3);
        expect(entry().doneCount).toBe(3);

        updateHistoryEntry(ENTRY_ID, (draft) => { draft.exercises[0].sets[1].done = false; });
        expect(entry().exercises[0].setsDone).toBe(2);
        expect(entry().doneCount).toBe(2);
        // Agachamento com uma série a menos: falhou → manter a carga
        expect(agachamentoSuggestion()).toMatchObject({ action: 'keep', weight: 40 });
    });

    it('sem mexer nas séries feitas, as contagens antigas ficam como estavam', () => {
        // Treino C migrado da v1: 2 de 3 séries feitas, mas sem saber quais
        const old = '1755000000000';
        expect(entry(old).exercises[0].setsDone).toBe(2);
        updateHistoryEntry(old, (draft) => { draft.exercises[0].note = 'banco no 3'; });
        expect(entry(old).exercises[0]).toMatchObject({ note: 'banco no 3', setsDone: 2, setsTotal: 3 });
        expect(entry(old).doneCount).toBe(0);
    });

    it('grava no celular e marca o treino para ir à nuvem, com updatedAt novo', () => {
        const before = Date.now();
        updateHistoryEntry(ENTRY_ID, (draft) => { draft.workoutNote = 'na verdade foi pesado'; });

        const saved = JSON.parse(localStorage.getItem(KEYS.history)).find((e) => e.id === ENTRY_ID);
        expect(saved.workoutNote).toBe('na verdade foi pesado');
        expect(saved.updatedAt).toBeGreaterThanOrEqual(before);
        expect(getState().cloudMeta.dirty.history[ENTRY_ID]).toBeGreaterThan(0);
        // A ordem do histórico não muda
        expect(getState().history.map((e) => e.id)[0]).toBe(ENTRY_ID);
    });
});
