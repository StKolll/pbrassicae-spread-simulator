import { useEffect, useMemo, useRef, useState } from 'react';
import { MONTH_NAMES } from '../model/calendar';
import { fmtTime } from '../model/limits';
import { FieldCanvas } from './plot/FieldCanvas';
import { FieldView, type ColorSettings, type FieldMode } from './plot/FieldView';
import { TimeSeries } from './plot/TimeSeries';
import { Timeline, seasonBands } from './plot/Timeline';
import { NumberInput } from './controls';
import { fmtNum, useChartTheme } from './theme';
import type { RunView } from './useSimulation';

const SPEEDS = [4, 8, 15, 30];

/** Everything about one run: status, field view with playback, timeline and time series. */
export function Results({ run, stale }: { run: RunView; stale: boolean }) {
  const theme = useChartTheme();
  const { meta, frames, series, scenario } = run;
  const [mode, setMode] = useState<FieldMode>('heatmap');
  const [color, setColor] = useState<ColorSettings>({ log: false, maxFactor: 2, showPlants: true });
  /** Selected frame; null = follow the newest frame. */
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);

  // A new run starts in follow mode.
  const [runScenario, setRunScenario] = useState(scenario);
  if (runScenario !== scenario) {
    setRunScenario(scenario);
    setSel(null);
    setPlaying(false);
  }

  const last = frames.length - 1;
  const index = sel === null ? last : Math.min(sel, last);
  const frame = frames[index];

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

  const bands = useMemo(() => (meta && scenario ? seasonBands(meta.calendar, scenario) : []), [meta, scenario]);
  const frameWeeks = useMemo(() => frames.map((f) => f.week), [frames, run.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Redrawing the three charts is slow; during playback their cursor moves ~3 times per second.
  const chartWeek = useThrottled(frame?.week ?? 0, playing ? 300 : 0);

  if (!scenario) return null;
  const threshold = scenario.biology.threshold;
  const totalWeeks = meta?.calendar.length ?? 0;
  const week = frame?.week ?? 0;
  const point = week > 0 ? series[week - 1] : undefined;
  const cal = meta?.calendar[Math.min(Math.max(week - 1, 0), totalWeeks - 1)];

  const seekWeek = (w: number) => {
    let k = 0;
    while (k + 1 < frames.length && frames[k + 1].week <= w) k++;
    setSel(k);
    setPlaying(false);
  };

  return (
    <div className="results">
      <StatusLine run={run} stale={stale} />
      {meta && frame && (
        <>
          <div className="toolbar" role="toolbar" aria-label="Field view options">
            <div className="segmented" role="group" aria-label="View">
              <button type="button" aria-pressed={mode === 'heatmap'} onClick={() => setMode('heatmap')}>
                Map
              </button>
              <button type="button" aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
                3D
              </button>
            </div>
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
            <span className="muted">dotted line: threshold c* = {fmtNum(threshold)} spores/g</span>
          </div>

          {mode === 'heatmap' ? (
            <FieldCanvas meta={meta} frame={frame} threshold={threshold} color={color} theme={theme} />
          ) : (
            <FieldView meta={meta} frame={frame} threshold={threshold} mode={mode} color={color} theme={theme} />
          )}

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
            <button type="button" className="icon" aria-label="Latest week" title="Latest week (follow the run)" onClick={() => (setSel(null), setPlaying(false))}>
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
              <b>Week {week}</b>
              {cal && (
                <>
                  {' '}
                  · year {Math.floor(Math.max(week - 1, 0) / 52) + 1}, {MONTH_NAMES[cal.month]} · season {cal.seasonIndex + 1}: {cal.crop} ({cal.phase})
                </>
              )}
            </span>
          </div>
          {point && (
            <div className="frame-stats">
              <Stat label="healthy" value={point.healthy} swatch={theme.healthy} shape="●" />
              <Stat label="infected" value={point.infected} swatch={theme.infected} shape="◆" />
              <Stat label="burst this season" value={point.burst} swatch={theme.burst} shape="✕" />
              <Stat label="max p" value={`${fmtNum(point.maxP)} spores/g`} />
              <Stat label="min p" value={fmtNum(point.minP)} title="Small negative values are numerical undershoots near bursts." />
              <Stat label="spores in field" value={fmtNum(point.totalSpores)} />
            </div>
          )}

          <Timeline
            bands={bands}
            totalWeeks={totalWeeks}
            week={week}
            availableWeek={frames.at(-1)?.week ?? 0}
            frameWeeks={frameWeeks}
            frameIndex={index}
            onSeek={(k) => (setSel(k), setPlaying(false))}
          />

          <TimeSeries
            series={series}
            version={run.version}
            bands={bands}
            totalWeeks={totalWeeks}
            week={chartWeek}
            threshold={threshold}
            theme={theme}
            onSeekWeek={seekWeek}
          />
        </>
      )}
    </div>
  );
}

/** `value`, but updated at most every `ms` milliseconds (immediately when ms = 0). */
function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    const wait = ms === 0 ? 0 : Math.max(0, last.current + ms - performance.now());
    const id = setTimeout(() => {
      last.current = performance.now();
      setShown(value);
    }, wait);
    return () => clearTimeout(id);
  }, [value, ms]);
  return ms === 0 ? value : shown;
}

function Stat({ label, value, swatch, shape, title }: { label: string; value: number | string; swatch?: string; shape?: string; title?: string }) {
  return (
    <div className="stat" title={title}>
      <span className="stat-label">
        {swatch && (
          <span className="swatch" style={{ color: swatch }} aria-hidden>
            {shape}
          </span>
        )}
        {label}
      </span>
      <span className="stat-value">{typeof value === 'number' ? value.toLocaleString('en') : value}</span>
    </div>
  );
}

function StatusLine({ run, stale }: { run: RunView; stale: boolean }) {
  const { status, summary, error, fraction } = run;
  return (
    <div className={`status ${status}`} role="status">
      {status === 'running' && <span>Running… {Math.round(fraction * 100)} %</span>}
      {status === 'done' && summary && <span>Finished in {fmtTime(summary.seconds)}.</span>}
      {status === 'cancelled' && <span>Cancelled. The weeks computed so far are shown.</span>}
      {status === 'error' && error && (
        <span>
          <b>Error:</b> {error.message}
          {error.issues?.length ? (
            <ul>
              {error.issues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          ) : null}
        </span>
      )}
      {stale && status !== 'running' && <span className="stale">Parameters changed since this run. Run again to update the results.</span>}
    </div>
  );
}
