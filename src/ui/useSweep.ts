import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scenario } from '../model/scenario';
import type { Frame, SeriesPoint } from '../model/simulate';
import { startRun, type RunHandle } from '../worker/client';
import type { RunMeta, RunSummary } from '../worker/protocol';
import type { SweepPlan } from './sweep';
import type { RunStatus } from './useSimulation';

export type SweepRunStatus = RunStatus | 'queued';

export interface SweepRunView {
  value: number;
  label: string;
  scenario: Scenario;
  status: SweepRunStatus;
  fraction: number;
  meta: RunMeta | null;
  series: SeriesPoint[];
  frames: Frame[];
  summary: RunSummary | null;
  error: string | null;
}

export interface SweepView {
  status: 'idle' | 'running' | 'done' | 'cancelled';
  /** Label and unit of the swept parameter. */
  paramLabel: string;
  unit?: string;
  /** Base scenario the sweep was started from (to detect later edits). */
  base: Scenario | null;
  runs: SweepRunView[];
  /** Increases whenever any run's series or frames grow. */
  version: number;
}

const RENDER_INTERVAL = 250;
const empty: SweepView = { status: 'idle', paramLabel: '', base: null, runs: [], version: 0 };

/** Runs the scenarios of a sweep in parallel workers (at most `plan.parallel` at once). */
export function useSweep() {
  const [view, setView] = useState<SweepView>(empty);
  const live = useRef<SweepView>(empty);
  const handles = useRef<RunHandle[]>([]);
  const timer = useRef(0);
  const generation = useRef(0);

  const flushNow = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = 0;
    setView(live.current);
  }, []);

  const publish = useCallback(() => {
    live.current = { ...live.current, runs: [...live.current.runs], version: live.current.version + 1 };
    if (!timer.current) {
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        setView(live.current);
      }, RENDER_INTERVAL);
    }
  }, []);

  const stopAll = useCallback(() => {
    generation.current++;
    for (const h of handles.current) h.cancel();
    handles.current = [];
  }, []);

  const run = useCallback(
    (plan: SweepPlan, base: Scenario, paramLabel: string, unit?: string) => {
      stopAll();
      const gen = generation.current;
      const runs: SweepRunView[] = plan.runs.map((r) => ({
        value: r.value,
        label: r.label,
        scenario: r.scenario,
        status: 'queued',
        fraction: 0,
        meta: null,
        series: [],
        frames: [],
        summary: null,
        error: null,
      }));
      live.current = { status: 'running', paramLabel, unit, base: structuredClone(base), runs, version: 0 };
      setView(live.current);

      const patch = (k: number, p: Partial<SweepRunView>) => {
        if (gen !== generation.current) return;
        live.current.runs[k] = { ...live.current.runs[k], ...p };
        publish();
      };
      let next = 0;
      const startNext = () => {
        if (gen !== generation.current) return;
        if (next >= runs.length) {
          if (live.current.runs.every((r) => r.status !== 'running' && r.status !== 'queued')) {
            live.current = { ...live.current, status: 'done', version: live.current.version + 1 };
            flushNow();
          }
          return;
        }
        const k = next++;
        const series = live.current.runs[k].series;
        const frames = live.current.runs[k].frames;
        patch(k, { status: 'running' });
        const finished = (p: Partial<SweepRunView>) => {
          patch(k, p);
          startNext();
        };
        handles.current.push(
          startRun(runs[k].scenario, {
            onMeta: (meta) => patch(k, { meta }),
            onProgress: (fraction, points) => {
              for (const pt of points) series.push(pt);
              patch(k, { fraction });
            },
            onFrame: (f) => {
              frames.push(f);
              patch(k, {});
            },
            onDone: (summary) => finished({ status: 'done', fraction: 1, summary }),
            onError: (message, issues) =>
              finished({ status: 'error', error: issues?.length ? `${message} ${issues.map((i) => i.message).join(' ')}` : message }),
          }),
        );
      };
      for (let i = 0; i < plan.parallel; i++) startNext();
    },
    [publish, flushNow, stopAll],
  );

  const cancel = useCallback(() => {
    stopAll();
    live.current = {
      ...live.current,
      status: 'cancelled',
      runs: live.current.runs.map((r) => (r.status === 'running' || r.status === 'queued' ? { ...r, status: 'cancelled' } : r)),
      version: live.current.version + 1,
    };
    flushNow();
  }, [stopAll, flushNow]);

  useEffect(
    () => () => {
      stopAll();
      clearTimeout(timer.current);
    },
    [stopAll],
  );

  return { view, run, cancel };
}
