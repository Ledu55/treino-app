// Partes do SDK do Sentry usadas pelo app. monitoring.js carrega este módulo com import(), só
// quando o monitoramento está ligado; o build o coloca num arquivo próprio (sentry-sdk-*.js).
export {
    init, captureException, breadcrumbsIntegration, makeBrowserOfflineTransport, makeFetchTransport
} from '@sentry/browser';
