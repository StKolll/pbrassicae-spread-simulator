import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fmtTime } from '../model/limits';
import type { Scenario } from '../model/scenario';
import type { Frame } from '../model/simulate';
import { NumberInput } from './controls';
import {
  GROUP_PARAMS,
  GROUP_SECTIONS,
  MAX_GROUPS,
  addGroup,
  groupColors,
  groupCount,
  groupLetter,
  groupScenarios,
  groupValue,
  planGroups,
  removeGroup,
  setGroupValue,
  setSame,
  type CompareSetup,
  type GroupParam,
  type GroupPlan,
  type GroupValue,
} from './groups';
import { CompareSeries, type CompareLine } from './plot/CompareSeries';
import { FieldCanvas } from './plot/FieldCanvas';
import type { ColorSettings } from './plot/FieldView';
import { Timeline, seasonBands, type SeasonBand } from './plot/Timeline';
import { edit } from './scenarioEdit';
import { fmtNum, useChartTheme } from './theme';
import type { CompareView, GroupRunView } from './useCompareRuns';
import { sameSettings } from './userPresets';

interface Props {
  sc: Scenario;
  setSc: (sc: Scenario) => void;
  setup: CompareSetup;
  setSetup: (s: CompareSetup) => void;
  view: CompareView;
  onRun: (plan: GroupPlan) => void;
  onCancel: () => void;
}

const SPEEDS = [4, 8, 15, 30];

/** Compare groups: group A is the sidebar scenario, the other groups change some of its parameters. */
export function Compare({ sc, setSc, setup, setSetup, view, onRun, onCancel }: Props) {
  const plan = useMemo(() => planGroups(sc, setup), [sc, setup]);
  const [confirming, setConfirming] = useState(false);
  const running = view.status === 'running';
  const stale =
    view.runs.length > 0 && (plan.runs.length !== view.runs.length || plan.runs.some((r, k) => !sameSettings(r.scenario, view.runs[k].scenario)));

  const update = (s: CompareSetup) => {
    setSetup(s);
    setConfirming(false);
  };
  const start = () => {
    if (plan.errors.length) return;
    if (plan.warnings.length && !confirming) return setConfirming(true);
    setConfirming(false);
    onRun(plan);
  };

  return (
    <div className="results compare">
      <section className="group-setup" aria-label="Comparison groups">
        <p className="muted">
          Group A uses the settings from the sidebar. Untick <b>Same along groups</b> for each parameter that should differ, then enter its value per group.
          Field, grid, numerics, crop calendars and the crop rotation are the same for all groups.
        </p>
        <GroupTable
          sc={sc}
          setSc={(s) => {
            setSc(s);
            setConfirming(false);
          }}
          setup={setup}
          setSetup={update}
          disabled={running}
        />

        {plan.errors.length === 0 && (
          <p className="sweep-msg">
            {plan.runs.length} runs, {plan.parallel} at a time · estimated ~{fmtTime(plan.seconds)}
          </p>
        )}
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
        <div className="run-row">
          {running ? (
            <button type="button" onClick={onCancel}>
              Cancel comparison
            </button>
          ) : confirming ? (
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
            <button type="button" className="primary" disabled={plan.errors.length > 0} onClick={start}>
              Run comparison
            </button>
          )}
        </div>
      </section>

      {view.status !== 'idle' && <GroupResults view={view} stale={stale} />}
    </div>
  );
}

/** Text shown for the unit of a parameter in the table. */
const unitText = (p: GroupParam) => (p.unit === 'fraction' ? '0–1' : p.unit);

