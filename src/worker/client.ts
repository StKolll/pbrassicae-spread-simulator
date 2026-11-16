import { LIMITS, type Issue } from '../model/limits';
import type { Scenario } from '../model/scenario';
import type { Frame, SeriesPoint } from '../model/simulate';
import type { FromWorker, RunMeta, RunSummary, ToWorker } from './protocol';

/** The part of the Worker API the client needs (lets tests pass a fake). */
export interface WorkerLike {
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(msg: ToWorker): void;
  terminate(): void;
}

export interface RunHandlers {
  onMeta?: (meta: RunMeta) => void;
  onProgress?: (fraction: number, points: SeriesPoint[]) => void;
  onFrame?: (frame: Frame) => void;
  onDone?: (summary: RunSummary) => void;
  /** Validation failure, solver error, worker crash or timeout. */
  onError?: (message: string, issues?: Issue[]) => void;
  onCancel?: () => void;
}

export interface RunHandle {
  cancel(): void;
  readonly finished: boolean;
}

export const createSimWorker = (): WorkerLike =>
  new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' }) as WorkerLike;

let nextRunId = 1;

/**
 * Start a simulation in a fresh worker. Each run gets its own worker, so cancelling (or the
 * timeout) can simply terminate it, even in the middle of a long step.
 */
export function startRun(
  scenario: Scenario,
  handlers: RunHandlers,
  opts: { createWorker?: () => WorkerLike; timeoutMs?: number } = {},
): RunHandle {
  const runId = nextRunId++;
  const worker = (opts.createWorker ?? createSimWorker)();
  let finished = false;

  const finish = () => {
    finished = true;
    clearTimeout(timer);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  };

  const timeoutMs = opts.timeoutMs ?? LIMITS.timeoutSeconds * 1000;
  const timer = setTimeout(() => {
    if (finished) return;
    finish();
    handlers.onError?.(`The simulation was stopped after ${Math.round(timeoutMs / 1000)} s.`);
  }, timeoutMs);

  worker.onmessage = (e) => {
    const m = e.data;
    if (finished || m.runId !== runId) return;
    switch (m.type) {
      case 'meta':
        handlers.onMeta?.(m);
        break;
      case 'progress':
        handlers.onProgress?.(m.fraction, m.points);
        break;
      case 'frame':
        handlers.onFrame?.(m.frame);
        break;
      case 'done':
        finish();
        handlers.onDone?.(m);
        break;
      case 'error':
        finish();
        handlers.onError?.(m.message, m.issues);
        break;
    }
  };
  worker.onerror = (e) => {
    if (finished) return;
    finish();
    handlers.onError?.(`The simulation crashed: ${e.message}`);
  };

  worker.postMessage({ type: 'start', runId, scenario });

  return {
    cancel() {
      if (finished) return;
      finish();
      handlers.onCancel?.();
    },
    get finished() {
      return finished;
    },
  };
}
