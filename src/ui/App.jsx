import { useEffect } from 'preact/hooks';
import {
    appTitle, countDone, finishWorkout, getActivePlan, getCurrentWorkout, getState, selectWorkout, setWorkoutNote,
    subscribe, workoutExercises
} from '../store.js';
import { recordMessage } from '../stats.js';
import { CloudSection } from './CloudSection.jsx';
import { ExerciseCard } from './ExerciseCard.jsx';
import { HistorySection } from './HistorySection.jsx';
import { PickerScreen, PlanEditorScreen, PlansScreen, WorkoutEditorScreen } from './PlansScreen.jsx';
import { PrivacyLink, PrivacyScreen } from './PrivacyScreen.jsx';
import { ProgressLink, ProgressScreen } from './ProgressScreen.jsx';
import { TimerBar } from './TimerBar.jsx';
import { Toast, showToast } from './Toast.jsx';
import { UpdateBanner } from './UpdateBanner.jsx';
import { Welcome } from './Welcome.jsx';
import { useDebouncedField, useSubscription } from './hooks.js';
import { navigate, planPath, useRoute } from './router.js';

function WorkoutNote({ workoutId, value }) {
    const field = useDebouncedField(value, (text) => setWorkoutNote(workoutId, text), { trim: false });
    return <textarea id="workout-note" placeholder="Como foi o treino hoje? (energia, dores, ajustes...)" {...field} />;
}

// Ficha ativa sem treinos, treino sem exercícios ou nenhuma ficha: leva ao editor
function EmptyWorkout({ plan, workout }) {
    let text;
    let action;
    if (!plan) {
        text = 'Nenhuma ficha ativa.';
        action = ['Escolher ou criar ficha', '#fichas'];
    } else if (!workout) {
        text = `A ficha "${plan.nome}" ainda não tem treinos.`;
        action = ['Editar ficha', planPath(plan.id)];
    } else {
        text = `O "${workout.nome}" ainda não tem exercícios.`;
        action = ['Adicionar exercícios', planPath(plan.id, workout.id)];
    }
    return (
        <div class="workout-footer empty-workout">
            <p>{text}</p>
            <button type="button" class="finish-btn" onClick={() => navigate(action[1])}>{action[0]}</button>
        </div>
    );
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
        const records = finishWorkout(workout);
        if (records.length > 0) showToast(recordMessage(records), 6000);
        else showToast('Treino salvo no histórico 💪');
    }

    return (
        <>
            <header>
                <button type="button" class="header-btn" aria-label="Fichas" title="Fichas" onClick={() => navigate('#fichas')}>📋</button>
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
                {exercises.length > 0 ? (
                    <>
                        <div id="workout-container">
                            {exercises.map((ex, index) => (
                                <ExerciseCard key={workout.id + '|' + ex.exerciseId} workoutId={workout.id} ex={ex} index={index} />
                            ))}
                        </div>

                        <div class="workout-footer">
                            <h3>📝 Observações do treino</h3>
                            <WorkoutNote key={workout.id} workoutId={workout.id} value={(session && session.workoutNote) || ''} />
                            <button class="finish-btn" onClick={finish}>✅ Finalizar treino</button>
                        </div>
                    </>
                ) : (
                    <EmptyWorkout plan={plan} workout={workout} />
                )}

                <ProgressLink />
                <HistorySection />
                <CloudSection />
                <PrivacyLink />
                <p class="app-version">Versão {__APP_VERSION__}</p>
            </div>
        </>
    );
}

function Screen({ route }) {
    switch (route.name) {
        case 'plans': return <PlansScreen />;
        case 'privacy': return <PrivacyScreen />;
        case 'progress': return <ProgressScreen />;
        case 'plan': return <PlanEditorScreen planId={route.planId} />;
        case 'workout': return <WorkoutEditorScreen planId={route.planId} workoutId={route.workoutId} />;
        case 'picker': return <PickerScreen planId={route.planId} workoutId={route.workoutId} />;
        default: return <WorkoutScreen />;
    }
}

export function App() {
    useSubscription(subscribe);
    const route = useRoute();
    const screenKey = JSON.stringify(route);
    const title = appTitle();
    // Cada tela começa do topo
    useEffect(() => { window.scrollTo(0, 0); }, [screenKey]);
    useEffect(() => { document.title = title; }, [title]);

    return (
        <>
            {getState().profile || route.name === 'privacy' ? <Screen key={screenKey} route={route} /> : <Welcome />}
            <UpdateBanner />
            <TimerBar />
            <Toast />
        </>
    );
}
