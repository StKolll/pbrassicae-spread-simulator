import { describe, expect, it, vi } from 'vitest';
import { austriaPreset } from '../src/model/presets';
import type { Scenario } from '../src/model/scenario';
import { startRun, type WorkerLike } from '../src/worker/client';
import { runScenario, type FromWorker, type ToWorker } from '../src/worker/protocol';

function small(): Scenario {
  const s = austriaPreset();
  s.grid = { Lx: 10, Ly: 10, nx: 31, ny: 31 };
  s.tau = 0.5;
  return s;
}

describe('worker protocol (runScenario)', () => {
  it('streams meta, frames and progress, then done', () => {
    const msgs: FromWorker[] = [];
    let t = 0;
    runScenario(1, small(), (m) => msgs.push(m), () => (t += 50)); // fake clock
    expect(msgs[0].type).toBe('meta');
    expect(msgs.at(-1)!.type).toBe('done');
    const frames = msgs.filter((m) => m.type === 'frame');
    expect(frames).toHaveLength(261); // t = 0 plus one per week
    const points = msgs.flatMap((m) => (m.type === 'progress' ? m.points : []));
    expect(points.map((p) => p.week)).toEqual(Array.from({ length: 260 }, (_, i) => i + 1));
    // A frame never arrives before the series point of its week.
    let lastWeek = 0;
    for (const m of msgs) {
      if (m.type === 'progress') lastWeek = m.points.at(-1)?.week ?? lastWeek;
      if (m.type === 'frame') expect(m.frame.week).toBeLessThanOrEqual(lastWeek);
    }
  });

  it('blocks an over-limit scenario before computing anything', () => {
    const s = small();
    s.grid.nx = 500;
    const msgs: FromWorker[] = [];
    runScenario(2, s, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    const m = msgs[0];
    expect(m.type).toBe('error');
    if (m.type === 'error') expect(m.issues!.some((i) => /at most 151/.test(i.message))).toBe(true);
  });
});

/** Fake worker: runs the protocol asynchronously, one message per macrotask. */
class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  terminated = false;
  private queue: FromWorker[] = [];
  postMessage(msg: ToWorker) {
    runScenario(msg.runId, msg.scenario, (m) => this.queue.push(m));
    const pump = () => {
      if (this.terminated) return;
      const m = this.queue.shift();
      if (!m) return;
      this.onmessage?.({ data: m } as MessageEvent<FromWorker>);
      setImmediate(pump);
    };
    setImmediate(pump);
  }
  terminate() {
    this.terminated = true;
  }
}

describe('worker client (startRun)', () => {
  it('delivers a complete run and terminates the worker', async () => {
    const w = new FakeWorker();
    const done = new Promise<void>((resolve) => {
      startRun(small(), { onDone: () => resolve() }, { createWorker: () => w });
    });
    await done;
    expect(w.terminated).toBe(true);
  });

  it('cancel terminates the worker and ignores later messages', async () => {
    const w = new FakeWorker();
    const onDone = vi.fn();
    const onCancel = vi.fn();
    let frames = 0;
    // eslint-disable-next-line prefer-const
    let h: ReturnType<typeof startRun>;
    const onFrame = vi.fn(() => {
      if (++frames === 5) h.cancel(); // cancel in the middle of the run
    });
    h = startRun(small(), { onFrame, onDone, onCancel }, { createWorker: () => w });
    await new Promise((r) => setTimeout(r, 200));
    const seen = 5;
    expect(w.terminated).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    expect(onFrame.mock.calls.length).toBe(seen);
    expect(h.finished).toBe(true);
  });

  it('stops the worker after the timeout', async () => {
    const w = new FakeWorker();
    w.postMessage = () => {}; // never answers
    const err = await new Promise<string>((resolve) =>
      startRun(small(), { onError: (m) => resolve(m) }, { createWorker: () => w, timeoutMs: 30 }),
    );
    expect(err).toMatch(/stopped after/);
    expect(w.terminated).toBe(true);
  });

  it('reports validation errors with the issue list', async () => {
    const s = small();
    s.tau = 0.3;
    const issues = await new Promise<unknown[]>((resolve) =>
      startRun(s, { onError: (_m, i) => resolve(i ?? []) }, { createWorker: () => new FakeWorker() }),
    );
    expect(issues.length).toBeGreaterThan(0);
  });
});
