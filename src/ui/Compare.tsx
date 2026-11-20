import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtTime } from '../model/limits';
import type { Scenario } from '../model/scenario';
import type { Frame } from '../model/simulate';
import { NumberInput } from './controls';
import { CompareSeries, type CompareLine } from './plot/CompareSeries';
import { FieldCanvas } from './plot/FieldCanvas';
import type { ColorSettings } from './plot/FieldView';
import { Timeline, seasonBands, type SeasonBand } from './plot/Timeline';
import { MAX_SWEEP_VALUES, SWEEP_PARAMS, formatValues, parseValues, planSweep, suggestValues, sweepColors, sweepParam } from './sweep';
import { fmtNum, useChartTheme } from './theme';
import { sameSettings } from './userPresets';
import type { SweepRunView, SweepView } from './useSweep';

export interface SweepSetup {
  paramId: string;
  valuesText: string;
}

export function initialSweepSetup(sc: Scenario): SweepSetup {
  const p = SWEEP_PARAMS[0];
  return { paramId: p.id, valuesText: formatValues(suggestValues(p, p.get(sc))) };
}

interface Props {
  sc: Scenario;
  setup: SweepSetup;
  setSetup: (s: SweepSetup) => void;
  view: SweepView;
  onRun: (plan: ReturnType<typeof planSweep>, paramLabel: string, unit?: string) => void;
  onCancel: () => void;
}

const SPEEDS = [4, 8, 15, 30];

