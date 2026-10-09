// Privacidade e dados (item 10, LGPD): o que o app guarda, onde e para quê; baixar os dados e
// excluir a conta. Abre também no primeiro acesso, antes de existir um perfil.
import { useState } from 'preact/hooks';
import { deleteCloudAccount, getCloudState, subscribeCloud } from '../cloud.js';
import { exportData, historyToCsv } from '../export.js';
import { monitoringEnabled } from '../monitoring.js';
import { clearLocalData } from '../storage.js';
import { getState, listPlans } from '../store.js';
import { signIn } from './CloudSection.jsx';
import { useSubscription } from './hooks.js';
import { ScreenHeader } from './PlansScreen.jsx';
import { goBack, navigate } from './router.js';

// Aviso mostrado depois de recarregar o app (main.jsx)
export const NOTICE_KEY = 'treino.notice';

// Contato de quem responde pelos dados (LGPD); provisório, até haver um endereço mais formal
const PRIVACY_CONTACT = 'empulse.impulse@gmail.com';

// Link para esta tela, no fim do treino, nas fichas e no primeiro acesso
export function PrivacyLink() {
    return (
        <p class="privacy-link">
            <button type="button" class="link-btn" onClick={() => navigate('#privacidade')}>Privacidade e seus dados</button>
        </p>
    );
}

function PrivacyText() {
    return (
        <section class="privacy-text">
            <h2 class="editor-heading">O que o app guarda</h2>
            <ul>
                <li>Seu nome e o título do app.</li>
                <li>Suas fichas e os treinos que você finaliza: exercícios, cargas, repetições e observações.</li>
                <li>Os últimos valores digitados em cada exercício e o treino em andamento.</li>
                <li>Se você entrar com Google: o nome, o e-mail e a foto da sua conta Google, usados só para o login.</li>
            </ul>
            <h2 class="editor-heading">Onde ficam</h2>
            <ul>
                <li><strong>Neste celular</strong>, sempre. O app funciona sem internet e sem conta.</li>
                <li>
                    <strong>Na nuvem</strong>, só se você entrar com Google: uma cópia de tudo (menos o treino em andamento)
                    fica no Firebase, um serviço do Google, como backup e para levar seus treinos a outro celular.
                    Os servidores podem ficar fora do Brasil.
                </li>
                {monitoringEnabled() && (
                    <li>
                        <strong>Relatórios de erro</strong>: quando algo dá errado, o app envia ao Sentry (servidores nos
                        Estados Unidos) a mensagem do erro,
                        o navegador, o sistema do celular e a versão do app, para o problema ser corrigido. Sem seu nome,
                        seu e-mail ou seus treinos.
                    </li>
                )}
            </ul>
            <h2 class="editor-heading">Para quê</h2>
            <p>
                Só para mostrar seus treinos, sugerir a carga do próximo e guardar o backup. Não há anúncios, e seus dados
                não são vendidos nem compartilhados com ninguém.
            </p>
            <h2 class="editor-heading">Seus direitos</h2>
            <p>
                Você pode baixar seus dados e excluir sua conta a qualquer momento, nesta tela. Para só parar o backup, use
                "Sair da conta" no fim da tela do treino.
            </p>
            <h2 class="editor-heading">Contato</h2>
            <p>
                Dúvidas ou pedidos sobre seus dados: <a href={`mailto:${PRIVACY_CONTACT}`} id="privacy-contact">{PRIVACY_CONTACT}</a>
            </p>
        </section>
    );
}

function localDate() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function ExportSection() {
    const state = getState();
    return (
        <section class="privacy-box" id="export-data">
            <h2 class="editor-heading">Baixar meus dados</h2>
            <p class="editor-empty">Tudo num arquivo (perfil, fichas e histórico), ou só o histórico numa planilha, série por série.</p>
            <div class="plan-card-actions">
                <button
                    type="button" class="plan-btn"
                    onClick={() => download(`meu-treino-${localDate()}.json`, JSON.stringify(exportData(state), null, 2), 'application/json')}
                >
                    ⬇️ Tudo (JSON)
                </button>
                <button
                    type="button" class="plan-btn"
                    onClick={() => download(`meu-treino-historico-${localDate()}.csv`, historyToCsv(state.history), 'text/csv')}
                >
                    ⬇️ Histórico (planilha)
                </button>
            </div>
        </section>
    );
}

