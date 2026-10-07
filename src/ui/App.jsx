import {
    appTitle, countDone, finishWorkout, getActivePlan, getCurrentWorkout, getState, selectWorkout, setWorkoutNote,
    subscribe, workoutExercises
} from '../store.js';
import { CloudSection } from './CloudSection.jsx';
import { ExerciseCard } from './ExerciseCard.jsx';
import { HistorySection } from './HistorySection.jsx';
import { TimerBar } from './TimerBar.jsx';
import { Toast, showToast } from './Toast.jsx';
import { UpdateBanner } from './UpdateBanner.jsx';
import { useDebouncedField, useSubscription } from './hooks.js';

function WorkoutNote({ workoutId, value }) {
    const field = useDebouncedField(value, (text) => setWorkoutNote(workoutId, text), { trim: false });
    return <textarea id="workout-note" placeholder="Como foi o treino hoje? (energia, dores, ajustes...)" {...field} />;
}

function WorkoutScreen() {
    const { sessions } = getState();
    const plan = getActivePlan();
    const workout = getCurrentWorkout();
    const exercises = workout ? workoutExercises(workout) : [];
    const session = workout && sessions[workout.id];
    const done = workout ? countDone(workout) : 0;

    function finish() {
        if (done < exercises.length / 2
            && !confirm(`Só ${done} de ${exercises.length} exercícios concluídos. Finalizar mesmo assim?`)) return;
        finishWorkout(workout);
        showToast('Treino salvo no histórico 💪');
    }

    return (
        <>
            <header>
                <h1>{appTitle()}</h1>
                {workout && (
                    <>
                        <select
                            id="workout-selector" aria-label="Escolher treino" value={workout.id}
                            onChange={(e) => selectWorkout(e.currentTarget.value)}
                        >
                            {plan.treinos.map((t) => <option value={t.id}>{t.nome}</option>)}
                        </select>
                        <div class="progress-wrap">
                            <span id="progress-text">{done}/{exercises.length} exercícios</span>
                            <div class="progress-track">
                                <div id="progress-fill" style={{ width: `${exercises.length ? (done / exercises.length) * 100 : 0}%` }} />
                            </div>
                        </div>
                    </>
                )}
            </header>

            <div class="container">
                {workout ? (
                    <>
                        <div id="workout-container">
                            {exercises.map((ex, index) => (
                                <ExerciseCard key={workout.id + '|' + ex.exerciseId} workoutId={workout.id} ex={ex} index={index} />
                            ))}
                        </div>

                        <div class="workout-footer">
                            <h3>📝 Observações do treino</h3>
                            <WorkoutNote key={workout.id} workoutId={workout.id} value={(session && session.workoutNote) || ''} />
                            <button class="finish-btn" onClick={finish} disabled={exercises.length === 0}>✅ Finalizar treino</button>
                        </div>
                    </>
                ) : (
                    <div class="workout-footer">
                        <p>Nenhuma ficha ativa.</p>
                    </div>
                )}

                <HistorySection />
                <CloudSection />
                <p class="app-version">Versão {__APP_VERSION__}</p>
            </div>
        </>
    );
}

export function App() {
    useSubscription(subscribe);
    return (
        <>
            <WorkoutScreen />
            <UpdateBanner />
            <TimerBar />
            <Toast />
        </>
    );
}
