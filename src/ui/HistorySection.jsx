import { useState } from 'preact/hooks';
import { deleteHistoryEntry, getState, updateHistoryEntry } from '../store.js';
import { showToast } from './Toast.jsx';

function formatEntryDate(isoDate) {
    const date = new Date(isoDate);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function hasData(ex) {
    return ex.setsDone > 0 || ex.note || ex.sets.some((s) => s.weight || s.reps || s.done);
}

// Carga e reps de cada série
function WeightCell({ ex }) {
    return ex.sets.map((s, w) => (
        <span class={'entry-set' + (s.done ? '' : ' entry-set-miss')}>
            {s.done ? '✓' : '·'} S{w + 1}: {s.weight || '—'}{s.reps ? ` × ${s.reps}` : ''}
        </span>
    ));
}

// Correção de um treino finalizado. Mostra todos os exercícios (inclusive os que ficaram em
// branco) e só grava ao tocar em "Salvar".
function HistoryEntryEditor({ entry, onClose }) {
    const [draft, setDraft] = useState(() => structuredClone(entry));

    function change(update) {
        setDraft((current) => {
            const next = structuredClone(current);
            update(next);
            return next;
        });
    }

    function save() {
        const clean = (text) => String(text || '').trim();
        updateHistoryEntry(entry.id, (target) => {
            target.workoutNote = clean(draft.workoutNote);
            target.exercises = draft.exercises.map((ex) => ({
                ...ex,
                note: clean(ex.note),
                sets: ex.sets.map((s) => ({ ...s, weight: clean(s.weight), reps: clean(s.reps) }))
            }));
        });
        showToast('Treino corrigido');
        onClose();
    }

    return (
        <div class="history-editor">
            {draft.exercises.map((ex, i) => (
                <div class="history-editor-exercise" key={ex.exerciseId || i} data-exercise={ex.nome}>
                    <h4>{ex.nome}</h4>
                    <div class="set-rows">
                        {ex.sets.map((s, w) => (
                            <div class="set-row" key={w}>
                                <button
                                    type="button" class={'set-box' + (s.done ? ' active' : '')}
                                    aria-pressed={s.done ? 'true' : 'false'} aria-label={`Série ${w + 1} feita`}
                                    onClick={() => change((d) => { d.exercises[i].sets[w].done = !s.done; })}
                                >
                                    S{w + 1}
                                </button>
                                <input
                                    type="text" autocomplete="off" inputmode="text" placeholder="kg"
                                    class="field-input set-weight-input" aria-label={`Carga da série ${w + 1}`} value={s.weight || ''}
                                    onInput={(e) => change((d) => { d.exercises[i].sets[w].weight = e.currentTarget.value; })}
                                />
                                <input
                                    type="text" autocomplete="off" inputmode="text" placeholder="reps"
                                    class="field-input set-reps-input" aria-label={`Reps da série ${w + 1}`} value={s.reps || ''}
                                    onInput={(e) => change((d) => { d.exercises[i].sets[w].reps = e.currentTarget.value; })}
                                />
                            </div>
                        ))}
                    </div>
                    <input
                        type="text" autocomplete="off" placeholder="Observações"
                        class="field-input exercise-note-input" value={ex.note || ''}
                        onInput={(e) => change((d) => { d.exercises[i].note = e.currentTarget.value; })}
                    />
                </div>
            ))}
            <textarea
                class="field-input history-editor-note" placeholder="Como foi o treino?" aria-label="Observação do treino"
                value={draft.workoutNote || ''}
                onInput={(e) => change((d) => { d.workoutNote = e.currentTarget.value; })}
            />
            <div class="plan-card-actions">
                <button type="button" class="plan-btn primary" onClick={save}>Salvar</button>
                <button type="button" class="plan-btn" onClick={onClose}>Cancelar</button>
            </div>
        </div>
    );
}

function HistoryEntry({ entry }) {
    const [editing, setEditing] = useState(false);

    function remove() {
        if (confirm('Apagar este treino do histórico?')) deleteHistoryEntry(entry.id);
    }

    return (
        <details class="history-entry">
            <summary>
                <span class="entry-date">{formatEntryDate(entry.date)}</span>
                <span>{entry.workoutNome}</span>
                <span class="entry-meta">{entry.doneCount}/{entry.totalCount} exercícios</span>
            </summary>
            <div class="history-entry-body">
                {editing ? <HistoryEntryEditor entry={entry} onClose={() => setEditing(false)} /> : (
                    <>
                        <table>
                            <tbody>
                                {entry.exercises.filter(hasData).map((ex) => (
                                    <tr>
                                        <td>
                                            {ex.nome}<br />
                                            {ex.note && <span class="entry-note">{ex.note}</span>}
                                        </td>
                                        <td class="entry-weight"><WeightCell ex={ex} /></td>
                                        <td>{ex.setsDone}/{ex.setsTotal}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {entry.workoutNote && <p class="history-workout-note">"{entry.workoutNote}"</p>}
                        <div class="history-entry-actions">
                            <button class="edit-entry-btn" onClick={() => setEditing(true)}>✏️ Editar</button>
                            <button class="delete-entry-btn" onClick={remove}>🗑️ Apagar</button>
                        </div>
                    </>
                )}
            </div>
        </details>
    );
}

export function HistorySection() {
    const { history } = getState();
    return (
        <div class="history-section">
            <details>
                <summary>📅 Histórico de treinos <span class="chev">▼</span></summary>
                <div id="history-list">
                    {history.length === 0
                        ? <p class="history-empty">Nenhum treino finalizado ainda. Ao terminar, toque em "Finalizar treino".</p>
                        : history.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)}
                </div>
            </details>
        </div>
    );
}
