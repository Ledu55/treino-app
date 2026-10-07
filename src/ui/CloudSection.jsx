import { cloudSignIn, cloudSignOut, getCloudState, subscribeCloud } from '../cloud.js';
import { getState } from '../store.js';
import { useSubscription } from './hooks.js';
import { showToast } from './Toast.jsx';

function formatSyncTime(ts) {
    const date = new Date(ts);
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return `hoje às ${time}`;
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
}

function status(cloud, cloudMeta) {
    if (!cloud.ready) {
        return {
            icon: '☁️',
            title: 'Backup na nuvem',
            detail: cloud.loadFailed
                ? 'Sem conexão agora. Conecte-se à internet para ativar o backup.'
                : 'Carregando…'
        };
    }
    if (!cloud.user) {
        return {
            icon: '☁️',
            title: 'Backup desativado',
            detail: 'Entre com sua conta Google para guardar seus treinos na nuvem. Assim nada se perde se trocar de celular.'
        };
    }
    let text;
    if (cloud.syncing) text = 'Salvando…';
    else if (!navigator.onLine && cloudMeta.dirty) text = 'Sem internet. O backup será feito quando a conexão voltar.';
    else if (cloud.error) text = '⚠️ Não foi possível salvar agora. Vamos tentar de novo.';
    else if (cloudMeta.lastSyncAt) text = `Último backup: ${formatSyncTime(cloudMeta.lastSyncAt)}`;
    else text = 'Preparando o primeiro backup…';
    return { icon: '✅', title: 'Backup ativo', detail: `${cloud.user.email || ''}\n${text}` };
}

async function signIn() {
    try {
        if (await cloudSignIn()) showToast('Backup ativado ☁️');
    } catch (err) {
        console.warn('Falha no login:', err);
        showToast('Não foi possível entrar');
    }
}

async function signOut() {
    if (!confirm('Sair da conta? Seus treinos continuam neste celular, mas o backup para de ser feito.')) return;
    await cloudSignOut();
    showToast('Conta desconectada');
}

export function CloudSection() {
    useSubscription(subscribeCloud);
    const cloud = getCloudState();
    // Ambiente sem Firebase (ex.: aberto pelo IP da rede): sem seção de backup
    if (!cloud.env) return null;

    const { icon, title, detail } = status(cloud, getState().cloudMeta);
    // Fora da produção, o título mostra o ambiente para não haver confusão
    const envTag = cloud.env === 'prod' ? '' : ` [${cloud.env}]`;

    return (
        <div class={'cloud-section' + (cloud.user ? ' cloud-on' : '')} id="cloud-section">
            <div class="cloud-status">
                <span class="cloud-status-icon" id="cloud-icon" aria-hidden="true">{icon}</span>
                <div>
                    <div class="cloud-status-title" id="cloud-title">{title + envTag}</div>
                    <p class="cloud-status-detail" id="cloud-detail">{detail}</p>
                </div>
            </div>
            <button type="button" class="cloud-signin-btn" id="cloud-signin" onClick={signIn} hidden={!cloud.ready || !!cloud.user}>
                Entrar com Google
            </button>
            <button type="button" class="cloud-signout-btn" id="cloud-signout" onClick={signOut} hidden={!cloud.user}>
                Sair da conta
            </button>
        </div>
    );
}
