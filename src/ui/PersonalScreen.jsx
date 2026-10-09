// Personal, do lado do aluno (item 12): quem tem acesso aos dados (com "Remover acesso") e o
// código de convite que dá acesso a um personal. Precisa de login e de internet.
import { useState } from 'preact/hooks';
import { getCloudState, subscribeCloud } from '../cloud.js';
import { INVITE_CODE_LENGTH, isInviteCode, linkedTrainers, normalizeInviteCode } from '../personal.js';
import { acceptInvite, failureKind, findInvite, removeTrainer } from '../personal-cloud.js';
import { getState } from '../store.js';
import { signIn } from './CloudSection.jsx';
import { useSubscription } from './hooks.js';
import { ScreenHeader } from './PlansScreen.jsx';
import { goBack, navigate } from './router.js';
import { showToast } from './Toast.jsx';

export const ACCESS_TEXT = 'vê seu nome, suas fichas e seu histórico de treinos, e pode montar fichas para você';

function errorText(err) {
    return failureKind(err) === 'offline' ? 'Sem internet agora. Tente de novo quando a conexão voltar.' : 'Não foi possível agora. Tente de novo.';
}

// Sem login (ou sem nuvem neste endereço), o vínculo não funciona: o personal vê tudo pela nuvem
export function NeedsCloud({ what }) {
    const cloud = getCloudState();
    if (!cloud.env) return <p class="editor-empty">O {what} precisa do backup na nuvem, que não está disponível neste endereço.</p>;
    if (!cloud.ready) {
        return <p class="editor-empty">{cloud.loadFailed ? 'Sem internet agora. Conecte-se para continuar.' : 'Carregando…'}</p>;
    }
    return (
        <>
            <p class="editor-empty">O {what} usa a nuvem: entre com sua conta Google para continuar.</p>
            <button type="button" class="cloud-signin-btn" onClick={signIn}>Entrar com Google</button>
        </>
    );
}

function TrainerItem({ trainer }) {
    const [busy, setBusy] = useState(false);

    async function remove() {
        if (!confirm(`Remover o acesso de ${trainer.nome}? A partir de agora, ${trainer.nome} não vê mais seus dados, e as fichas montadas pelo personal passam a ser suas.`)) return;
        setBusy(true);
        try {
            await removeTrainer(trainer.uid);
            showToast('Acesso removido');
        } catch (err) {
            showToast(errorText(err));
            setBusy(false);
        }
    }

    return (
        <li class="person-item" data-trainer={trainer.nome}>
            <span class="person-name">👤 {trainer.nome}</span>
            <button type="button" class="plan-btn danger" disabled={busy || !getCloudState().user} onClick={remove}>Remover acesso</button>
        </li>
    );
}

function InviteCodeForm() {
    const [code, setCode] = useState('');
    const [invite, setInvite] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function lookUp(e) {
        e.preventDefault();
        const normalized = normalizeInviteCode(code);
        if (!isInviteCode(normalized)) {
            setError(`O código tem ${INVITE_CODE_LENGTH} letras e números.`);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const found = await findInvite(normalized);
            if (!found) setError('Código não encontrado ou vencido. Peça um novo ao seu personal.');
            else if (found.own) setError('Esse código é seu. Passe para um aluno.');
            else if (linkedTrainers(getState().profile).some((t) => t.uid === found.trainerUid)) setError(`${found.trainerNome} já tem acesso.`);
            else setInvite(found);
        } catch (err) {
            setError(errorText(err));
        }
        setBusy(false);
    }

    async function accept() {
        setBusy(true);
        try {
            await acceptInvite(invite);
            showToast(`${invite.trainerNome} agora tem acesso`);
            setInvite(null);
            setCode('');
        } catch (err) {
            setError(errorText(err));
        }
        setBusy(false);
    }

    if (invite) {
        return (
            <div class="invite-confirm">
                <p><strong>Dar acesso a {invite.trainerNome}?</strong></p>
                <p>{invite.trainerNome} {ACCESS_TEXT}. Os últimos valores digitados e o treino em andamento ficam só com você. Você pode remover o acesso quando quiser.</p>
                {error && <p class="delete-error">{error}</p>}
                <div class="plan-card-actions">
                    <button type="button" class="plan-btn primary" disabled={busy} onClick={accept}>Dar acesso</button>
                    <button type="button" class="plan-btn" disabled={busy} onClick={() => { setInvite(null); setError(''); }}>Cancelar</button>
                </div>
            </div>
        );
    }
    return (
        <form class="invite-form" onSubmit={lookUp}>
            <input
                type="text" class="field-input invite-input" id="invite-code" autocomplete="off" autocapitalize="characters"
                aria-label="Código do personal" placeholder="Código" maxlength={INVITE_CODE_LENGTH + 4}
                value={code} onInput={(e) => setCode(e.currentTarget.value)}
            />
            <button type="submit" class="plan-btn primary" disabled={busy || !code.trim()}>{busy ? 'Procurando…' : 'Continuar'}</button>
            {error && <p class="delete-error">{error}</p>}
        </form>
    );
}

export function PersonalScreen() {
    useSubscription(subscribeCloud);
    const trainers = linkedTrainers(getState().profile);
    const signedIn = !!getCloudState().user;

    return (
        <>
            <ScreenHeader title="Personal" onBack={() => goBack('#fichas')} />
            <div class="container">
                <section class="privacy-box" id="trainers">
                    <h2 class="editor-heading">Quem tem acesso aos seus dados</h2>
                    {trainers.length === 0
                        ? <p class="editor-empty">Nenhum personal tem acesso aos seus dados.</p>
                        : <ul class="person-list">{trainers.map((t) => <TrainerItem key={t.uid} trainer={t} />)}</ul>}
                    <p class="editor-empty">
                        Um personal com acesso {ACCESS_TEXT}. As fichas que ele monta ficam só para leitura: para mudar, duplique a ficha.
                    </p>
                </section>

                <section class="privacy-box" id="invite">
                    <h2 class="editor-heading">Tenho um código de personal</h2>
                    {signedIn ? (
                        <>
                            <p class="editor-empty">Digite o código que seu personal gerou no app. Você confirma antes de dar acesso.</p>
                            <InviteCodeForm />
                        </>
                    ) : <NeedsCloud what="vínculo com o personal" />}
                </section>

                <section class="privacy-box">
                    <h2 class="editor-heading">Você é personal?</h2>
                    <p class="editor-empty">Monte fichas para seus alunos e acompanhe o histórico e os gráficos deles.</p>
                    <button type="button" class="plan-btn" onClick={() => navigate('#alunos')}>Abrir o modo personal</button>
                </section>
            </div>
        </>
    );
}
