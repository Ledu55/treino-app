// Componentes do editor de fichas. Não leem o store: recebem a ficha e onChange(change), que
// altera um rascunho da ficha (store.js → updatePlan, ou personal-cloud.js → changeStudentPlan,
// quando o personal edita a ficha de um aluno).
import { useState } from 'preact/hooks';
import { resolveExercise, searchLibrary } from '../../data/library.js';
import { TEMPLATES } from '../../data/templates.js';
import { formatRepRange, parseRepRange } from '../../progression.js';
import { formatTime } from '../../timer.js';
import { newId } from '../../util.js';
import { useDebouncedField } from '../hooks.js';

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8];
const REPS = Array.from({ length: 30 }, (_, i) => i + 1).concat([35, 40, 45, 50, 60]);
const RESTS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const DEFAULT_RANGE = { min: 10, max: 12 };

// Exercício novo na ficha: 3 séries de 10 a 12, 90 s de descanso
export function newPlanExercise(picked) {
    return { ...picked, series: 3, reps: formatRepRange(DEFAULT_RANGE.min, DEFAULT_RANGE.max), descanso: 90, obs: '' };
}

function move(list, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
}

export function TextInput({ label, value, onSave, placeholder, ...props }) {
    const field = useDebouncedField(value, onSave);
    return (
        <label class="editor-field">
            <span>{label}</span>
            <input type="text" autocomplete="off" class="field-input" placeholder={placeholder} {...props} {...field} />
        </label>
    );
}

function NumberSelect({ label, value, options, format = String, onSave }) {
    const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
    return (
        <label class="editor-field">
            <span>{label}</span>
            <select class="editor-select" value={value} onChange={(e) => onSave(Number(e.currentTarget.value))}>
                {all.map((n) => <option value={n}>{format(n)}</option>)}
            </select>
        </label>
    );
}