function GroupTable({
  sc,
  setSc,
  setup,
  setSetup,
  disabled,
}: {
  sc: Scenario;
  setSc: (sc: Scenario) => void;
  setup: CompareSetup;
  setSetup: (s: CompareSetup) => void;
  disabled: boolean;
}) {
  const theme = useChartTheme();
  const n = groupCount(setup);
  const colors = groupColors(n, theme.dark);
  const scenarios = useMemo(() => groupScenarios(sc, setup), [sc, setup]);
  const change = (k: number, p: GroupParam, v: GroupValue) => (k === 0 ? setSc(edit(sc, (d) => p.set(d, v))) : setSetup(setGroupValue(setup, k, p.id, v)));

  return (
    <div className="group-table-wrap">
      <table className="group-table">
        <thead>
          <tr>
            <th scope="col" className="param-col">
              Parameter
            </th>
            <th scope="col" className="same-col">
              Same along groups
            </th>
            {scenarios.map((_, k) => (
              <th key={k} scope="col" className="group-head" style={{ '--group-color': colors[k] } as CSSProperties}>
                <div className="group-head-inner">
                  <span className={k === 3 ? 'group-badge dark-ink' : 'group-badge'} aria-hidden>
                    {groupLetter(k)}
                  </span>
                  <span className="group-name">
                    Group {groupLetter(k)}
                    {k === 0 && <span className="muted"> sidebar</span>}
                  </span>
                  {k > 0 && (
                    <button
                      type="button"
                      className="icon"
                      aria-label={`Remove group ${groupLetter(k)}`}
                      title={n <= 2 ? 'At least two groups are needed' : `Remove group ${groupLetter(k)}`}
                      disabled={disabled || n <= 2}
                      onClick={() => setSetup(removeGroup(setup, k))}
                    >
                      ×
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th scope="col" className="add-col">
              {n < MAX_GROUPS && (
                <button type="button" className="add-group" aria-label="Add group" title="Add a group (a copy of the last one)" disabled={disabled} onClick={() => setSetup(addGroup(setup, sc))}>
                  +
                </button>
              )}
            </th>
          </tr>
        </thead>
        {GROUP_SECTIONS.map((section) => (
          <tbody key={section}>
            <tr className="section-row">
              <th scope="rowgroup" colSpan={n + 3}>
                {section}
              </th>
            </tr>
            {GROUP_PARAMS.filter((p) => p.section === section).map((p) => {
              const same = !setup.varying.includes(p.id);
              const unit = unitText(p);
              return (
                <tr key={p.id} className={same ? 'same' : 'varying'}>
                  <th scope="row">
                    {p.label}
                    {unit && <span className="unit"> [{unit}]</span>}
                  </th>
                  <td className="same-col">
                    <input
                      type="checkbox"
                      checked={same}
                      disabled={disabled}
                      aria-label={`${p.label}: same along groups`}
                      onChange={(e) => setSetup(setSame(setup, sc, p.id, e.target.checked))}
                    />
                  </td>
                  {scenarios.map((g, k) => {
                    const inactive = p.inactive?.(g) ?? false;
                    return (
                      <td key={k} title={inactive ? 'No effect with the water flow of this group' : same ? 'Same for all groups (set it in the sidebar)' : undefined}>
                        <GroupCell
                          p={p}
                          value={groupValue(setup, sc, k, p)}
                          disabled={disabled || same || inactive}
                          label={`${p.label}, group ${groupLetter(k)}`}
                          onChange={(v) => change(k, p, v)}
                        />
                      </td>
                    );
                  })}
                  <td className="add-col" />
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function GroupCell({ p, value, disabled, label, onChange }: { p: GroupParam; value: GroupValue; disabled: boolean; label: string; onChange: (v: GroupValue) => void }) {
  if (p.kind === 'choice') {
    return (
      <select aria-label={label} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return <NumberInput ariaLabel={label} value={Number(value)} integer={p.integer} disabled={disabled} width="100%" onChange={onChange} />;
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

function GroupResults({ view, stale }: { view: CompareView; stale: boolean }) {
  const theme = useChartTheme();
  const { runs } = view;
  const [color, setColor] = useState<ColorSettings>({ log: false, maxFactor: 2, showPlants: true });
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);

  // A new comparison starts in follow mode.
  const firstScenario = runs[0]?.scenario;
  const [started, setStarted] = useState(firstScenario);
  if (started !== firstScenario) {
    setStarted(firstScenario);
    setSel(null);
    setPlaying(false);
  }

  // All runs share the same snapshot weeks; the run furthest along is the reference.
  const ref = runs.reduce<GroupRunView | undefined>((a, r) => (!a || r.frames.length > a.frames.length ? r : a), undefined);
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
  const colors = groupColors(runs.length, dark);
  // `runs` is a new array whenever a run streams new data, so the charts update with it.
  const lines: CompareLine[] = useMemo(() => {
    const c = groupColors(runs.length, dark);
    return runs.map((r, k) => ({ name: `Group ${r.label}`, color: c[k], series: r.series }));
  }, [runs, dark]);
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
        {view.status === 'done' && <span>Comparison finished.</span>}
        {view.status === 'cancelled' && <span>Cancelled. The weeks computed so far are shown.</span>}
        {stale && view.status !== 'running' && <span className="stale">Settings changed since this comparison. Run it again to update.</span>}
      </div>

      <div className="toolbar" role="toolbar" aria-label="Map options">
        <label title="Logarithmic colour scale: shows low concentrations far below c* as well">
          <input type="checkbox" checked={color.log} onChange={(e) => setColor({ ...color, log: e.target.checked })} /> log scale
        </label>
        {!color.log && (
          <label title="Upper end of the colour scale; higher concentrations get the darkest colour">
            scale up to <NumberInput ariaLabel="Colour scale maximum" value={color.maxFactor} width="3.5em" onChange={(v) => v > 0 && setColor({ ...color, maxFactor: v })} /> × c*
          </label>
        )}
        <label>
          <input type="checkbox" checked={color.showPlants} onChange={(e) => setColor({ ...color, showPlants: e.target.checked })} /> plants
        </label>
        <span className="muted">All maps use the same colour scale.</span>
      </div>

      <div className="compare-maps">
        {runs.map((r, k) => {
          const f = frameAt(r.frames, week);
          return (
            <figure key={k} className="compare-map">
              <figcaption>
                <span className="swatch-line" style={{ background: colors[k] }} aria-hidden />
                <b>Group {r.label}</b>
                <span className="muted"> · {runStatusText(r)}</span>
                {r.description && <span className="group-desc">{r.description}</span>}
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
          <SummaryTable view={view} bands={bands} colors={colors} />
        </>
      )}
    </>
  );
}

function runStatusText(r: GroupRunView): string {
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

/** Per group: diseased plants at the peak of each host season, and spores at the end. */
function SummaryTable({ view, bands, colors }: { view: CompareView; bands: SeasonBand[]; colors: string[] }) {
  const hostBands = bands.filter((b) => b.host);
  const peak = (r: GroupRunView, b: SeasonBand) => {
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
            <th scope="col">Group</th>
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
                  {r.description && <span className="group-desc">{r.description}</span>}
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
