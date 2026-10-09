// Modo personal (item 12): convites e lista de alunos (#alunos), e as telas de um aluno: fichas,
// editor (os mesmos componentes do item 7) e histórico com gráficos (os do item 11). Os dados do
// aluno são lidos e gravados direto na nuvem (personal-cloud.js).
import { useEffect, useState } from 'preact/hooks';
import { getCloudState, subscribeCloud } from '../cloud.js';
import { findCustomExercises } from '../data/library.js';
import { INVITE_DAYS, lastSessionText } from '../personal.js';
import {
    cancelInvite, changeStudentPlan, createInvite, createStudentPlan, getTrainerState, loadStudents, openStudent,
    removeStudent, subscribeTrainer
} from '../personal-cloud.js';
import { weekText, weeklyCounts } from '../stats.js';
import { getState, updateProfile } from '../store.js';
import { ExercisePicker, PlanEditor, PlanSummary, TemplateList, WorkoutEditor, newPlanExercise } from './editor/PlanEditor.jsx';
import { HistoryList } from './HistorySection.jsx';
import { useSubscription } from './hooks.js';
import { NeedsCloud } from './PersonalScreen.jsx';
import { ScreenHeader, workoutsText } from './PlansScreen.jsx';
import { ProgressView } from './ProgressScreen.jsx';
import { goBack, navigate, studentPath } from './router.js';
import { showToast } from './Toast.jsx';

function errorText(kind) {
    if (kind === 'offline') return 'Sem internet agora. Tente de novo quando a conexão voltar.';
    if (kind === 'denied') return 'Você não tem mais acesso a este aluno.';
    return 'Não foi possível carregar agora. Tente de novo.';
}

