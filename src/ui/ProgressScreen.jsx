// Gráficos e recordes (item 11): frequência semanal e evolução de carga e volume por exercício.
// ProgressView recebe o histórico em vez de ler o store, para o modo personal (item 12) mostrar
// o de um aluno. Os gráficos são SVG desenhados aqui, sem biblioteca.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatKg, formatWeight } from '../progression.js';
import { exerciseProgress, exercisesWithProgress, weekText, weeklyCounts } from '../stats.js';
import { getState } from '../store.js';
import { ScreenHeader } from './PlansScreen.jsx';
import { goBack, navigate } from './router.js';

const RECENT_ROWS = 10;

function shortDate(date, withYear) {
    return new Date(date).toLocaleDateString('pt-BR', withYear
        ? { day: '2-digit', month: '2-digit', year: '2-digit' }
        : { day: '2-digit', month: '2-digit' });
}

// Largura disponível para o SVG, acompanhando a rotação da tela
function useWidth(fallback = 320) {
    const ref = useRef(null);
    const [width, setWidth] = useState(fallback);
    useLayoutEffect(() => {
        const el = ref.current;
        const measure = () => setWidth(el.clientWidth || fallback);
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

// Passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) para umas `count` divisões do intervalo
function niceStep(range, count) {
    const raw = range / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const n = raw / magnitude;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude;
}

function niceTicks(values) {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
        const pad = Math.max(1, max * 0.1);
        min -= pad;
        max += pad;
    }
    const step = niceStep(max - min, 3);
    const lo = Math.max(0, Math.floor(min / step) * step);
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let i = 0; lo + i * step <= hi + step / 1000; i++) ticks.push(Math.round((lo + i * step) * 100) / 100);
    return ticks;
}

// Linha da carga (ou do volume) ao longo do tempo. Tocar ou arrastar escolhe o treino mostrado
// acima do gráfico; as setas do teclado também.
function LineChart({ points, value, label, selected, onSelect }) {
    const [ref, width] = useWidth();
    const height = 190;
    const ticks = niceTicks(points.map(value));
    const tickText = ticks.map(formatWeight);
    const left = 10 + 7 * Math.max(...tickText.map((t) => t.length));
    const right = 14;
    const top = 12;
    const bottom = 26;
    const plotW = Math.max(40, width - left - right);
    const plotH = height - top - bottom;

    const times = points.map((p) => new Date(p.date).getTime());
    const t0 = times[0];
    const span = times[times.length - 1] - t0;
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const x = (i) => left + (span > 0 ? ((times[i] - t0) / span) * plotW : plotW / 2);
    const y = (v) => top + plotH - ((v - lo) / (hi - lo)) * plotH;

    const coords = points.map((p, i) => [x(i), y(value(p))]);
    const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('');
    const baseline = top + plotH;
    const area = coords.length > 1
        ? `${line}L${coords[coords.length - 1][0].toFixed(1)},${baseline}L${coords[0][0].toFixed(1)},${baseline}Z`
        : '';
    const withYear = new Date(points[0].date).getFullYear() !== new Date(points[points.length - 1].date).getFullYear();
    const sel = coords[selected];

    function pick(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        let best = 0;
        coords.forEach(([cx], i) => { if (Math.abs(cx - px) < Math.abs(coords[best][0] - px)) best = i; });
        if (best !== selected) onSelect(best);
    }

    function onKeyDown(e) {
        if (e.key === 'ArrowLeft' && selected > 0) onSelect(selected - 1);
        else if (e.key === 'ArrowRight' && selected < points.length - 1) onSelect(selected + 1);
        else return;
        e.preventDefault();
    }

    return (
        <div class="chart" ref={ref}>
            <svg
                width={width} height={height} role="img" tabindex="0" aria-label={label}
                onPointerDown={pick} onPointerMove={pick} onKeyDown={onKeyDown}
            >
                {ticks.map((t, i) => (
                    <g key={t}>
                        <line class="chart-grid" x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} />
                        <text class="chart-tick" x={left - 6} y={y(t)} dy="0.32em" text-anchor="end">{tickText[i]}</text>
                    </g>
                ))}
                <text class="chart-tick" x={coords[0][0]} y={height - 6} text-anchor={points.length > 1 ? 'start' : 'middle'}>
                    {shortDate(points[0].date, withYear)}
                </text>
                {points.length > 1 && (
                    <text class="chart-tick" x={left + plotW} y={height - 6} text-anchor="end">
                        {shortDate(points[points.length - 1].date, withYear)}
                    </text>
                )}
                {area && <path class="chart-area" d={area} />}
                {coords.length > 1 && <path class="chart-line" d={line} />}
                <line class="chart-crosshair" x1={sel[0]} x2={sel[0]} y1={top} y2={baseline} />
                {coords.length <= 40 && coords.map(([cx, cy], i) => i !== selected && <circle class="chart-dot" cx={cx} cy={cy} r="4" />)}
                <circle class="chart-dot selected" cx={sel[0]} cy={sel[1]} r="6" />
            </svg>
        </div>
    );
}

