import { describe, expect, it } from 'vitest';
import { sampleField } from '../src/model/grid';
import { gaussian, maxAbs, run, square, transport } from './helpers';

/**
 * A Gaussian with variance σ0² spreads to variance σ² = σ0² + 2βt, amplitude × σ0²/σ².
 * Far from the boundary the Dirichlet condition has no visible effect.
 */
describe('diffusion', () => {
  const L = 20;
  const beta = 1;
  const sigma0 = 1;
  const T = 2;

  const exact = (t: number) => {
    const s2 = sigma0 ** 2 + 2 * beta * t;
    return (x: number, y: number) =>
      (sigma0 ** 2 / s2) * Math.exp(-((x - L / 2) ** 2 + (y - L / 2) ** 2) / (2 * s2));
  };

  const error = (n: number, tau: number) => {
    const g = square(L, n);
    const p0 = sampleField(g, gaussian(L / 2, L / 2, sigma0));
    const p = run(g, transport({ beta }), p0, tau, Math.round(T / tau));
    const ref = sampleField(g, exact(T));
    return maxAbs(p.map((v, k) => v - ref[k]));
  };

  it('matches the heat kernel and converges at second order', () => {
    const e1 = error(41, 0.1);
    const e2 = error(81, 0.05);
    const e3 = error(161, 0.025);
    expect(e3).toBeLessThan(1e-3);
    expect(Math.log2(e1 / e2)).toBeGreaterThan(1.8);
    expect(Math.log2(e2 / e3)).toBeGreaterThan(1.8);
  }, 60_000);
});
