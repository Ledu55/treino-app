export function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

// Id fixo para fichas, treinos e treinos finalizados; criado no celular, sem precisar de internet
export function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
