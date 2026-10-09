// Navegação entre as telas pelo # da URL, para o botão "voltar" do Android funcionar:
//   (vazio)                      treino
//   #fichas                      lista de fichas e perfil
//   #ficha/<id>                  editor da ficha (treinos)
//   #ficha/<id>/<treino>         editor do treino (exercícios)
//   #ficha/<id>/<treino>/adicionar   escolher exercício da biblioteca
//   #privacidade                 privacidade, exportar dados e excluir conta
//   #progresso                   gráficos, recordes e frequência semanal
import { useEffect, useState } from 'preact/hooks';

export function parseRoute(hash) {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'fichas') return { name: 'plans' };
    if (parts[0] === 'privacidade') return { name: 'privacy' };
    if (parts[0] === 'progresso') return { name: 'progress' };
    if (parts[0] === 'ficha' && parts[1]) {
        const [, planId, workoutId, extra] = parts;
        if (workoutId && extra === 'adicionar') return { name: 'picker', planId, workoutId };
        if (workoutId) return { name: 'workout', planId, workoutId };
        return { name: 'plan', planId };
    }
    return { name: 'home' };
}

export function planPath(planId, workoutId, extra) {
    return '#' + ['ficha', planId, workoutId, extra].filter(Boolean).map(encodeURIComponent).join('/');
}

const CHANGE = 'routechange';

function notify() {
    window.dispatchEvent(new Event(CHANGE));
}

// Abre uma tela. A profundidade fica no histórico do navegador, para goBack saber se pode voltar.
export function navigate(hash) {
    const depth = ((history.state && history.state.depth) || 0) + 1;
    history.pushState({ depth }, '', hash || location.pathname + location.search);
    notify();
}

// Volta para a tela anterior; se o app foi aberto direto nesta tela, vai para `parent`
export function goBack(parent) {
    if (history.state && history.state.depth > 0) {
        history.back();
    } else {
        history.replaceState(null, '', parent || location.pathname + location.search);
        notify();
    }
}

export function useRoute() {
    const [hash, setHash] = useState(location.hash);
    useEffect(() => {
        const update = () => setHash(location.hash);
        window.addEventListener('popstate', update);
        window.addEventListener(CHANGE, update);
        return () => {
            window.removeEventListener('popstate', update);
            window.removeEventListener(CHANGE, update);
        };
    }, []);
    return parseRoute(hash);
}
