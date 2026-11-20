import { describe, expect, it } from 'vitest';
import { LIMITS, assess } from '../src/model/limits';
import { austriaPreset, canadaPreset } from '../src/model/presets';
import { MAX_SWEEP_VALUES, parallelRuns, parseValues, planSweep, suggestValues, sweepColors, sweepParam } from '../src/ui/sweep';

const beta = sweepParam('beta');

describe('sweep values', () => {
  it('parses, de-duplicates and sorts', () => {
    expect(parseValues('0.03, 0.01;0.003  0.01', beta)).toEqual({ values: [0.003, 0.01, 0.03], error: null });
    expect(parseValues('1e-3 1e-2', beta).values).toEqual([0.001, 0.01]);
  });

  it('rejects bad input', () => {
    expect(parseValues('0.01', beta).error).toMatch(/two/);
    expect(parseValues('0.01, abc', beta).error).toMatch(/not a number/);
    expect(parseValues('0.01, 50', beta).error).toMatch(/outside/);
    expect(parseValues('1.5, 2', sweepParam('gallWeeks')).error).toMatch(/whole/);
    const many = Array.from({ length: MAX_SWEEP_VALUES + 1 }, (_, k) => 0.001 * (k + 1)).join(',');
    expect(parseValues(many, beta).error).toMatch(/At most/);
  });

  it('suggests values around the current one', () => {
    expect(suggestValues(beta, 0.01)).toEqual([0.00333, 0.01, 0.03]);
    expect(suggestValues(sweepParam('halfLife'), 5.3)).toEqual([2.65, 5.3, 7.95]);
    expect(suggestValues(sweepParam('rainKept'), 0.8)).toEqual([0.4, 0.8, 1]);
    expect(suggestValues(sweepParam('seed'), 42)).toEqual([42, 43, 44]);
  });
});

describe('sweep plan', () => {
  it('makes one scenario per value and changes only the swept parameter', () => {
    const base = austriaPreset();
    const plan = planSweep(base, beta, [0.003, 0.01, 0.03], 8);
    expect(plan.runs.map((r) => r.scenario.transport.beta)).toEqual([0.003, 0.01, 0.03]);
    for (const r of plan.runs) {
      expect({ ...r.scenario, name: '', transport: base.transport, snapshotEveryWeeks: 1 }).toEqual({ ...base, name: '', snapshotEveryWeeks: 1 });
    }
    expect(base.transport.beta).toBe(austriaPreset().transport.beta);
    expect(plan.errors).toEqual([]);
    expect(plan.parallel).toBe(3);
  });

  it('sets every pesticide event', () => {
    const plan = planSweep(canadaPreset(), sweepParam('pesticide'), [0.2, 0.8], 4);
    const kills = plan.runs.map((r) => r.scenario.rotation.flatMap((s) => s.pesticide ?? []).map((e) => e.killFraction));
    expect(kills[0].every((k) => k === 0.2)).toBe(true);
    expect(kills[1].every((k) => k === 0.8)).toBe(true);
    expect(sweepParam('pesticide').unavailable!(austriaPreset())).not.toBeNull();
  });

  it('keeps all runs together within the frame memory budget', () => {
    const base = austriaPreset();
    base.grid = { ...base.grid, nx: 151, ny: 151 };
    base.rotation = Array.from({ length: 30 }, () => ({ ...base.rotation[0] }));
    const plan = planSweep(base, beta, [0.001, 0.003, 0.01, 0.03, 0.1], 8);
    let bytes = 0;
    for (const r of plan.runs) {
      const c = assess(r.scenario).cost!;
      bytes += c.frameBytes;
    }
    expect(bytes).toBeLessThanOrEqual(LIMITS.maxFrameBytes);
  });

  it('reports errors per value', () => {
    const plan = planSweep(austriaPreset(), sweepParam('initialCount'), [5, 100000], 4);
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.errors[0].message).toMatch(/= 1e5|= 100000/);
  });

  it('runs at most 4 at once and leaves a core free', () => {
    expect(parallelRuns(5, 16)).toBe(4);
    expect(parallelRuns(5, 2)).toBe(1);
    expect(parallelRuns(2, 8)).toBe(2);
  });
});

describe('sweep colours', () => {
  it('gives distinct colours in value order', () => {
    for (const n of [2, 3, 4, 5]) {
      const c = sweepColors(n, false);
      expect(new Set(c).size).toBe(n);
      expect(sweepColors(n, true)).toHaveLength(n);
    }
  });
});
