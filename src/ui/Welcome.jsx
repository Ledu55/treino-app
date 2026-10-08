// Primeiro acesso (item 8): nome, login Google (recomendado, mas opcional) e a ficha inicial.
// Funciona sem internet. Se a conta Google já tem dados na nuvem, eles são restaurados e o app
// vai direto para o treino (o perfil chega pela sincronização, em cloud.js).
import { useEffect, useRef, useState } from 'preact/hooks';
import { cloudSignIn, getCloudState, subscribeCloud } from '../cloud.js';
import { completeOnboarding, getState } from '../store.js';
import { TemplateList } from './editor/PlanEditor.jsx';
import { useSubscription } from './hooks.js';
import { navigate, planPath } from './router.js';
import { showToast } from './Toast.jsx';

function CloudStep() {
    useSubscription(subscribeCloud);
    const cloud = getCloudState();
    if (!cloud.env) return null;

    async function signIn() {
        try {
            await cloudSignIn();
        } catch (err) {
            console.warn('Falha no login:', err);
            showToast('Não foi possível entrar');
        }
    }

    let content;
    if (cloud.user) {
        content = cloud.syncing
            ? <p class="welcome-note">Procurando seus treinos na nuvem…</p>
            : <p class="welcome-note">✅ Conectado como {cloud.user.email}. Seus treinos vão ter backup.</p>;
    } else if (cloud.ready) {
        content = (
            <>
                <p class="welcome-note">Guarda seus treinos na nuvem, para não perder nada se trocar de celular. Se você já usava o app, seus treinos voltam.</p>
                <button type="button" class="cloud-signin-btn" onClick={signIn}>Entrar com Google</button>
            </>
        );
    } else {
        content = (
            <p class="welcome-note">
                {cloud.loadFailed ? 'Sem internet agora.' : 'Carregando…'} Você pode ativar o backup depois, no fim da tela do treino.
            </p>
        );
    }

    return (
        <section class="welcome-step">
            <h2>2. Backup <span class="welcome-optional">(recomendado)</span></h2>
            {content}
        </section>
    );
}

export function Welcome() {
    useSubscription(subscribeCloud);
    const [nome, setNome] = useState('');
    const [templateId, setTemplateId] = useState('corpo-inteiro');
    const started = useRef(false);
    const syncing = getCloudState().syncing;

    // Se a tela sumiu sem a pessoa tocar em "Começar", os dados vieram da nuvem
    useEffect(() => () => {
        if (!started.current && getState().profile) showToast('Seus treinos foram restaurados ☁️');
    }, []);

    function start() {
        started.current = true;
        const planId = completeOnboarding({ nome, templateId });
        // Ficha do zero: abre o editor para escolher os exercícios
        if (!templateId) navigate(planPath(planId));
    }

    return (
        <>
            <header>
                <h1>Meu Treino</h1>
                <p class="welcome-subtitle">Seu treino, suas cargas e sua evolução, no celular.</p>
            </header>
            <div class="container welcome">
                <section class="welcome-step">
                    <h2>1. Como você quer ser chamado(a)?</h2>
                    <input
                        type="text" class="field-input welcome-name" id="welcome-name" autocomplete="given-name"
                        placeholder="Seu nome" value={nome} onInput={(e) => setNome(e.currentTarget.value)}
                    />
                </section>

                <CloudStep />

                <section class="welcome-step">
                    <h2>3. Escolha sua ficha</h2>
                    <p class="welcome-note">Comece por um modelo pronto (dá para mudar tudo depois) ou monte a sua do zero.</p>
                    <TemplateList selected={templateId} onSelect={setTemplateId} />
                </section>

                <button type="button" class="finish-btn" onClick={start} disabled={syncing}>Começar</button>
                <p class="app-version">Versão {__APP_VERSION__}</p>
            </div>
        </>
    );
}
