import { describe, expect, it } from 'vitest';
import { integral, sampleField } from '../src/model/grid';
import { decayRate } from '../src/model/ros2';
import type { AdvectionScheme, VelocityPresetKind } from '../src/model/types';
import { gaussian, maxAbs, run, square, transport } from './helpers';

/** The AMF solver must pass the same checks as the exact banded LU. */
describe('AMF solver', () => {
  it('decay alone is exact (M_y = I)', () => {
    const g = square(10, 11);
    const kappa = decayRate(5.3);
    const a = run(g, transport({ beta: 0 }), sampleField(g, () => 1), 0.25, 100, kappa, undefined, 'amf');
    const b = run(g, transport({ beta: 0 }), sampleField(g, () => 1), 0.25, 100, kappa, undefined, 'banded');
    for (let k = 0; k < g.N; k++) expect(a[k]).toBeCloseTo(b[k], 14);
  });

  const presets: VelocityPresetKind[] = ['none', 'uniform', 'centerDepression', 'unilateralDepression'];
  for (const preset of presets) {
    for (const scheme of ['upwind', 'central'] as AdvectionScheme[]) {
      it(`conserves mass with zero-flux boundary (${preset}, ${scheme})`, () => {
        const g = square(20, 41);
        const tp = transport({
          beta: 0.5,
          scheme,
          boundary: 'zeroFlux',
          velocity: { preset, vmax: 2, angleDeg: 30 },
        });
        const p0 = sampleField(g, gaussian(6, 14, 2));
        const p = run(g, tp, p0, 0.25, 80, 0, undefined, 'amf');
        expect(Math.abs(integral(g, p) / integral(g, p0) - 1)).toBeLessThan(1e-10);
      });
    }
  }

  it('matches the heat kernel and converges at second order', () => {
    const L = 20;
    const exact = (t: number) => {
      const s2 = 1 + 2 * t;
      return (x: number, y: number) =>
        (1 / s2) * Math.exp(-((x - L / 2) ** 2 + (y - L / 2) ** 2) / (2 * s2));
    };
    const err = (n: number, tau: number) => {
      const g = square(L, n);
      const p = run(g, transport({ beta: 1 }), sampleField(g, gaussian(L / 2, L / 2, 1)), tau, Math.round(2 / tau), 0, undefined, 'amf');
      const ref = sampleField(g, exact(2));
      return maxAbs(p.map((v, k) => v - ref[k]));
    };
    const e1 = err(41, 0.1);
    const e2 = err(81, 0.05);
    const e3 = err(161, 0.025);
    expect(e3).toBeLessThan(1e-3);
    expect(Math.log2(e1 / e2)).toBeGreaterThan(1.8);
    expect(Math.log2(e2 / e3)).toBeGreaterThan(1.8);
  }, 60_000);

  it('is second order in time (diffusion + advection + decay)', () => {
    const g = square(20, 41);
    const tp = transport({ beta: 1, velocity: { preset: 'centerDepression', vmax: 1, angleDeg: 0 } });
    const kappa = decayRate(1);
    const p0 = sampleField(g, gaussian(9, 11, 1.5));
    const T = 0.5;
    const ref = run(g, tp, p0, T / 4096, 4096, kappa, undefined, 'amf');
    const errs = [1 / 32, 1 / 64, 1 / 128, 1 / 256].map((tau) =>
      maxAbs(run(g, tp, p0, tau, Math.round(T / tau), kappa, undefined, 'amf').map((v, k) => v - ref[k])),
    );
    const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
    for (const q of orders) expect(q).toBeGreaterThan(1.85);
    for (const q of orders) expect(q).toBeLessThan(2.15);
  }, 60_000);

  it('stays close to the exact solver at typical settings', () => {
    const g = square(20, 71);
    const tp = transport({ beta: 0.05, velocity: { preset: 'centerDepression', vmax: 0.4, angleDeg: 0 } });
    const p0 = sampleField(g, gaussian(8, 12, 0.8));
    const a = run(g, tp, p0, 0.25, 40, decayRate(5.3), undefined, 'amf');
    const b = run(g, tp, p0, 0.25, 40, decayRate(5.3), undefined, 'banded');
    const diff = maxAbs(a.map((v, k) => v - b[k]));
    expect(diff / maxAbs(b)).toBeLessThan(0.02);
  });

  // Known limitation (found in Phase 4): AMF hardly damps grid-scale modes that are stiff in
  // both directions, so a sharp spore cone oscillates when β·τ/dx² is large. The exact
  // solver stays non-negative. limits.ts warns above d = 0.1 and refuses AMF above d = 1.
  it('fails on sharp data at large diffusion numbers, where the exact solver does not', () => {
    const g = square(20, 71); // dx ≈ 0.29 m, β = 5, τ = 0.25 → d ≈ 15
    const cone = sampleField(g, (x, y) => Math.max(0, 1 - Math.hypot(x - 10, y - 10) / 0.3));
    const tp = transport({ beta: 5 });
    const exact = run(g, tp, cone, 0.25, 8, 0, undefined, 'banded');
    const amf = run(g, tp, cone, 0.25, 8, 0, undefined, 'amf');
    expect(Math.min(...exact)).toBeGreaterThanOrEqual(-1e-12 * maxAbs(exact));
    expect(Math.min(...amf)).toBeLessThan(-0.1 * maxAbs(exact));
  });
});
