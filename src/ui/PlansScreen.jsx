// Telas das fichas: lista (com o perfil), editor da ficha, editor do treino e escolha de exercício
import { useState } from 'preact/hooks';
import { linkedTrainers } from '../personal.js';
import {
    appTitle, createPlan, deletePlan, duplicatePlan, getActivePlan, getPlan, getPlanTrainer, getState,
    listCustomExercises, listPlans, setActivePlan, updatePlan, updateProfile
} from '../store.js';
import {
    ExercisePicker, PlanEditor, PlanSummary, TemplateList, TextInput, WorkoutEditor, newPlanExercise
} from './editor/PlanEditor.jsx';
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

export function activatePlan(plan) {
    setActivePlan(plan.id);
    showToast(`Ficha ativa: ${plan.nome}`);
}

export function workoutsText(plan) {
    const count = plan.treinos.length;
    return `${count} ${count === 1 ? 'treino' : 'treinos'}${count ? ': ' + plan.treinos.map((t) => t.nome).join(', ') : ''}`;
}

function PlanCard({ plan, active }) {
    const trainer = getPlanTrainer(plan);

    function duplicate() {
        duplicatePlan(plan.id);
        showToast('Ficha duplicada');
    }

    function remove() {
        const from = trainer ? ` Ela foi montada pelo seu personal (${trainer.nome}).` : '';
        if (!confirm(`Apagar a ficha "${plan.nome}"?${from} O histórico de treinos continua guardado.`)) return;
        deletePlan(plan.id);
        showToast('Ficha apagada');
    }

    return (
        <div class={'plan-card' + (active ? ' active' : '')} data-plan={plan.nome}>
            <div class="plan-card-title">
                <h3>{plan.nome}</h3>
                {active && <span class="plan-badge">Ativa</span>}
            </div>
            <p class="plan-card-detail">{workoutsText(plan)}</p>
            {trainer && <p class="plan-card-trainer">👤 Montada por {trainer.nome} (seu personal)</p>}
            <div class="plan-card-actions">
                {!active && <button type="button" class="plan-btn primary" onClick={() => activatePlan(plan)}>Usar esta ficha</button>}
                <button type="button" class="plan-btn" onClick={() => navigate(planPath(plan.id))}>{trainer ? 'Ver' : 'Editar'}</button>
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

// Link para a tela do personal (aluno) e, para quem é personal, para os alunos
function PersonalSection() {
    const { profile } = getState();
    const trainers = linkedTrainers(profile);
    return (
        <div class="editor personal-section">
            <h2 class="editor-heading">Personal</h2>
            <p class="editor-empty">
                {trainers.length
                    ? `${trainers.map((t) => t.nome).join(', ')} ${trainers.length === 1 ? 'tem' : 'têm'} acesso às suas fichas e ao seu histórico.`
                    : 'Tem um personal? Com o código dele, ele monta fichas para você e acompanha seus treinos.'}
            </p>
            <div class="plan-card-actions">
                <button type="button" class="plan-btn" onClick={() => navigate('#personal')}>
                    {trainers.length ? 'Ver quem tem acesso' : 'Tenho um código de personal'}
                </button>
                <button type="button" class="plan-btn" onClick={() => navigate('#alunos')}>
                    {profile.isTrainer ? '👥 Meus alunos' : 'Sou personal'}
                </button>
            </div>
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
                <PersonalSection />
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

function UseButton({ plan }) {
    const active = getActivePlan();
    if (active && active.id === plan.id) return null;
    return <button type="button" class="plan-btn primary wide" onClick={() => activatePlan(plan)}>Usar esta ficha</button>;
}

// Ficha montada pelo personal: só leitura; para mudar, o aluno duplica e a cópia é dele
function TrainerPlanScreen({ plan, trainer }) {
    function duplicate() {
        const copyId = duplicatePlan(plan.id);
        showToast('Ficha duplicada: a cópia é sua');
        navigate(planPath(copyId));
    }

    return (
        <>
            <ScreenHeader title={plan.nome} onBack={() => goBack('#fichas')} />
            <div class="container">
                <p class="trainer-plan-note">
                    👤 Ficha montada por <strong>{trainer.nome}</strong>, seu personal. Cargas e repetições você registra
                    normalmente no treino. Para mudar exercícios, séries ou descanso, duplique a ficha: a cópia é sua.
                </p>
                <PlanSummary plan={plan} />
                <UseButton plan={plan} />
                <button type="button" class="plan-btn wide" onClick={duplicate}>Duplicar ficha</button>
            </div>
        </>
    );
}

export function PlanEditorScreen({ planId }) {
    const plan = getPlan(planId);
    if (!plan) return <Missing onBack={() => goBack('#fichas')} />;
    const trainer = getPlanTrainer(plan);
    if (trainer) return <TrainerPlanScreen plan={plan} trainer={trainer} />;
    return (
        <>
            <ScreenHeader title="Editar ficha" onBack={() => goBack('#fichas')} />
            <div class="container">
                <PlanEditor
                    plan={plan}
                    onChange={(change) => updatePlan(planId, change)}
                    onOpenWorkout={(workoutId) => navigate(planPath(planId, workoutId))}
                />
                <UseButton plan={plan} />
            </div>
        </>
    );
}

export function WorkoutEditorScreen({ planId, workoutId }) {
    const plan = getPlan(planId);
    const workout = plan && plan.treinos.find((t) => t.id === workoutId);
    if (!workout) return <Missing onBack={() => goBack(planPath(planId))} />;
    if (getPlanTrainer(plan)) return <PlanEditorScreen planId={planId} />;
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
    if (getPlanTrainer(plan)) return <PlanEditorScreen planId={planId} />;

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