function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

// Com login: apaga a nuvem, a conta e o celular. Sem login: só o celular.
function DeleteSection() {
    const [step, setStep] = useState('idle'); // 'idle' | 'confirm' | 'deleting'
    const [error, setError] = useState('');
    const cloud = getCloudState();
    const { profile, history, cloudMeta } = getState();
    const signedIn = !!cloud.user;
    if (!profile && !signedIn) return null;
    const offline = signedIn && !navigator.onLine;
    // Este celular já fez backup com uma conta que agora não está conectada
    const hadBackup = !signedIn && cloud.env && cloudMeta.uid;

    async function confirmDelete() {
        setStep('deleting');
        setError('');
        try {
            if (signedIn && !(await deleteCloudAccount())) {
                setStep('confirm');
                return;
            }
        } catch (err) {
            console.warn('Falha ao excluir a conta:', err);
            setError(err.code === 'auth/user-mismatch'
                ? `Escolha a mesma conta Google (${cloud.user && cloud.user.email}).`
                : 'Não foi possível excluir agora. Confira a internet e tente de novo.');
            setStep('confirm');
            return;
        }
        clearLocalData();
        try { sessionStorage.setItem(NOTICE_KEY, signedIn ? 'Conta excluída' : 'Dados apagados'); } catch (e) { /* sem aviso */ }
        // Recomeça do zero, na tela de boas-vindas
        location.replace(location.pathname + location.search);
    }

    return (
        <section class="privacy-box" id="delete-data">
            <h2 class="editor-heading">{signedIn ? 'Excluir conta' : 'Apagar meus dados'}</h2>
            <p class="editor-empty">
                {signedIn
                    ? `Apaga sua conta, o backup na nuvem (${cloud.user.email}) e todos os dados deste celular.`
                    : 'Apaga todos os dados deste celular: perfil, fichas e histórico.'}
                {' '}Não dá para desfazer.
            </p>
            {hadBackup && (
                <p class="editor-empty">
                    Este celular já fez backup com uma conta Google. Para apagar também os dados da nuvem, entre com ela antes.
                    {cloud.ready && <> <button type="button" class="link-btn" onClick={signIn}>Entrar com Google</button></>}
                </p>
            )}
            {step === 'idle' ? (
                <button type="button" class="plan-btn danger" onClick={() => setStep('confirm')}>
                    {signedIn ? 'Excluir conta e dados' : 'Apagar dados deste celular'}
                </button>
            ) : (
                <div class="delete-confirm">
                    <p>
                        <strong>Tem certeza?</strong> Somem para sempre {plural(listPlans().length, 'ficha', 'fichas')} e{' '}
                        {plural(history.length, 'treino', 'treinos')} do histórico. Para guardar uma cópia, baixe seus dados antes.
                    </p>
                    {signedIn && <p>Se você usa o app em outro celular, os treinos que estão lá continuam lá.</p>}
                    {offline && <p class="delete-error">Conecte-se à internet para excluir a conta.</p>}
                    {error && <p class="delete-error">{error}</p>}
                    <div class="plan-card-actions">
                        <button type="button" class="plan-btn danger-solid" disabled={step === 'deleting' || offline} onClick={confirmDelete}>
                            {step === 'deleting' ? 'Excluindo…' : 'Sim, excluir tudo'}
                        </button>
                        <button type="button" class="plan-btn" disabled={step === 'deleting'} onClick={() => { setStep('idle'); setError(''); }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

export function PrivacyScreen() {
    useSubscription(subscribeCloud);
    return (
        <>
            <ScreenHeader title="Privacidade e dados" onBack={() => goBack('')} />
            <div class="container">
                <PrivacyText />
                {getState().profile && <ExportSection />}
                <DeleteSection />
            </div>
        </>
    );
}
