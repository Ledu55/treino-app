import { deleteHistoryEntry, getState } from '../store.js';

function formatEntryDate(isoDate) {
    const date = new Date(isoDate);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function hasData(ex) {
    return ex.setsDone > 0 || ex.weight || ex.reps || ex.note
        || (Array.isArray(ex.sets) && ex.sets.some((s) => s.weight || s.reps || s.done));
}

// Carga e reps de cada série; treinos antigos têm uma carga e reps por exercício
function WeightCell({ ex }) {
    if (!Array.isArray(ex.sets)) {
        return <>{ex.weight}{ex.reps && <><br /><span class="entry-reps">{ex.reps} reps</span></>}</>;
    }
    return ex.sets.map((s, w) => (
        <span class={'entry-set' + (s.done ? '' : ' entry-set-miss')}>
            {s.done ? '✓' : '·'} S{w + 1}: {s.weight || '—'}{s.reps ? ` × ${s.reps}` : ''}
        </span>
    ));
}

function HistoryEntry({ entry }) {
    function remove() {
        if (confirm('Apagar este treino do histórico?')) deleteHistoryEntry(entry.id);
    }

    return (
        <details class="history-entry">
            <summary>
                <span class="entry-date">{formatEntryDate(entry.date)}</span>
                <span>Treino {entry.workout}</span>
                <span class="entry-meta">{entry.doneCount}/{entry.totalCount} exercícios</span>
            </summary>
            <div class="history-entry-body">
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
                <button class="delete-entry-btn" onClick={remove}>🗑️ Apagar</button>
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
