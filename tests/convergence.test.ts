import { describe, expect, it } from 'vitest';
import { sampleField } from '../src/model/grid';
import { decayRate } from '../src/model/ros2';
import type { AdvectionScheme } from '../src/model/types';
import { gaussian, maxAbs, run, square, transport } from './helpers';

/**
 * Temporal order on a fixed grid, measured against a run with a much smaller step.
 * Steps are chosen in the asymptotic range (β·τ/dx² ≲ 0.25); for larger steps the stiff
 * diffusion modes make the observed order lower (≈ 1.6 at β·τ/dx² = 2), as expected.
 */
describe('time convergence', () => {
  const g = square(20, 41);
  const T = 0.5;
  const p0 = sampleField(g, gaussian(9, 11, 1.5));

  for (const scheme of ['upwind', 'central'] as AdvectionScheme[]) {
    it(`ROS2 is second order in time (${scheme}, diffusion + advection + decay)`, () => {
      const tp = transport({
        beta: 1,
        scheme,
        velocity: { preset: 'centerDepression', vmax: 1, angleDeg: 0 },
      });
      const kappa = decayRate(1);
      const ref = run(g, tp, p0, T / 4096, 4096, kappa);
      const errs = [1 / 32, 1 / 64, 1 / 128, 1 / 256].map((tau) => {
        const p = run(g, tp, p0, tau, Math.round(T / tau), kappa);
        return maxAbs(p.map((v, k) => v - ref[k]));
      });
      const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
      for (const q of orders) expect(q).toBeGreaterThan(1.85);
      for (const q of orders) expect(q).toBeLessThan(2.15);
    }, 60_000);
  }
});
