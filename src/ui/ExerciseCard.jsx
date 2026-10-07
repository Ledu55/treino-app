import {
    WARMUP_SETS, applyWeight, exerciseKey, getState, isExerciseDone, setExerciseNote, setSetValue, toggleSet
} from '../store.js';
import { computeSuggestion, formatKg, formatWeight, getSetValues } from '../progression.js';
import { formatTime, startTimer } from '../timer.js';
import { useDebouncedField } from './hooks.js';
import { showToast } from './Toast.jsx';

const NO_IMAGE = 'https://placehold.co/600x300/e2e8f0/475569?text=Sem+Imagem';

function TextField({ value, onSave, ...props }) {
    const field = useDebouncedField(value, onSave);
    return <input type="text" autocomplete="off" {...props} {...field} />;
}

function SetBox({ workoutKey, ex, setIndex, label, ariaLabel, warmup }) {
    const session = getState().sessions[workoutKey];
    const sets = session && session.sets && session.sets[ex.nome];
    const active = !!(sets && sets[setIndex]);
    return (
        <button
            type="button"
            class={'set-box' + (warmup ? ' warmup' : '') + (active ? ' active' : '')}
            data-set-index={setIndex}
            aria-pressed={active ? 'true' : 'false'}
            aria-label={ariaLabel}
            onClick={() => toggleSet(workoutKey, ex, setIndex)}
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

export function ExerciseCard({ workoutKey, ex, index }) {
    const { exerciseData, history } = getState();
    const key = exerciseKey(workoutKey, ex.nome);
    const saved = exerciseData[key] || {};
    const suggestion = computeSuggestion(history, workoutKey, ex);
    const done = isExerciseDone(workoutKey, ex);

    function applySuggestion() {
        applyWeight(key, ex.series, formatWeight(suggestion.weight));
        showToast(`Carga de ${formatKg(suggestion.weight)} aplicada`);
    }

    const warmups = [];
    for (let i = 0; i < WARMUP_SETS; i++) {
        warmups.push(<SetBox key={i} workoutKey={workoutKey} ex={ex} setIndex={i} label={`Aquec. ${i + 1}`} warmup />);
    }

    const rows = [];
    for (let w = 0; w < ex.series; w++) {
        const vals = getSetValues(saved, w);
        rows.push(
            <div class="set-row" key={w}>
                <SetBox workoutKey={workoutKey} ex={ex} setIndex={WARMUP_SETS + w} label={`S${w + 1}`} ariaLabel={`Série ${w + 1}`} />
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

            <details class="gif-details">
                <summary><span class="chev">▼</span> Ver exercício</summary>
                <img
                    src={ex.img} alt={`Imagem do exercício ${ex.nome}`} class="exercise-img" loading="lazy"
                    onError={(e) => { e.currentTarget.src = NO_IMAGE; }}
                />
                {ex.instrucoes && <p class="exercise-instructions">{ex.instrucoes}</p>}
            </details>

            <div class="exercise-info">📊 {ex.series} séries de {ex.reps}</div>
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
