import { assess, type CostEstimate, type Issue } from '../model/limits';
import type { Scenario } from '../model/scenario';
import { simulate, type Frame, type SeriesPoint, type SimResult } from '../model/simulate';
import type { MonthPhase } from '../model/types';

/** Messages main thread → worker. */
export type ToWorker = { type: 'start'; runId: number; scenario: Scenario };

export interface CalendarWeek {
  month: number;
  seasonIndex: number;
  crop: string;
  phase: MonthPhase;
  hostGrowth: boolean;
}

export interface RunMeta {
  grid: SimResult['grid'];
  plants: SimResult['plants'];
  calendar: CalendarWeek[];
  cost: CostEstimate;
  issues: Issue[];
}

export interface RunSummary {
  budget: SimResult['budget'];
  factorizations: number;
  seconds: number;
}

/** Messages worker → main thread. */
export type FromWorker =
  | ({ type: 'meta'; runId: number } & RunMeta)
  | { type: 'progress'; runId: number; fraction: number; points: SeriesPoint[] }
  | { type: 'frame'; runId: number; frame: Frame }
  | ({ type: 'done'; runId: number } & RunSummary)
  | { type: 'error'; runId: number; message: string; issues?: Issue[] };

export type Post = (msg: FromWorker, transfer?: Transferable[]) => void;

/** Minimum time between progress messages [ms]. */
const PROGRESS_INTERVAL = 100;

/**
 * Validate and run one scenario, streaming results through `post`:
 * meta → (frame | progress)* → done, or a single error.
 * Runs synchronously. Cancelling means terminating the worker; the main thread keeps
 * everything it has received so far.
 */
export function runScenario(
  runId: number,
  scenario: Scenario,
  post: Post,
  now: () => number = () => performance.now(),
): void {
  const t0 = now();
  const a = assess(scenario);
  if (!a.ok || !a.cost) {
    post({
      type: 'error',
      runId,
      message: 'The scenario exceeds the safety limits or is inconsistent.',
      issues: a.issues,
    });
    return;
  }
  const cost = a.cost;
  const sc: Scenario = { ...scenario, snapshotEveryWeeks: cost.snapshotEveryWeeks };

  let batch: SeriesPoint[] = [];
  let fraction = 0;
  let lastPost = t0;
  const flush = () => {
    post({ type: 'progress', runId, fraction, points: batch });
    batch = [];
    lastPost = now();
  };

  try {
    const r = simulate(sc, {
      storeFrames: false,
      onStart: ({ grid, plants, calendar }) =>
        post({
          type: 'meta',
          runId,
          grid,
          plants,
          calendar: calendar.map((w) => ({
            month: w.month,
            seasonIndex: w.seasonIndex,
            crop: w.crop.name,
            phase: w.phase,
            hostGrowth: w.hostGrowth,
          })),
          cost,
          issues: a.issues,
        }),
      onFrame: (frame) => {
        // Send pending series points first so the UI never sees a frame ahead of its data.
        if (batch.length) flush();
        post({ type: 'frame', runId, frame }, [frame.p.buffer, frame.plantStates.buffer]);
      },
      onWeek: (point) => batch.push(point),
      onProgress: (f) => {
        fraction = f;
        if (now() - lastPost >= PROGRESS_INTERVAL) flush();
      },
    });
    if (batch.length) flush();
    post({
      type: 'done',
      runId,
      budget: r.budget,
      factorizations: r.factorizations,
      seconds: (now() - t0) / 1000,
    });
  } catch (e) {
    post({ type: 'error', runId, message: (e as Error).message });
  }
}
