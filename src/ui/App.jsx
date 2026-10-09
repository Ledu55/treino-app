import { useEffect } from 'preact/hooks';
import {
    appTitle, countDone, dismissTrainerNotice, finishWorkout, getActivePlan, getCurrentWorkout, getPlan,
    getPlanTrainer, getState, selectWorkout, setWorkoutNote, subscribe, workoutExercises
} from '../store.js';
import { recordMessage } from '../stats.js';
import { CloudSection } from './CloudSection.jsx';
import { ExerciseCard } from './ExerciseCard.jsx';
import { HistorySection } from './HistorySection.jsx';
import { PersonalScreen } from './PersonalScreen.jsx';
import { PickerScreen, PlanEditorScreen, PlansScreen, WorkoutEditorScreen, activatePlan } from './PlansScreen.jsx';
import { PrivacyLink, PrivacyScreen } from './PrivacyScreen.jsx';
import { ProgressLink, ProgressScreen } from './ProgressScreen.jsx';
import {
    StudentPickerScreen, StudentPlanScreen, StudentProgressScreen, StudentScreen, StudentWorkoutScreen, StudentsScreen
} from './TrainerScreens.jsx';
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
    } else if (getPlanTrainer(plan)) {
        text = `O "${workout.nome}" ainda não tem exercícios. Ele é montado pelo seu personal.`;
        action = ['Ver ficha', planPath(plan.id)];
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

// "Ficha atualizada pelo seu personal", até a pessoa fechar o aviso
function TrainerNotice() {
    const plans = getState().trainerNotice.map(getPlan).filter(Boolean);
    if (plans.length === 0) return null;
    const single = plans.length === 1 ? plans[0] : null;
    const active = getActivePlan();

    function open() {
        dismissTrainerNotice();
        navigate(single ? planPath(single.id) : '#fichas');
    }

    function use() {
        dismissTrainerNotice();
        activatePlan(single);
    }

    return (
        <div class="trainer-notice" id="trainer-notice" role="status">
            <p>
                📋 <strong>{single ? 'Ficha atualizada pelo seu personal' : 'Fichas atualizadas pelo seu personal'}</strong>:{' '}
                {plans.map((p) => p.nome).join(', ')}
            </p>
            <div class="plan-card-actions">
                {single && (!active || active.id !== single.id) && (
                    <button type="button" class="plan-btn primary" onClick={use}>Usar esta ficha</button>
                )}
                <button type="button" class="plan-btn" onClick={open}>{single ? 'Ver ficha' : 'Ver fichas'}</button>
                <button type="button" class="plan-btn" onClick={dismissTrainerNotice}>OK</button>
            </div>
        </div>
    );
}

function WorkoutScreen() {
    const { sessions, profile } = getState();
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
                {profile.isTrainer && (
                    <button type="button" class="header-btn left" aria-label="Alunos" title="Alunos" onClick={() => navigate('#alunos')}>👥</button>
                )}
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
                <TrainerNotice />
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
        case 'personal': return <PersonalScreen />;
        case 'students': return <StudentsScreen />;
        case 'student': return <StudentScreen studentUid={route.studentUid} />;
        case 'studentProgress': return <StudentProgressScreen studentUid={route.studentUid} />;
        case 'student-plan': return <StudentPlanScreen {...route} />;
        case 'student-workout': return <StudentWorkoutScreen {...route} />;
        case 'student-picker': return <StudentPickerScreen {...route} />;
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
