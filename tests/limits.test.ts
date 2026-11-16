import { describe, expect, it } from 'vitest';
import { assess } from '../src/model/limits';
import { austriaPreset, canadaPreset } from '../src/model/presets';
import type { Scenario } from '../src/model/scenario';

const msgs = (sc: Scenario, level: 'error' | 'warning') =>
  assess(sc).issues.filter((i) => i.level === level).map((i) => i.message);

function with_(change: (s: Scenario) => void): Scenario {
  const s = austriaPreset();
  change(s);
  return s;
}

describe('limits', () => {
  it('accepts both presets without errors or warnings', () => {
    for (const s of [austriaPreset(), canadaPreset()]) {
      const a = assess(s);
      expect(a.ok).toBe(true);
      expect(a.issues).toEqual([]);
      expect(a.cost!.weeks).toBe(260);
      expect(a.cost!.steps).toBe(1040);
      expect(a.cost!.plants).toBe(1024);
      expect(a.cost!.seconds).toBeLessThan(10);
    }
  });

  it('restricts the fast AMF solver to small diffusion numbers', () => {
    const amf = (beta: number) => with_((s) => ((s.solver = 'amf'), (s.transport.beta = beta)));
    // dx = 20/70 m, τ = 0.25 → d = β · 3.06
    expect(msgs(amf(0.01), 'warning')).toEqual([]);
    expect(msgs(amf(0.1), 'warning').join()).toMatch(/AMF.*inaccurate/);
    expect(assess(amf(0.1)).ok).toBe(true);
    expect(msgs(amf(5), 'error').join()).toMatch(/AMF.*unusable/);
  });

  it('rejects oversized grids and warns about fine ones', () => {
    expect(assess(with_((s) => (s.grid.nx = 201))).ok).toBe(false);
    expect(msgs(with_((s) => (s.grid.nx = 201)), 'error')[0]).toMatch(/at most 151/);
    const fine = with_((s) => (s.grid = { Lx: 20, Ly: 20, nx: 121, ny: 121 }));
    expect(assess(fine).ok).toBe(true);
    expect(msgs(fine, 'warning').join()).toMatch(/fine grid/);
  });

  it('rejects runs whose estimated time is too long', () => {
    const slow = with_((s) => {
      s.grid = { Lx: 20, Ly: 20, nx: 151, ny: 151 };
      s.solver = 'banded';
      s.tau = 1 / 8;
    });
    expect(assess(slow).ok).toBe(false);
    expect(msgs(slow, 'error').join()).toMatch(/Estimated run time/);
    // With τ = 1/4 the same grid is allowed (with a run-time warning).
    const ok = assess({ ...slow, tau: 0.25 });
    expect(ok.ok).toBe(true);
    expect(ok.issues.map((i) => i.message).join()).toMatch(/Estimated run time/);
  });

  it('rejects too many years', () => {
    const long = with_((s) => {
      s.rotation = Array.from({ length: 31 }, () => ({ crop: 'Cereal (e.g. wheat)', startMonth: 7, lengthMonths: 12 }));
    });
    expect(msgs(long, 'error').join()).toMatch(/30 years/);
  });

  it('checks time step and gall time', () => {
    expect(msgs(with_((s) => (s.tau = 0.3)), 'error').join()).toMatch(/divide one week/);
    expect(msgs(with_((s) => (s.biology.gallWeeks = 0.1)), 'error').join()).toMatch(/at least one time step/);
    expect(msgs(with_((s) => (s.biology.gallWeeks = 8.1)), 'warning').join()).toMatch(/rounded/);
  });

  it('checks plant geometry and initial infection', () => {
    expect(msgs(with_((s) => (s.plants.spacing = 0.5)), 'error').join()).toMatch(/twice the root radius/);
    expect(msgs(with_((s) => (s.plants.margin = 0.1)), 'error').join()).toMatch(/margin/);
    expect(msgs(with_((s) => (s.initial.count = 5000)), 'error').join()).toMatch(/Only 1024 plants/);
    expect(msgs(with_((s) => (s.plants.rootRadius = 0.1)), 'warning').join()).toMatch(/smaller than one grid cell/);
  });

  it('checks the rotation', () => {
    const gap = with_((s) => (s.rotation[1].startMonth = 0));
    expect(msgs(gap, 'error').join()).toMatch(/Crop rotation/);
    const pest = with_((s) => (s.rotation[0].pesticide = [{ week: 3, killFraction: 1.5 }]));
    expect(msgs(pest, 'error').join()).toMatch(/kill fraction/);
  });

  it('warns about central advection at high Péclet and large Courant numbers', () => {
    const s = with_((s) => {
      s.transport.scheme = 'central';
      s.transport.beta = 0.01;
      s.transport.velocity = { preset: 'uniform', vmax: 10, angleDeg: 0 };
      s.tau = 1;
    });
    const w = msgs(s, 'warning').join();
    expect(w).toMatch(/Péclet/);
    expect(w).toMatch(/Courant/);
  });
});