function shortDate(ms) {
    return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function myUid() {
    const { user } = getCloudState();
    return user ? user.uid : null;
}

// ---------- Ativar o modo personal ----------

function TrainerIntro() {
    return (
        <section class="privacy-box privacy-text">
            <h2 class="editor-heading">Modo personal</h2>
            <p>Monte fichas para seus alunos e acompanhe o histórico e os gráficos deles:</p>
            <ol>
                <li>você gera um código de convite aqui;</li>
                <li>o aluno digita o código no app dele (Fichas → Personal) e confirma;</li>
                <li>o aluno aparece na sua lista, e você monta fichas para ele e vê os treinos.</li>
            </ol>
            <p>O aluno pode remover seu acesso quando quiser. Seus próprios treinos continuam funcionando como antes.</p>
            <button type="button" class="plan-btn primary wide" onClick={() => updateProfile({ isTrainer: true })}>
                Ativar o modo personal
            </button>
        </section>
    );
}

// ---------- Convites ----------

function InviteItem({ invite }) {
    const [busy, setBusy] = useState(false);
    const text = `Meu código de personal no app Meu Treino: ${invite.code} (em Fichas → Personal). ${location.origin}${location.pathname}`;

    async function cancel() {
        if (!confirm(`Cancelar o código ${invite.code}? Quem já usou continua com você.`)) return;
        setBusy(true);
        try {
            await cancelInvite(invite.code);
        } catch (err) {
            showToast('Não foi possível cancelar agora');
            setBusy(false);
        }
    }

    return (
        <div class="invite-item">
            <strong class="invite-code" data-code={invite.code}>{invite.code}</strong>
            <span class="invite-expiry">vale até {shortDate(invite.expiresAt)}</span>
            <div class="plan-card-actions">
                {navigator.share && (
                    <button type="button" class="plan-btn" onClick={() => navigator.share({ text }).catch(() => {})}>Compartilhar</button>
                )}
                <button type="button" class="plan-btn danger" disabled={busy} onClick={cancel}>Cancelar código</button>
            </div>
        </div>
    );
}

function InviteSection() {
    // Enquanto a lista carrega, um código novo seria apagado da tela pelo resultado da leitura
    const { invites, loading } = getTrainerState();
    const [busy, setBusy] = useState(false);

    async function generate() {
        setBusy(true);
        try {
            await createInvite();
        } catch (err) {
            showToast(err.code === 'unavailable' ? 'Sem internet agora' : 'Não foi possível gerar o código');
        }
        setBusy(false);
    }

    return (
        <section class="privacy-box" id="invites">
            <h2 class="editor-heading">Convidar aluno</h2>
            <p class="editor-empty">
                Passe o código para o aluno: ele digita no app (Fichas → Personal) e confirma. O código vale por {INVITE_DAYS} dias
                e serve para mais de um aluno.
            </p>
            {(invites || []).map((invite) => <InviteItem key={invite.code} invite={invite} />)}
            <button type="button" class="plan-btn primary" disabled={busy || loading} onClick={generate}>
                {busy ? 'Gerando…' : (invites && invites.length ? 'Gerar outro código' : 'Gerar código de convite')}
            </button>
        </section>
    );
}

// ---------- Lista de alunos ----------

function StudentList() {
    const { students, loading, error } = getTrainerState();
    return (
        <section class="privacy-box" id="students">
            <h2 class="editor-heading">Alunos</h2>
            {error && (
                <p class="delete-error">
                    {errorText(error === 'denied' ? 'error' : error)}{' '}
                    <button type="button" class="link-btn" onClick={loadStudents}>Tentar de novo</button>
                </p>
            )}
            {!students && loading && <p class="editor-empty">Carregando…</p>}
            {students && students.length === 0 && (
                <p class="editor-empty">Nenhum aluno ainda. Gere um código e passe para o aluno.</p>
            )}
            {students && students.length > 0 && (
                <ul class="editor-list">
                    {students.map((s) => (
                        <li class="editor-item" key={s.uid}>
                            <button type="button" class="editor-item-main student-item" data-student={s.nome} onClick={() => navigate(studentPath(s.uid))}>
                                <strong>{s.nome}</strong>
                                <span>{lastSessionText(s.lastSessionAt)} ›</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export function StudentsScreen() {
    useSubscription(subscribeCloud);
    useSubscription(subscribeTrainer);
    const { profile } = getState();
    const uid = myUid();
    useEffect(() => {
        if (profile.isTrainer && uid) loadStudents();
    }, [profile.isTrainer, uid]);

    function deactivate() {
        if (!confirm('Desativar o modo personal? Seus alunos continuam com você; é só ativar de novo para vê-los.')) return;
        updateProfile({ isTrainer: false });
        goBack('#fichas');
    }

    let content;
    if (!profile.isTrainer) content = <TrainerIntro />;
    else if (!uid) content = <section class="privacy-box"><NeedsCloud what="modo personal" /></section>;
    else {
        content = (
            <>
                <InviteSection />
                <StudentList />
                <p class="privacy-link">
                    <button type="button" class="link-btn" onClick={deactivate}>Desativar o modo personal</button>
                </p>
            </>
        );
    }

    return (
        <>
            <ScreenHeader title="Alunos" onBack={() => goBack('#fichas')} />
            <div class="container">{content}</div>
        </>
    );
}

// ---------- Um aluno ----------

// Aluno aberto; refresh: lê de novo da nuvem (a tela principal do aluno faz isso ao abrir)
function useStudent(studentUid, refresh = false) {
    useSubscription(subscribeCloud);
    useSubscription(subscribeTrainer);
    const uid = myUid();
    useEffect(() => {
        const current = getTrainerState().student;
        if (uid && (refresh || !current || current.uid !== studentUid)) openStudent(studentUid);
    }, [uid, studentUid]);
    const student = getTrainerState().student;
    return student && student.uid === studentUid ? student : null;
}

// Estrutura comum das telas do aluno: login, carregando, sem acesso
function StudentFrame({ student, title, back, children }) {
    let content;
    if (!myUid()) content = <section class="privacy-box"><NeedsCloud what="modo personal" /></section>;
    else if (!student || (!student.profile && student.loading)) content = <p class="editor-empty">Carregando…</p>;
    else if (!student.profile) {
        content = (
            <p class="delete-error">
                {errorText(student.error)}{' '}
                {student.error !== 'denied' && <button type="button" class="link-btn" onClick={() => openStudent(student.uid)}>Tentar de novo</button>}
            </p>
        );
    } else content = children();
    return (
        <>
            <ScreenHeader title={(student && student.profile && title(student)) || 'Aluno'} onBack={() => goBack(back)} />
            <div class="container">{content}</div>
        </>
    );
}

// Gravações das fichas do aluno ainda a caminho do servidor
function SaveStatus() {
    const { saving, saveError } = getTrainerState();
    let text = '';
    if (saveError) {
        text = saveError === 'denied'
            ? '⚠️ A última mudança não foi salva: você não tem mais acesso a esta ficha.'
            : '⚠️ A última mudança não foi salva. Tente de novo.';
    } else if (saving > 0) {
        text = navigator.onLine ? 'Salvando…' : 'Sem internet: as mudanças vão para o aluno quando a conexão voltar. Não feche o app.';
    }
    return text ? <p class={'save-status' + (saveError ? ' delete-error' : '')} role="status">{text}</p> : null;
}

function StudentPlanCard({ student, plan }) {
    const mine = plan.createdBy === myUid();
    const active = student.profile.activePlanId === plan.id;
    let author = '👤 Montada pelo aluno';
    if (mine) author = '✏️ Montada por você';
    else if (plan.createdBy) author = '👤 Montada por outro personal';

    function copy() {
        const id = createStudentPlan({ source: plan });
        showToast('Cópia criada');
        navigate(studentPath(student.uid, 'ficha', id));
    }

    return (
        <div class={'plan-card' + (active ? ' active' : '')} data-plan={plan.nome}>
            <div class="plan-card-title">
                <h3>{plan.nome}</h3>
                {active && <span class="plan-badge">Em uso</span>}
            </div>
            <p class="plan-card-detail">{workoutsText(plan)}</p>
            <p class="plan-card-trainer">{author}</p>
            <div class="plan-card-actions">
                <button type="button" class="plan-btn" onClick={() => navigate(studentPath(student.uid, 'ficha', plan.id))}>{mine ? 'Editar' : 'Ver'}</button>
                <button type="button" class="plan-btn" onClick={copy}>{mine ? 'Duplicar' : 'Copiar para editar'}</button>
            </div>
        </div>
    );
}

function NewStudentPlan({ student }) {
    const [open, setOpen] = useState(false);

    function create(templateId) {
        const id = createStudentPlan({ templateId });
        navigate(studentPath(student.uid, 'ficha', id));
    }

    if (!open) return <button type="button" class="editor-add-btn" onClick={() => setOpen(true)}>+ Nova ficha para o aluno</button>;
    return (
        <div class="new-plan">
            <h2 class="editor-heading">Nova ficha</h2>
            <p class="editor-empty">Comece por um modelo pronto (dá para mudar tudo depois) ou monte do zero.</p>
            <TemplateList selected={undefined} onSelect={create} />
            <button type="button" class="plan-btn" onClick={() => setOpen(false)}>Cancelar</button>
        </div>
    );
}

function sortedPlans(student) {
    return Object.values(student.plans).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function StudentScreen({ studentUid }) {
    const student = useStudent(studentUid, true);

    async function remove() {
        if (!confirm(`Remover ${student.profile.nome} dos seus alunos? Você deixa de ver as fichas e os treinos de ${student.profile.nome}; as fichas que você montou continuam com o aluno.`)) return;
        try {
            await removeStudent(studentUid);
            showToast('Aluno removido');
            goBack('#alunos');
        } catch (err) {
            showToast('Não foi possível remover agora');
        }
    }

    return (
        <StudentFrame student={student} title={(s) => s.profile.nome} back="#alunos">
            {() => {
                const [week] = weeklyCounts(student.history, 1);
                return (
                    <>
                        <SaveStatus />
                        <button type="button" class="progress-link" onClick={() => navigate(studentPath(studentUid, 'progresso'))}>
                            <span class="progress-link-week">
                                {lastSessionText(student.profile.lastSessionAt)}
                                {student.profile.lastSessionAt && ` · ${weekText(week.count).toLowerCase()}`}
                            </span>
                            <span class="progress-link-action">📈 Histórico e gráficos ›</span>
                        </button>
                        <h2 class="editor-heading">Fichas</h2>
                        {sortedPlans(student).length === 0 && <p class="editor-empty">O aluno ainda não tem nenhuma ficha.</p>}
                        {sortedPlans(student).map((plan) => <StudentPlanCard key={plan.id} student={student} plan={plan} />)}
                        <NewStudentPlan student={student} />
                        <p class="editor-empty">
                            O aluno escolhe qual ficha usar e recebe um aviso quando você muda uma ficha. As fichas que você monta ficam só
                            para leitura para ele; as dele você vê e pode copiar para editar.
                        </p>
                        <button type="button" class="plan-btn danger" onClick={remove}>Remover aluno</button>
                    </>
                );
            }}
        </StudentFrame>
    );
}

export function StudentProgressScreen({ studentUid }) {
    const student = useStudent(studentUid);
    return (
        <StudentFrame student={student} title={(s) => `Treinos de ${s.profile.nome}`} back={studentPath(studentUid)}>
            {() => (
                <>
                    <ProgressView history={student.history} />
                    <section class="progress-box">
                        <h2 class="editor-heading">Histórico</h2>
                        <HistoryList history={student.history} readOnly empty="Nenhum treino finalizado ainda." />
                    </section>
                </>
            )}
        </StudentFrame>
    );
}

// ---------- Fichas do aluno ----------

function NotFound() {
    return <p class="editor-empty">Esta ficha não existe mais.</p>;
}

export function StudentPlanScreen({ studentUid, planId }) {
    const student = useStudent(studentUid);
    const plan = student && student.plans[planId];
    return (
        <StudentFrame student={student} title={() => (plan ? plan.nome : 'Ficha')} back={studentPath(studentUid)}>
            {() => {
                if (!plan) return <NotFound />;
                if (plan.createdBy !== myUid()) {
                    return (
                        <>
                            <p class="trainer-plan-note">
                                {plan.createdBy ? 'Ficha montada por outro personal.' : 'Ficha montada pelo próprio aluno.'} Para mudar,
                                faça uma cópia: ela fica com o aluno, montada por você.
                            </p>
                            <PlanSummary plan={plan} />
                            <button
                                type="button" class="plan-btn primary wide"
                                onClick={() => navigate(studentPath(studentUid, 'ficha', createStudentPlan({ source: plan })))}
                            >
                                Copiar para editar
                            </button>
                        </>
                    );
                }
                return (
                    <>
                        <SaveStatus />
                        <PlanEditor
                            plan={plan}
                            onChange={(change) => changeStudentPlan(planId, change)}
                            onOpenWorkout={(workoutId) => navigate(studentPath(studentUid, 'ficha', planId, workoutId))}
                        />
                    </>
                );
            }}
        </StudentFrame>
    );
}

// Treino de uma ficha montada por este personal (as outras ele só vê)
function ownWorkout(student, planId, workoutId) {
    const plan = student && student.plans[planId];
    if (!plan || plan.createdBy !== myUid()) return [plan, null];
    return [plan, plan.treinos.find((t) => t.id === workoutId) || null];
}

export function StudentWorkoutScreen({ studentUid, planId, workoutId }) {
    const student = useStudent(studentUid);
    const [plan, workout] = ownWorkout(student, planId, workoutId);
    return (
        <StudentFrame student={student} title={() => (plan ? plan.nome : 'Ficha')} back={studentPath(studentUid, 'ficha', planId)}>
            {() => (!workout ? <NotFound /> : (
                <>
                    <SaveStatus />
                    <WorkoutEditor
                        workout={workout}
                        onChange={(change) => changeStudentPlan(planId, change)}
                        onAddExercise={() => navigate(studentPath(studentUid, 'ficha', planId, workoutId, 'adicionar'))}
                    />
                </>
            ))}
        </StudentFrame>
    );
}

export function StudentPickerScreen({ studentUid, planId, workoutId }) {
    const student = useStudent(studentUid);
    const [, workout] = ownWorkout(student, planId, workoutId);
    const back = studentPath(studentUid, 'ficha', planId, workoutId);

    function pick(picked) {
        changeStudentPlan(planId, (draft) => {
            draft.treinos.find((t) => t.id === workoutId).exercicios.push(newPlanExercise(picked));
        });
        showToast('Exercício adicionado');
        goBack(back);
    }

    return (
        <StudentFrame student={student} title={() => (workout ? `Adicionar a ${workout.nome}` : 'Ficha')} back={back}>
            {() => (!workout ? <NotFound /> : (
                <ExercisePicker workout={workout} custom={findCustomExercises(Object.values(student.plans))} onPick={pick} />
            ))}
        </StudentFrame>
    );
}
