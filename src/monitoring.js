// Monitoramento de erros (Sentry, plano gratuito): para saber quando algo falha no celular de outra
// pessoa. Só liga na produção e com SENTRY_DSN preenchido; o SDK é carregado sob demanda, depois da
// abertura do app, num arquivo próprio (sentry-sdk-*.js). Os relatórios não levam dados pessoais:
// sem IP, sem e-mail e sem os valores dos treinos, só o erro, o navegador e a versão do app.
// Sem internet, os relatórios esperam no celular e vão quando a conexão voltar.

// Sentry → Settings → Projects → (projeto) → Client Keys (DSN). Vazio: monitoramento desligado.
export const SENTRY_DSN = 'https://33a38657157aff48262ff2273d771d14@o4512227906289664.ingest.us.sentry.io/4512227916513280';

let enabled = false;
let sentry = null;
// Erros que aconteceram antes de o SDK carregar
const queue = [];

export function monitoringEnabled() {
    return enabled;
}

// Erros já tratados pelo app (ex.: falha no backup), que de outro jeito ficariam só no console.
// context diz onde foi ('sync', 'login', ...).
export function reportError(err, context) {
    if (!enabled) return;
    if (sentry) sentry.captureException(err, { tags: { context } });
    else queue.push([err, context]);
}

function queueUncaught(event) {
    queue.push([event.reason || event.error || event.message, 'uncaught']);
}

// env: o mesmo ambiente do Firebase (pickFirebaseEnv). Chamado antes de tudo, para pegar também
// erros da abertura (ex.: migração dos dados).
export function initMonitoring(env) {
    if (env !== 'prod' || !SENTRY_DSN) return;
    enabled = true;
    window.addEventListener('error', queueUncaught);
    window.addEventListener('unhandledrejection', queueUncaught);

    import('./sentry-sdk.js').then((mod) => {
        window.removeEventListener('error', queueUncaught);
        window.removeEventListener('unhandledrejection', queueUncaught);
        mod.init({
            dsn: SENTRY_DSN,
            environment: env,
            release: __APP_VERSION__,
            sendDefaultPii: false,
            transport: mod.makeBrowserOfflineTransport(mod.makeFetchTransport),
            // Sem contar aberturas do app (só erros) e sem o registro de toques e de requisições
            // (os endereços do Firestore levam o uid)
            integrations: (defaults) => [
                ...defaults.filter((i) => i.name !== 'BrowserSession' && i.name !== 'Breadcrumbs'),
                mod.breadcrumbsIntegration({ dom: false, fetch: false, xhr: false })
            ],
            beforeSend(event) {
                delete event.user;
                return event;
            }
        });
        sentry = mod;
        queue.splice(0).forEach(([err, context]) => reportError(err, context));
    }).catch(() => {
        // Sem internet na primeira abertura: o SDK carrega numa próxima vez (o service worker guarda o arquivo)
    });
}
