import { useEffect, useReducer, useRef, useState } from 'preact/hooks';

// Redesenha o componente a cada aviso de um módulo de estado (store, cloud, timer, toast)
export function useSubscription(subscribe) {
    const [, forceUpdate] = useReducer((n) => n + 1, 0);
    useEffect(() => subscribe(forceUpdate), [subscribe]);
}

// Texto de um campo que salva com 300 ms de atraso. O campo guarda o que foi digitado (com
// espaços), e o valor salvo vai sem espaços nas pontas quando trim é true. Se o valor salvo mudar
// por fora (botão "Usar", backup, treino finalizado), o campo passa a mostrar o novo valor.
export function useDebouncedField(value, onSave, { trim = true, delay = 300 } = {}) {
    const [text, setText] = useState(value);
    const lastSaved = useRef(value);
    const pending = useRef(null);
    const saveRef = useRef(onSave);
    saveRef.current = onSave;

    const normalize = (t) => (trim ? t.trim() : t);

    function save(t) {
        pending.current = null;
        lastSaved.current = normalize(t);
        saveRef.current(lastSaved.current);
    }

    useEffect(() => {
        if (value === lastSaved.current) return;
        if (pending.current) clearTimeout(pending.current.timer);
        pending.current = null;
        lastSaved.current = value;
        setText(value);
    }, [value]);

    // Ao trocar de treino, o que ainda não foi salvo é salvo na hora
    useEffect(() => () => {
        if (pending.current) {
            clearTimeout(pending.current.timer);
            save(pending.current.text);
        }
    }, []);

    function onInput(e) {
        const t = e.currentTarget.value;
        setText(t);
        if (pending.current) clearTimeout(pending.current.timer);
        pending.current = { text: t, timer: setTimeout(() => save(t), delay) };
    }

    return { value: text, onInput };
}