function MoveButtons({ index, count, name, onMove }) {
    return (
        <>
            <button type="button" class="icon-btn" aria-label={`Subir ${name}`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
            <button type="button" class="icon-btn" aria-label={`Descer ${name}`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
        </>
    );
}

// ---------- Ficha: nome e lista de treinos ----------

export function PlanEditor({ plan, onChange, onOpenWorkout }) {
    function addWorkout() {
        const id = newId();
        const letter = String.fromCharCode(65 + (plan.treinos.length % 26));
        onChange((draft) => { draft.treinos.push({ id, nome: `Treino ${letter}`, exercicios: [] }); });
        onOpenWorkout(id);
    }

    function removeWorkout(workout) {
        if (!confirm(`Apagar o "${workout.nome}" desta ficha? O histórico de treinos continua guardado.`)) return;
        onChange((draft) => { draft.treinos = draft.treinos.filter((t) => t.id !== workout.id); });
    }

    return (
        <div class="editor">
            <TextInput
                label="Nome da ficha" value={plan.nome} id="plan-name"
                onSave={(v) => onChange((draft) => { draft.nome = v || 'Ficha sem nome'; })}
            />
            <h2 class="editor-heading">Treinos</h2>
            {plan.treinos.length === 0 && <p class="editor-empty">Nenhum treino ainda. Comece adicionando um.</p>}
            <ul class="editor-list">
                {plan.treinos.map((workout, index) => (
                    <li class="editor-item" key={workout.id}>
                        <button type="button" class="editor-item-main" onClick={() => onOpenWorkout(workout.id)}>
                            <strong>{workout.nome}</strong>
                            <span>{workout.exercicios.length} {workout.exercicios.length === 1 ? 'exercício' : 'exercícios'} ›</span>
                        </button>
                        <MoveButtons
                            index={index} count={plan.treinos.length} name={workout.nome}
                            onMove={(delta) => onChange((draft) => move(draft.treinos, index, delta))}
                        />
                        <button type="button" class="icon-btn danger" aria-label={`Apagar ${workout.nome}`} onClick={() => removeWorkout(workout)}>🗑️</button>
                    </li>
                ))}
            </ul>
            <button type="button" class="editor-add-btn" onClick={addWorkout}>+ Adicionar treino</button>
        </div>
    );
}

// ---------- Treino: nome e exercícios ----------

function ExerciseEditor({ planEx, index, count, onChange, onMove, onRemove }) {
    const ex = resolveExercise(planEx);
    const range = parseRepRange(planEx.reps) || DEFAULT_RANGE;

    function setRange(min, max) {
        onChange((e) => { e.reps = formatRepRange(min, max); });
    }

    return (
        <div class="editor-card" data-exercise={ex.nome}>
            <div class="editor-card-title">
                <h3>{ex.nome}</h3>
                <MoveButtons index={index} count={count} name={ex.nome} onMove={onMove} />
                <button type="button" class="icon-btn danger" aria-label={`Tirar ${ex.nome}`} onClick={onRemove}>🗑️</button>
            </div>
            <div class="editor-grid">
                <NumberSelect label="Séries" value={planEx.series} options={SERIES} onSave={(n) => onChange((e) => { e.series = n; })} />
                <NumberSelect label="Descanso" value={planEx.descanso} options={RESTS} format={formatTime} onSave={(n) => onChange((e) => { e.descanso = n; })} />
                <NumberSelect label="Reps (mín.)" value={range.min} options={REPS} onSave={(n) => setRange(n, Math.max(n, range.max))} />
                <NumberSelect label="Reps (máx.)" value={range.max} options={REPS} onSave={(n) => setRange(Math.min(n, range.min), n)} />
            </div>
            <TextInput
                label="Observações" value={planEx.obs || ''} placeholder="Ex.: pegada aberta, cadência lenta"
                onSave={(v) => onChange((e) => { e.obs = v; })}
            />
        </div>
    );
}

export function WorkoutEditor({ workout, onChange, onAddExercise }) {
    // Altera o treino dentro do rascunho da ficha
    const changeWorkout = (change) => onChange((draft) => change(draft.treinos.find((t) => t.id === workout.id)));
    const changeExercise = (index, change) => changeWorkout((w) => change(w.exercicios[index]));

    function remove(index, nome) {
        if (!confirm(`Tirar "${nome}" deste treino?`)) return;
        changeWorkout((w) => { w.exercicios.splice(index, 1); });
    }

    return (
        <div class="editor">
            <TextInput
                label="Nome do treino" value={workout.nome} id="workout-name"
                onSave={(v) => changeWorkout((w) => { w.nome = v || 'Treino sem nome'; })}
            />
            <h2 class="editor-heading">Exercícios</h2>
            {workout.exercicios.length === 0 && <p class="editor-empty">Nenhum exercício ainda.</p>}
            {workout.exercicios.map((planEx, index) => (
                <ExerciseEditor
                    key={planEx.exerciseId}
                    planEx={planEx} index={index} count={workout.exercicios.length}
                    onChange={(change) => changeExercise(index, change)}
                    onMove={(delta) => changeWorkout((w) => move(w.exercicios, index, delta))}
                    onRemove={() => remove(index, resolveExercise(planEx).nome)}
                />
            ))}
            <button type="button" class="editor-add-btn" onClick={onAddExercise}>+ Adicionar exercício</button>
        </div>
    );
}

// ---------- Escolher exercício ----------

// custom: exercícios criados pela pessoa em outras fichas ({ exerciseId, nome })
export function ExercisePicker({ workout, custom = [], onPick }) {
    const [query, setQuery] = useState('');
    const used = new Set(workout.exercicios.map((e) => e.exerciseId));
    const words = query.trim().toLowerCase();
    const customMatches = custom.filter((c) => c.nome.toLowerCase().includes(words));
    const results = searchLibrary(query);
    const exact = [...results, ...customMatches].some((ex) => ex.nome.toLowerCase() === words);

    const item = (id, nome, detail, picked) => (
        <li key={id}>
            <button type="button" class="picker-item" disabled={used.has(id)} onClick={() => onPick(picked)}>
                <span class="picker-name">{nome}</span>
                <span class="picker-detail">{used.has(id) ? 'já está no treino' : detail}</span>
            </button>
        </li>
    );

    return (
        <div class="editor">
            <input
                type="search" class="field-input picker-search" autocomplete="off" autofocus
                placeholder="Buscar: nome ou grupo (peito, pernas...)" aria-label="Buscar exercício"
                value={query} onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <ul class="picker-list">
                {customMatches.map((c) => item(c.exerciseId, c.nome, 'criado por você', { exerciseId: c.exerciseId, nome: c.nome }))}
                {results.map((ex) => item(ex.id, ex.nome, ex.grupo + (ex.img ? '' : ' · sem GIF'), { exerciseId: ex.id }))}
            </ul>
            {results.length === 0 && customMatches.length === 0 && (
                <p class="editor-empty">Nenhum exercício encontrado. Você pode criar um com esse nome.</p>
            )}
            {words && !exact && (
                <button type="button" class="editor-add-btn" onClick={() => onPick({ exerciseId: 'custom-' + newId(), nome: query.trim() })}>
                    + Criar exercício "{query.trim()}"
                </button>
            )}
        </div>
    );
}

// ---------- Ficha só para leitura ----------

// Ficha do personal vista pelo aluno, ou ficha do aluno vista pelo personal
export function PlanSummary({ plan }) {
    return (
        <div class="plan-summary">
            {plan.treinos.length === 0 && <p class="editor-empty">Nenhum treino ainda.</p>}
            {plan.treinos.map((workout) => (
                <section class="editor-card" key={workout.id} data-workout={workout.nome}>
                    <h3 class="plan-summary-title">{workout.nome}</h3>
                    {workout.exercicios.length === 0 && <p class="editor-empty">Nenhum exercício ainda.</p>}
                    <ul class="plan-summary-list">
                        {workout.exercicios.map((planEx) => {
                            const ex = resolveExercise(planEx);
                            return (
                                <li key={planEx.exerciseId}>
                                    <strong>{ex.nome}</strong>
                                    <span>{ex.series} séries de {ex.reps} · descanso {formatTime(ex.descanso)}</span>
                                    {ex.obs && <span class="plan-summary-obs">{ex.obs}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}

// ---------- Modelos prontos ----------

// Lista os modelos e a opção "em branco" (templateId null)
export function TemplateList({ selected, onSelect, blankLabel = 'Montar do zero' }) {
    const option = (id, nome, descricao) => (
        <li key={id || 'blank'}>
            <button
                type="button" class={'template-item' + (selected === id ? ' selected' : '')}
                aria-pressed={selected === id ? 'true' : 'false'} onClick={() => onSelect(id)}
            >
                <strong>{nome}</strong>
                <span>{descricao}</span>
            </button>
        </li>
    );
    return (
        <ul class="template-list">
            {TEMPLATES.map((t) => option(t.id, t.nome, t.descricao))}
            {option(null, blankLabel, 'Uma ficha vazia para escolher os exercícios da biblioteca.')}
        </ul>
    );
}