// Colunas com os treinos de cada semana; a última é a semana atual
function WeeklyChart({ weeks }) {
    const [ref, width] = useWidth();
    const height = 120;
    const top = 18;
    const bottom = 22;
    const plotH = height - top - bottom;
    const band = width / weeks.length;
    const barW = Math.min(24, band * 0.6);
    const max = Math.max(3, ...weeks.map((w) => w.count));

    return (
        <div class="chart" ref={ref}>
            <svg width={width} height={height} role="img" aria-label="Treinos por semana nas últimas 8 semanas">
                <line class="chart-grid" x1="0" x2={width} y1={top + plotH} y2={top + plotH} />
                {weeks.map((week, i) => {
                    const cx = band * i + band / 2;
                    const h = (week.count / max) * plotH;
                    const r = Math.min(4, h, barW / 2);
                    const x0 = cx - barW / 2;
                    const y0 = top + plotH - h;
                    const current = i === weeks.length - 1;
                    const label = current ? 'esta' : shortDate(week.start);
                    return (
                        <g key={label}>
                            <title>{`Semana de ${shortDate(week.start)}: ${week.count}`}</title>
                            {week.count > 0 && (
                                <>
                                    <path
                                        class="chart-bar"
                                        d={`M${x0},${top + plotH}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + barW - r}Q${x0 + barW},${y0} ${x0 + barW},${y0 + r}V${top + plotH}Z`}
                                    />
                                    <text class="chart-value" x={cx} y={y0 - 5} text-anchor="middle">{week.count}</text>
                                </>
                            )}
                            <text class={'chart-tick' + (current ? ' current' : '')} x={cx} y={height - 6} text-anchor="middle">{label}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function Tile({ label, value, detail }) {
    return (
        <div class="stat-tile">
            <span class="stat-label">{label}</span>
            <strong class="stat-value">{value}</strong>
            {detail && <span class="stat-detail">{detail}</span>}
        </div>
    );
}

function bestSetText(p) {
    return formatKg(p.weight) + (p.reps ? ` × ${formatWeight(p.reps)}` : '');
}

const METRICS = {
    weight: { label: 'Carga', value: (p) => p.weight, text: bestSetText },
    volume: { label: 'Volume', value: (p) => p.volume, text: (p) => formatKg(p.volume) }
};

function ExerciseProgress({ history, exerciseId }) {
    const [metric, setMetric] = useState('weight');
    const [showAll, setShowAll] = useState(false);
    const points = exerciseProgress(history, exerciseId);
    const [selected, setSelected] = useState(points.length - 1);
    if (points.length === 0) return null;
    const current = points[Math.min(selected, points.length - 1)];
    const record = points.reduce((best, p) => (p.weight > best.weight ? p : best));
    const last = points[points.length - 1];
    const { value, text } = METRICS[metric];
    const rows = points.slice().reverse();

    return (
        <>
            <div class="stat-tiles">
                <Tile label="Recorde" value={formatKg(record.weight)} detail={shortDate(record.date, true)} />
                <Tile label="Último" value={bestSetText(last)} detail={shortDate(last.date, true)} />
                <Tile label="Treinos" value={points.length} />
            </div>

            <div class="segmented" role="group" aria-label="O que mostrar no gráfico">
                {Object.entries(METRICS).map(([key, m]) => (
                    <button key={key} type="button" class="seg-btn" aria-pressed={metric === key ? 'true' : 'false'} onClick={() => setMetric(key)}>
                        {m.label}
                    </button>
                ))}
            </div>
            <p class="chart-note">
                {metric === 'weight'
                    ? 'Maior carga de cada treino, só das séries marcadas como feitas.'
                    : 'Soma de carga × reps das séries feitas em cada treino.'}
            </p>

            <p class="chart-readout" aria-live="polite">
                <strong>{text(current)}</strong>
                <span>{shortDate(current.date, true)} · {current.workoutNome}{current.record ? ' · 🏆 recorde' : ''}</span>
            </p>
            <LineChart
                points={points} value={value} selected={Math.min(selected, points.length - 1)} onSelect={setSelected}
                label={`${METRICS[metric].label} ao longo do tempo; os valores estão na tabela abaixo`}
            />

            <table class="progress-table">
                <thead>
                    <tr><th>Data</th><th>Melhor série</th><th>Volume</th></tr>
                </thead>
                <tbody>
                    {(showAll ? rows : rows.slice(0, RECENT_ROWS)).map((p) => (
                        <tr key={p.entryId}>
                            <td>{shortDate(p.date, true)}<span class="progress-table-workout">{p.workoutNome}</span></td>
                            <td>{bestSetText(p)}{p.record && <span title="Recorde"> 🏆</span>}</td>
                            <td>{formatKg(p.volume)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {!showAll && rows.length > RECENT_ROWS && (
                <button type="button" class="link-btn" onClick={() => setShowAll(true)}>Mostrar todos ({rows.length})</button>
            )}
        </>
    );
}

export function ProgressView({ history }) {
    const weeks = weeklyCounts(history);
    const exercises = exercisesWithProgress(history);
    // Começa pelo exercício feito mais recentemente
    const latest = exercises.reduce((a, b) => (!a || new Date(b.lastDate) > new Date(a.lastDate) ? b : a), null);
    const [chosen, setChosen] = useState(latest && latest.exerciseId);
    const exerciseId = exercises.some((ex) => ex.exerciseId === chosen) ? chosen : latest && latest.exerciseId;

    return (
        <>
            <section class="progress-box" id="weekly">
                <h2 class="editor-heading">Frequência semanal</h2>
                <p class="week-count">{weekText(weeks[weeks.length - 1].count)}</p>
                <WeeklyChart weeks={weeks} />
            </section>

            <section class="progress-box" id="exercise-progress">
                <h2 class="editor-heading">Evolução por exercício</h2>
                {exercises.length === 0 ? (
                    <p class="editor-empty">Os gráficos aparecem depois do primeiro treino finalizado com carga nas séries feitas.</p>
                ) : (
                    <>
                        <select
                            class="editor-select" aria-label="Exercício" value={exerciseId}
                            onChange={(e) => setChosen(e.currentTarget.value)}
                        >
                            {exercises.map((ex) => <option value={ex.exerciseId}>{ex.nome}</option>)}
                        </select>
                        <ExerciseProgress key={exerciseId} history={history} exerciseId={exerciseId} />
                    </>
                )}
            </section>
        </>
    );
}

export function ProgressScreen() {
    return (
        <>
            <ScreenHeader title="Gráficos e recordes" onBack={() => goBack('')} />
            <div class="container">
                <ProgressView history={getState().history} />
            </div>
        </>
    );
}

// Na tela do treino, acima do histórico
export function ProgressLink() {
    const [week] = weeklyCounts(getState().history, 1);
    return (
        <button type="button" class="progress-link" onClick={() => navigate('#progresso')}>
            <span class="progress-link-week">{weekText(week.count)}</span>
            <span class="progress-link-action">📈 Gráficos e recordes ›</span>
        </button>
    );
}