/** Parameter sweep: run the current settings with several values of one parameter and compare. */
export function Compare({ sc, setup, setSetup, view, onRun, onCancel }: Props) {
  const param = sweepParam(setup.paramId);
  const unavailable = param.unavailable?.(sc) ?? null;
  const parsed = useMemo(() => parseValues(setup.valuesText, param), [setup.valuesText, param]);
  const plan = useMemo(() => (parsed.error || unavailable ? null : planSweep(sc, param, parsed.values)), [sc, param, parsed, unavailable]);
  const [confirming, setConfirming] = useState(false);
  const running = view.status === 'running';
  const stale = !!view.base && !sameSettings(view.base, sc);

  const start = () => {
    if (!plan || plan.errors.length) return;
    if (plan.warnings.length && !confirming) return setConfirming(true);
    setConfirming(false);
    onRun(plan, param.label, param.unit);
  };

  return (
    <div className="results compare">
      <section className="sweep-setup" aria-label="Comparison settings">
        <p className="muted">
          Runs the current settings from the sidebar several times, each with a different value of one parameter. Everything else stays the same.
        </p>
        <div className="sweep-row">
          <label>
            Parameter{' '}
            <select
              value={param.id}
              onChange={(e) => {
                const p = sweepParam(e.target.value);
                setSetup({ paramId: p.id, valuesText: formatValues(suggestValues(p, p.get(sc))) });
                setConfirming(false);
              }}
            >
              {SWEEP_PARAMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.unit && p.unit !== 'fraction' ? ` [${p.unit}]` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="sweep-values">
            Values{' '}
            <input
              type="text"
              value={setup.valuesText}
              aria-describedby="sweep-values-hint"
              onChange={(e) => {
                setSetup({ ...setup, valuesText: e.target.value });
                setConfirming(false);
              }}
            />
          </label>
          <button type="button" title="Values around the current setting" onClick={() => setSetup({ ...setup, valuesText: formatValues(suggestValues(param, param.get(sc))) })}>
            Suggest
          </button>
        </div>
        <p id="sweep-values-hint" className="hint">
          2–{MAX_SWEEP_VALUES} values separated by commas, e.g. 0.003, 0.01, 0.03. Current setting: {fmtNum(param.get(sc), 3)}
          {param.unit && param.unit !== 'fraction' ? ` ${param.unit}` : ''}.
        </p>

        {unavailable && <p className="sweep-msg error">{unavailable}</p>}
        {!unavailable && parsed.error && <p className="sweep-msg error">{parsed.error}</p>}
        {plan && (
          <>
            <p className="sweep-msg">
              {plan.runs.length} runs, {plan.parallel} at a time · estimated ~{fmtTime(plan.seconds)}
            </p>
            {(plan.errors.length > 0 || plan.warnings.length > 0) && (
              <ul className="issues">
                {plan.errors.map((i, k) => (
                  <li key={`e${k}`} className="error">
                    <b>Error:</b> {i.message}
                  </li>
                ))}
                {plan.warnings.map((i, k) => (
                  <li key={`w${k}`} className="warning">
                    <b>Warning:</b> {i.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="run-row">
          {running ? (
            <button type="button" onClick={onCancel}>
              Cancel comparison
            </button>
          ) : confirming && plan ? (
            <>
              <span>Run despite {plan.warnings.length === 1 ? 'the warning' : `${plan.warnings.length} warnings`}?</span>
              <button type="button" className="primary" onClick={start}>
                Run
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Back
              </button>
            </>
          ) : (
            <button type="button" className="primary" disabled={!plan || plan.errors.length > 0} onClick={start}>
              Run comparison
            </button>
          )}
        </div>
      </section>

      {view.status !== 'idle' && <SweepResults view={view} stale={stale} />}
    </div>
  );
}

/** Last frame at or before `week`, or undefined. */
function frameAt(frames: Frame[], week: number): Frame | undefined {
  let f: Frame | undefined;
  for (const fr of frames) {
    if (fr.week > week) break;
    f = fr;
  }
  return f;
}

function SweepResults({ view, stale }: { view: SweepView; stale: boolean }) {
  const theme = useChartTheme();
  const { runs } = view;
  const [color, setColor] = useState<ColorSettings>({ log: false, maxFactor: 2, showPlants: true });
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);

  // A new sweep starts in follow mode.
  const [base, setBase] = useState(view.base);
  if (base !== view.base) {
    setBase(view.base);
    setSel(null);
    setPlaying(false);
  }

  // All runs share the same snapshot weeks; the run furthest along is the reference.
  const ref = runs.reduce<SweepRunView | undefined>((a, r) => (!a || r.frames.length > a.frames.length ? r : a), undefined);
  const refFrames = ref?.frames ?? [];
  const last = refFrames.length - 1;
  const index = sel === null ? last : Math.min(sel, last);
  const week = refFrames[index]?.week ?? 0;

  const pos = useRef({ index, last });
  useEffect(() => {
    pos.current = { index, last };
  });
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const { index, last } = pos.current;
      if (index >= last) setPlaying(false);
      else setSel(index + 1);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  const metaRun = runs.find((r) => r.meta);
  const runMeta = metaRun?.meta ?? null;
  const runScenario = metaRun?.scenario ?? null;
  const bands = useMemo(() => (runMeta && runScenario ? seasonBands(runMeta.calendar, runScenario) : []), [runMeta, runScenario]);
  const totalWeeks = runMeta?.calendar.length ?? 0;
  const frameWeeks = useMemo(() => refFrames.map((f) => f.week), [refFrames, view.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const dark = theme.dark;
  const colors = sweepColors(runs.length, dark);
  const unit = view.unit && view.unit !== 'fraction' ? ` ${view.unit}` : '';
  // `runs` is a new array whenever a run streams new data, so the charts update with it.
  const lines: CompareLine[] = useMemo(() => {
    const c = sweepColors(runs.length, dark);
    return runs.map((r, k) => ({ name: `${r.label}${unit}`, color: c[k], series: r.series }));
  }, [runs, dark, unit]);
  const thresholds = new Set(runs.map((r) => r.scenario.biology.threshold));
  const commonThreshold = thresholds.size === 1 ? [...thresholds][0] : null;

  const seekWeek = (w: number) => {
    let k = 0;
    while (k + 1 < refFrames.length && refFrames[k + 1].week <= w) k++;
    setSel(k);
    setPlaying(false);
  };
  const done = runs.filter((r) => r.status === 'done').length;

  return (
    <>
      <div className={`status ${view.status}`} role="status">
        {view.status === 'running' && (
          <span>
            Running… {done} of {runs.length} finished
          </span>
        )}
        {view.status === 'done' && <span>Comparison of {view.paramLabel} finished.</span>}
        {view.status === 'cancelled' && <span>Cancelled. The weeks computed so far are shown.</span>}
        {stale && view.status !== 'running' && <span className="stale">Settings changed since this comparison. Run it again to update.</span>}
      </div>

      <div className="toolbar" role="toolbar" aria-label="Map options">
        <label>
          <input type="checkbox" checked={color.log} onChange={(e) => setColor({ ...color, log: e.target.checked })} /> log scale
        </label>
        {!color.log && (
          <label>
            scale up to <NumberInput ariaLabel="Colour scale maximum" value={color.maxFactor} width="3.5em" onChange={(v) => v > 0 && setColor({ ...color, maxFactor: v })} /> × c*
          </label>
        )}
        <label>
          <input type="checkbox" checked={color.showPlants} onChange={(e) => setColor({ ...color, showPlants: e.target.checked })} /> plants
        </label>
        <span className="muted">All maps use the same colour scale.</span>
      </div>

      <h3 className="compare-heading">{view.paramLabel}</h3>
      <div className="compare-maps">
        {runs.map((r, k) => {
          const f = frameAt(r.frames, week);
          return (
            <figure key={k} className="compare-map">
              <figcaption>
                <span className="swatch-line" style={{ background: colors[k] }} aria-hidden />
                <b>
                  {r.label}
                  {unit}
                </b>
                <span className="muted"> · {runStatusText(r)}</span>
              </figcaption>
              {r.meta && f ? (
                <FieldCanvas meta={r.meta} frame={f} threshold={r.scenario.biology.threshold} color={color} theme={theme} compact />
              ) : (
                <div className="field-plot plot-placeholder">{r.status === 'error' ? r.error : r.status === 'queued' ? 'Waiting for a free worker…' : 'Starting…'}</div>
              )}
            </figure>
          );
        })}
      </div>

      {refFrames.length > 0 && (
        <>
          <div className="playback">
            <button type="button" className="icon" aria-label="First week" title="First week" onClick={() => (setSel(0), setPlaying(false))}>
              ⏮
            </button>
            <button type="button" className="icon" aria-label="Previous snapshot" title="Previous snapshot" onClick={() => (setSel(Math.max(0, index - 1)), setPlaying(false))}>
              ◀
            </button>
            <button
              type="button"
              className="icon play"
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause' : 'Play'}
              onClick={() => {
                if (!playing && index >= last) setSel(0);
                else if (!playing) setSel(index);
                setPlaying(!playing);
              }}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button type="button" className="icon" aria-label="Next snapshot" title="Next snapshot" onClick={() => (setSel(Math.min(last, index + 1)), setPlaying(false))}>
              ▶|
            </button>
            <button type="button" className="icon" aria-label="Latest week" title="Latest week (follow the runs)" onClick={() => (setSel(null), setPlaying(false))}>
              ⏭
            </button>
            <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} frames/s
                </option>
              ))}
            </select>
            <span className="frame-info">
              <b>Week {week}</b> · year {Math.floor(Math.max(week - 1, 0) / 52) + 1}
            </span>
          </div>
          <Timeline
            bands={bands}
            totalWeeks={totalWeeks}
            week={week}
            availableWeek={refFrames.at(-1)?.week ?? 0}
            frameWeeks={frameWeeks}
            frameIndex={index}
            onSeek={(k) => (setSel(k), setPlaying(false))}
          />
          <CompareSeries
            lines={lines}
            version={view.version}
            bands={bands}
            totalWeeks={totalWeeks}
            week={week}
            threshold={commonThreshold}
            theme={theme}
            onSeekWeek={seekWeek}
          />
          <SummaryTable view={view} bands={bands} colors={colors} unit={unit} />
        </>
      )}
    </>
  );
}

function runStatusText(r: SweepRunView): string {
  switch (r.status) {
    case 'queued':
      return 'waiting';
    case 'running':
      return `${Math.round(r.fraction * 100)} %`;
    case 'done':
      return r.summary ? `done in ${fmtTime(r.summary.seconds)}` : 'done';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'error';
    default:
      return '';
  }
}

/** Per value: diseased plants at the peak of each host season, and spores at the end. */
function SummaryTable({ view, bands, colors, unit }: { view: SweepView; bands: SeasonBand[]; colors: string[]; unit: string }) {
  const hostBands = bands.filter((b) => b.host);
  const peak = (r: SweepRunView, b: SeasonBand) => {
    let m: number | null = null;
    for (const p of r.series) if (p.week > b.start && p.week <= b.end) m = Math.max(m ?? 0, p.diseased);
    return m;
  };
  return (
    <div className="compare-table-wrap">
      <table className="compare-table">
        <caption>Diseased plants at the peak of each host season, and spores left at the end</caption>
        <thead>
          <tr>
            <th scope="col">{view.paramLabel}</th>
            {hostBands.map((b) => (
              <th key={b.index} scope="col" title={b.crop}>
                Season {b.index + 1}
              </th>
            ))}
            <th scope="col">Spores at end</th>
          </tr>
        </thead>
        <tbody>
          {view.runs.map((r, k) => {
            const end = r.series.at(-1);
            return (
              <tr key={k}>
                <th scope="row">
                  <span className="swatch-line" style={{ background: colors[k] }} aria-hidden />
                  {r.label}
                  {unit}
                </th>
                {hostBands.map((b) => {
                  const v = peak(r, b);
                  return <td key={b.index}>{v === null ? '–' : `${v.toLocaleString('en')} / ${r.series.find((p) => p.week > b.start)?.planted.toLocaleString('en') ?? '?'}`}</td>;
                })}
                <td>{end && r.status === 'done' ? fmtNum(end.totalSpores, 3) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
