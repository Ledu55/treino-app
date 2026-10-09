// Navegação entre as telas pelo # da URL, para o botão "voltar" do Android funcionar:
//   (vazio)                      treino
//   #fichas                      lista de fichas e perfil
//   #ficha/<id>                  editor da ficha (treinos)
//   #ficha/<id>/<treino>         editor do treino (exercícios)
//   #ficha/<id>/<treino>/adicionar   escolher exercício da biblioteca
//   #privacidade                 privacidade, exportar dados e excluir conta
//   #progresso                   gráficos, recordes e frequência semanal
//   #personal                    aluno: quem tem acesso aos dados e código de convite
//   #alunos                      modo personal: convites e lista de alunos
//   #aluno/<uid>                 um aluno: fichas e "Remover aluno"
//   #aluno/<uid>/progresso       histórico e gráficos do aluno
//   #aluno/<uid>/ficha/<id>[/<treino>[/adicionar]]   fichas do aluno, como em #ficha
import { useEffect, useState } from 'preact/hooks';

// Editor de ficha a partir de [id, treino, extra]
function planRoute(prefix, [planId, workoutId, extra], fields) {
    if (workoutId && extra === 'adicionar') return { name: prefix + 'picker', planId, workoutId, ...fields };
    if (workoutId) return { name: prefix + 'workout', planId, workoutId, ...fields };
    return { name: prefix + 'plan', planId, ...fields };
}

export function parseRoute(hash) {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'fichas') return { name: 'plans' };
    if (parts[0] === 'privacidade') return { name: 'privacy' };
    if (parts[0] === 'progresso') return { name: 'progress' };
    if (parts[0] === 'personal') return { name: 'personal' };
    if (parts[0] === 'alunos') return { name: 'students' };
    if (parts[0] === 'ficha' && parts[1]) return planRoute('', parts.slice(1));
    if (parts[0] === 'aluno' && parts[1]) {
        const studentUid = parts[1];
        if (parts[2] === 'progresso') return { name: 'studentProgress', studentUid };
        if (parts[2] === 'ficha' && parts[3]) return planRoute('student-', parts.slice(3), { studentUid });
        return { name: 'student', studentUid };
    }
    return { name: 'home' };
}

function path(parts) {
    return '#' + parts.filter(Boolean).map(encodeURIComponent).join('/');
}

export function planPath(planId, workoutId, extra) {
    return path(['ficha', planId, workoutId, extra]);
}

// Telas do aluno no modo personal: studentPath(uid), studentPath(uid, 'progresso'),
// studentPath(uid, 'ficha', planId, workoutId, 'adicionar')
export function studentPath(studentUid, ...rest) {
    return path(['aluno', studentUid, ...rest]);
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
