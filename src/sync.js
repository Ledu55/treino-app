// Mesclagem dos dados do celular com os da nuvem (JS puro; a parte de rede fica em cloud.js).
// Os dois lados têm o mesmo formato: { profile, plans, history, deletedIds, lastValues }.
//
// - histórico: união dos treinos pelo id; um treino apagado em qualquer lado não volta; com o
//   mesmo id nos dois lados, vence o editado por último (empate: o do celular);
// - fichas e últimos valores de cada exercício: vence o editado por último (empate: o do celular);
// - perfil: vence o editado por último; lastSessionAt fica com o mais recente, e a lista de
//   personais (trainers) é sempre a da nuvem, que só o aluno grava.

function newer(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    return (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
}

function mergeById(local = {}, remote = {}) {
    const result = { ...local };
    for (const [id, item] of Object.entries(remote)) result[id] = newer(local[id], item);
    return result;
}

function latest(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a > b ? a : b;
}

export function sortHistory(history) {
    return history.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function mergeProfile(local, remote) {
    if (!local || !remote) return local || remote || null;
    const result = { ...newer(local, remote), lastSessionAt: latest(local.lastSessionAt, remote.lastSessionAt) };
    if (remote.trainers) result.trainers = remote.trainers;
    return result;
}

export function mergeData(local, remote) {
    if (!remote) return local;
    const deletedIds = Array.from(new Set([...(local.deletedIds || []), ...(remote.deletedIds || [])]));
    const deleted = new Set(deletedIds);

    const byId = new Map();
    (local.history || []).forEach((entry) => byId.set(entry.id, entry));
    (remote.history || []).forEach((entry) => {
        if (entry && entry.id != null) byId.set(entry.id, newer(byId.get(entry.id), entry));
    });
    const history = sortHistory(Array.from(byId.values()).filter((entry) => !deleted.has(entry.id)));

    return {
        profile: mergeProfile(local.profile, remote.profile),
        plans: mergeById(local.plans, remote.plans),
        history,
        deletedIds,
        lastValues: mergeById(local.lastValues, remote.lastValues)
    };
}

// O que mudou de um lado para o outro (para saber o que enviar à nuvem ou se é preciso redesenhar)
export function changedKeys(before = {}, after = {}) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys).filter((k) => stableStringify(before[k]) !== stableStringify(after[k]));
}

// JSON com chaves ordenadas, para comparar dados sem depender da ordem
export function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
}
