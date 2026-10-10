import {
    WARMUP_SETS, applyWeight, getState, isExerciseDone, isSetDone, setExerciseNote, setSetValue, toggleSet, valuesKey
} from '../store.js';
import { computeSuggestion, formatKg, formatWeight, getSetValues } from '../progression.js';
import { formatTime, startTimer } from '../timer.js';
import { noteWorkoutActivity } from '../wake-lock.js';
import { useDebouncedField } from './hooks.js';
import { showToast } from './Toast.jsx';

function TextField({ value, onSave, ...props }) {
    const field = useDebouncedField(value, onSave);
    return <input type="text" autocomplete="off" {...props} {...field} />;
}

function SetBox({ workoutId, ex, setIndex, label, ariaLabel, warmup }) {
    const active = isSetDone(workoutId, ex.exerciseId, setIndex);
    return (
        <button
            type="button"
            class={'set-box' + (warmup ? ' warmup' : '') + (active ? ' active' : '')}
            data-set-index={setIndex}
            aria-pressed={active ? 'true' : 'false'}
            aria-label={ariaLabel}
            onClick={() => { toggleSet(workoutId, ex, setIndex); noteWorkoutActivity(); }}
        >
            {label}
        </button>
    );
}

function Suggestion({ suggestion, onApply }) {
    return (
        <div class={`suggestion suggestion-${suggestion.action}`}>
            <span class="suggestion-text">
                💡 Sugestão: <strong>{formatKg(suggestion.weight)}</strong> — {suggestion.message}
            </span>
            <button type="button" class="suggestion-apply" onClick={onApply}>Usar</button>
        </div>
    );
}

// Sem GIF (exercício novo da biblioteca ou criado pela pessoa), mostra só as instruções
function ExerciseDetails({ ex }) {
    if (!ex.img && !ex.instrucoes) return null;
    return (
        <details class="gif-details">
            <summary><span class="chev">▼</span> Ver exercício</summary>
            {ex.img && (
                <img
                    src={ex.img} alt={`Imagem do exercício ${ex.nome}`} class="exercise-img" loading="lazy"
                    onError={(e) => { e.currentTarget.hidden = true; }}
                />
            )}
            {ex.instrucoes && <p class="exercise-instructions">{ex.instrucoes}</p>}
        </details>
    );
}

// ex: exercício da ficha já com os dados da biblioteca (store.js → workoutExercises)
export function ExerciseCard({ workoutId, ex, index }) {
    const { lastValues, history } = getState();
    const key = valuesKey(workoutId, ex.exerciseId);
    const saved = lastValues[key] || {};
    const suggestion = computeSuggestion(history, workoutId, ex);
    const done = isExerciseDone(workoutId, ex);

    function applySuggestion() {
        applyWeight(key, ex.series, formatWeight(suggestion.weight));
        showToast(`Carga de ${formatKg(suggestion.weight)} aplicada`);
    }

    const warmups = [];
    for (let i = 0; i < WARMUP_SETS; i++) {
        warmups.push(<SetBox key={i} workoutId={workoutId} ex={ex} setIndex={i} label={`Aquec. ${i + 1}`} warmup />);
    }

    const rows = [];
    for (let w = 0; w < ex.series; w++) {
        const vals = getSetValues(saved, w);
        rows.push(
            <div class="set-row" key={w}>
                <SetBox workoutId={workoutId} ex={ex} setIndex={WARMUP_SETS + w} label={`S${w + 1}`} ariaLabel={`Série ${w + 1}`} />
                <TextField
                    class="field-input set-weight-input" data-working-index={w} placeholder="kg" inputmode="text"
                    value={vals.weight} onSave={(v) => setSetValue(key, w, 'weight', v)}
                />
                <TextField
                    class="field-input set-reps-input" data-working-index={w} placeholder="reps" inputmode="text"
                    value={vals.reps} onSave={(v) => setSetValue(key, w, 'reps', v)}
                />
            </div>
        );
    }

    return (
        <div class={'exercise-card' + (done ? ' done' : '')} data-index={index} data-exercise={ex.nome}>
            <div class="exercise-title-row">
                <h3 class="exercise-title">{ex.nome}</h3>
                <span class="done-badge" aria-hidden="true">✔</span>
            </div>

            <ExerciseDetails ex={ex} />

            <div class="exercise-info">📊 {ex.series} séries de {ex.reps}</div>
            {ex.obs && <div class="exercise-obs">📌 {ex.obs}</div>}
            {suggestion && <Suggestion suggestion={suggestion} onApply={applySuggestion} />}
            <div class="sets-container">{warmups}</div>
            <div class="set-rows">{rows}</div>
            <button class="rest-btn" onClick={() => startTimer(ex.descanso)}>
                ⏱️ Descanso ({formatTime(ex.descanso)})
            </button>
            <div class="field-row note-input">
                <TextField
                    class="field-input exercise-note-input" placeholder="Observações (ex: banco no 4)"
                    value={saved.note || ''} onSave={(v) => setExerciseNote(key, v)}
                />
            </div>
        </div>
    );
}
