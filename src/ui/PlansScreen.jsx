// Telas das fichas: lista (com o perfil), editor da ficha, editor do treino e escolha de exercício
import { useState } from 'preact/hooks';
import {
    appTitle, createPlan, deletePlan, duplicatePlan, getActivePlan, getPlan, getState, listCustomExercises,
    listPlans, setActivePlan, updatePlan, updateProfile
} from '../store.js';
import { ExercisePicker, PlanEditor, TemplateList, TextInput, WorkoutEditor, newPlanExercise } from './editor/PlanEditor.jsx';
import { PrivacyLink } from './PrivacyScreen.jsx';
import { goBack, navigate, planPath } from './router.js';
import { showToast } from './Toast.jsx';

export function ScreenHeader({ title, onBack }) {
    return (
        <header class="screen-header">
            <button type="button" class="back-btn" onClick={onBack}>‹ Voltar</button>
            <h1>{title}</h1>
        </header>
    );
}

function PlanCard({ plan, active }) {
    function use() {
        setActivePlan(plan.id);
        showToast(`Ficha ativa: ${plan.nome}`);
    }

    function duplicate() {
        duplicatePlan(plan.id);
        showToast('Ficha duplicada');
    }

    function remove() {
        if (!confirm(`Apagar a ficha "${plan.nome}"? O histórico de treinos continua guardado.`)) return;
        deletePlan(plan.id);
        showToast('Ficha apagada');
    }

    const count = plan.treinos.length;
    return (
        <div class={'plan-card' + (active ? ' active' : '')} data-plan={plan.nome}>
            <div class="plan-card-title">
                <h3>{plan.nome}</h3>
                {active && <span class="plan-badge">Ativa</span>}
            </div>
            <p class="plan-card-detail">
                {count} {count === 1 ? 'treino' : 'treinos'}{count ? ': ' + plan.treinos.map((t) => t.nome).join(', ') : ''}
            </p>
            <div class="plan-card-actions">
                {!active && <button type="button" class="plan-btn primary" onClick={use}>Usar esta ficha</button>}
                <button type="button" class="plan-btn" onClick={() => navigate(planPath(plan.id))}>Editar</button>
                <button type="button" class="plan-btn" onClick={duplicate}>Duplicar</button>
                <button type="button" class="plan-btn danger" onClick={remove}>Apagar</button>
            </div>
        </div>
    );
}

function NewPlan() {
    const [open, setOpen] = useState(false);

    function create(templateId) {
        const planId = createPlan({ templateId });
        if (!getActivePlan()) setActivePlan(planId);
        setOpen(false);
        navigate(planPath(planId));
    }

    if (!open) {
        return <button type="button" class="editor-add-btn" onClick={() => setOpen(true)}>+ Nova ficha</button>;
    }
    return (
        <div class="new-plan">
            <h2 class="editor-heading">Nova ficha</h2>
            <p class="editor-empty">Comece por um modelo pronto (dá para mudar tudo depois) ou monte do zero.</p>
            <TemplateList selected={undefined} onSelect={create} />
            <button type="button" class="plan-btn" onClick={() => setOpen(false)}>Cancelar</button>
        </div>
    );
}

function ProfileSection() {
    const { profile } = getState();
    return (
        <div class="editor profile-section">
            <h2 class="editor-heading">Seu perfil</h2>
            <TextInput label="Seu nome" value={profile.nome} id="profile-name" onSave={(v) => updateProfile({ nome: v })} />
            <TextInput
                label="Título do app" value={profile.titulo} id="profile-title"
                placeholder={appTitle({ ...profile, titulo: '' })} onSave={(v) => updateProfile({ titulo: v })}
            />
        </div>
    );
}

export function PlansScreen() {
    const active = getActivePlan();
    const plans = listPlans();
    return (
        <>
            <ScreenHeader title="Fichas" onBack={() => goBack('')} />
            <div class="container">
                {plans.length === 0 && <p class="editor-empty">Você ainda não tem nenhuma ficha.</p>}
                {plans.map((plan) => <PlanCard key={plan.id} plan={plan} active={active && active.id === plan.id} />)}
                <NewPlan />
                <ProfileSection />
                <PrivacyLink />
            </div>
        </>
    );
}

function Missing({ onBack }) {
    return (
        <>
            <ScreenHeader title="Ficha" onBack={onBack} />
            <div class="container"><p class="editor-empty">Esta ficha não existe mais.</p></div>
        </>
    );
}

export function PlanEditorScreen({ planId }) {
    const plan = getPlan(planId);
    if (!plan) return <Missing onBack={() => goBack('#fichas')} />;
    const active = getActivePlan();
    return (
        <>
            <ScreenHeader title="Editar ficha" onBack={() => goBack('#fichas')} />
            <div class="container">
                <PlanEditor
                    plan={plan}
                    onChange={(change) => updatePlan(planId, change)}
                    onOpenWorkout={(workoutId) => navigate(planPath(planId, workoutId))}
                />
                {(!active || active.id !== planId) && (
                    <button type="button" class="plan-btn primary wide" onClick={() => { setActivePlan(planId); showToast(`Ficha ativa: ${plan.nome}`); }}>
                        Usar esta ficha
                    </button>
                )}
            </div>
        </>
    );
}

export function WorkoutEditorScreen({ planId, workoutId }) {
    const plan = getPlan(planId);
    const workout = plan && plan.treinos.find((t) => t.id === workoutId);
    if (!workout) return <Missing onBack={() => goBack(planPath(planId))} />;
    return (
        <>
            <ScreenHeader title={plan.nome} onBack={() => goBack(planPath(planId))} />
            <div class="container">
                <WorkoutEditor
                    workout={workout}
                    onChange={(change) => updatePlan(planId, change)}
                    onAddExercise={() => navigate(planPath(planId, workoutId, 'adicionar'))}
                />
            </div>
        </>
    );
}

export function PickerScreen({ planId, workoutId }) {
    const plan = getPlan(planId);
    const workout = plan && plan.treinos.find((t) => t.id === workoutId);
    if (!workout) return <Missing onBack={() => goBack(planPath(planId))} />;

    function pick(picked) {
        updatePlan(planId, (draft) => {
            draft.treinos.find((t) => t.id === workoutId).exercicios.push(newPlanExercise(picked));
        });
        showToast('Exercício adicionado');
        goBack(planPath(planId, workoutId));
    }

    return (
        <>
            <ScreenHeader title={`Adicionar a ${workout.nome}`} onBack={() => goBack(planPath(planId, workoutId))} />
            <div class="container">
                <ExercisePicker workout={workout} custom={listCustomExercises()} onPick={pick} />
            </div>
        </>
    );
}
