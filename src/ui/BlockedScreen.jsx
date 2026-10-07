import { UpdateBanner } from './UpdateBanner.jsx';

const MESSAGES = {
    newer: 'Seus treinos foram salvos por uma versão mais nova do app. Para não estragar nada, '
        + 'esta versão não vai abrir esses dados. Conecte-se à internet e toque em "Atualizar".',
    error: 'Não foi possível converter seus treinos para esta versão do app. Eles continuam '
        + 'guardados neste celular, sem nenhuma mudança. Conecte-se à internet e toque em '
        + '"Atualizar"; se continuar assim, avise quem cuida do app.'
};

// Mostrada quando os dados deste celular não podem ser usados (reason: 'newer' ou 'error'). O app
// não lê nem grava nada até ser atualizado.
export function BlockedScreen({ reason }) {
    return (
        <>
            <header>
                <h1>Treino do Meu Benzinho</h1>
            </header>
            <div class="container">
                <div class="workout-footer blocked">
                    <h3>⚠️ Atualize o app</h3>
                    <p>{MESSAGES[reason]}</p>
                    <button class="finish-btn" onClick={() => location.reload()}>Atualizar</button>
                </div>
                <p class="app-version">Versão {__APP_VERSION__}</p>
            </div>
            <UpdateBanner />
        </>
    );
}
