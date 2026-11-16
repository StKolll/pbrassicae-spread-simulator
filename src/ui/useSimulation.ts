import { useCallback, useEffect, useRef, useState } from 'react';
import type { Issue } from '../model/limits';
import type { Scenario } from '../model/scenario';
import type { Frame, SeriesPoint } from '../model/simulate';
import { startRun, type RunHandle } from '../worker/client';
import type { RunMeta, RunSummary } from '../worker/protocol';

export type RunStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

export interface RunView {
  status: RunStatus;
  fraction: number;
  /** The scenario this run was started with (to detect later edits). */
  scenario: Scenario | null;
  meta: RunMeta | null;
  series: SeriesPoint[];
  frames: Frame[];
  summary: RunSummary | null;
  error: { message: string; issues?: Issue[] } | null;
  /** Increases whenever series or frames grow (arrays are appended in place). */
  version: number;
}

/** Minimum time between re-renders while a run streams [ms]. */
const RENDER_INTERVAL = 250;

const empty: RunView = {
  status: 'idle',
  fraction: 0,
  scenario: null,
  meta: null,
  series: [],
  frames: [],
  summary: null,
  error: null,
  version: 0,
};

/**
 * Runs scenarios in a worker and collects the streamed results. Series points and frames are
 * appended to arrays held in a ref; React re-renders at most every RENDER_INTERVAL ms while a run streams.
 */
export function useSimulation() {
  const [view, setView] = useState<RunView>(empty);
  const handle = useRef<RunHandle | null>(null);
  const live = useRef<RunView>(empty);
  const timer = useRef(0);

  const publish = useCallback((patch?: Partial<RunView>) => {
    live.current = { ...live.current, ...patch, version: live.current.version + 1 };
    if (patch && patch.status && patch.status !== 'running') {
      clearTimeout(timer.current);
      timer.current = 0;
      setView(live.current);
      return;
    }
    // While running, redraw at most every RENDER_INTERVAL ms: Plotly redraws on the main
    // thread compete with the worker for CPU time (measured: up to 2× slower runs).
    if (!timer.current) {
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        setView(live.current);
      }, RENDER_INTERVAL);
    }
  }, []);

  const run = useCallback(
    (scenario: Scenario) => {
      handle.current?.cancel();
      const series: SeriesPoint[] = [];
      const frames: Frame[] = [];
      live.current = { ...empty, status: 'running', scenario: structuredClone(scenario), series, frames };
      setView(live.current);
      handle.current = startRun(scenario, {
        onMeta: (meta) => publish({ meta }),
        onProgress: (fraction, points) => {
          for (const p of points) series.push(p);
          publish({ fraction });
        },
        onFrame: (f) => {
          frames.push(f);
          publish();
        },
        onDone: (summary) => publish({ status: 'done', fraction: 1, summary }),
        onError: (message, issues) => publish({ status: 'error', error: { message, issues } }),
        onCancel: () => publish({ status: 'cancelled' }),
      });
    },
    [publish],
  );

  const cancel = useCallback(() => handle.current?.cancel(), []);
  const clear = useCallback(() => {
    handle.current?.cancel();
    live.current = empty;
    setView(empty);
  }, []);

  useEffect(
    () => () => {
      handle.current?.cancel();
      clearTimeout(timer.current);
    },
    [],
  );

  return { view, run, cancel, clear };
}
