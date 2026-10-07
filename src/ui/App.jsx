import { treinos, workoutNames } from '../data/treinos.js';
import { countDone, finishWorkout, getState, selectWorkout, setWorkoutNote, subscribe } from '../store.js';
import { CloudSection } from './CloudSection.jsx';
import { ExerciseCard } from './ExerciseCard.jsx';
import { HistorySection } from './HistorySection.jsx';
import { TimerBar } from './TimerBar.jsx';
import { Toast, showToast } from './Toast.jsx';
import { UpdateBanner } from './UpdateBanner.jsx';
import { useDebouncedField, useSubscription } from './hooks.js';

function WorkoutNote({ workoutKey, value }) {
    const field = useDebouncedField(value, (text) => setWorkoutNote(workoutKey, text), { trim: false });
    return <textarea id="workout-note" placeholder="Como foi o treino hoje? (energia, dores, ajustes...)" {...field} />;
}

export function App() {
    useSubscription(subscribe);
    const { currentWorkout, sessions } = getState();
    const exercises = treinos[currentWorkout];
    const session = sessions[currentWorkout];
    const done = countDone(currentWorkout);

    function finish() {
        if (done < exercises.length / 2
            && !confirm(`Só ${done} de ${exercises.length} exercícios concluídos. Finalizar mesmo assim?`)) return;
        finishWorkout(currentWorkout);
        showToast('Treino salvo no histórico 💪');
    }

    return (
        <>
            <header>
                <h1>Treino do Meu Benzinho</h1>
                <select
                    id="workout-selector" aria-label="Escolher treino" value={currentWorkout}
                    onChange={(e) => selectWorkout(e.currentTarget.value)}
                >
                    {Object.keys(treinos).map((key) => <option value={key}>{workoutNames[key]}</option>)}
                </select>
                <div class="progress-wrap">
                    <span id="progress-text">{done}/{exercises.length} exercícios</span>
                    <div class="progress-track">
                        <div id="progress-fill" style={{ width: `${(done / exercises.length) * 100}%` }} />
                    </div>
                </div>
            </header>

            <div class="container">
                <div id="workout-container">
                    {exercises.map((ex, index) => (
                        <ExerciseCard key={currentWorkout + '|' + ex.nome} workoutKey={currentWorkout} ex={ex} index={index} />
                    ))}
                </div>

                <div class="workout-footer">
                    <h3>📝 Observações do treino</h3>
                    <WorkoutNote key={currentWorkout} workoutKey={currentWorkout} value={(session && session.workoutNote) || ''} />
                    <button class="finish-btn" onClick={finish}>✅ Finalizar treino</button>
                </div>

                <HistorySection />
                <CloudSection />
                <p class="app-version">Versão {__APP_VERSION__}</p>
            </div>

            <UpdateBanner />
            <TimerBar />
            <Toast />
        </>
    );
}
