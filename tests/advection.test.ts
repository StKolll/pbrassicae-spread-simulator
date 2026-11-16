import { describe, expect, it } from 'vitest';
import { integral, sampleField, xOf, yOf, type Grid } from '../src/model/grid';
import { maxCellPeclet, maxCourant } from '../src/model/operators';
import type { AdvectionScheme } from '../src/model/types';
import { gaussian, maxAbs, run, square, transport } from './helpers';

function centreOfMass(g: Grid, p: Float64Array): [number, number] {
  let m = 0;
  let mx = 0;
  let my = 0;
  for (let j = 0; j < g.my; j++) {
    for (let i = 0; i < g.mx; i++) {
      const v = p[i + g.mx * j];
      m += v;
      mx += v * xOf(g, i);
      my += v * yOf(g, j);
    }
  }
  return [mx / m, my / m];
}

describe('advection', () => {
  const g = square(20, 81);
  const angle = 30;
  const v = 1.5;
  const T = 4;
  const ux = v * Math.cos((angle * Math.PI) / 180);
  const uy = v * Math.sin((angle * Math.PI) / 180);

  for (const scheme of ['upwind', 'central'] as AdvectionScheme[]) {
    it(`uniform flow moves the centre of mass by u·t (${scheme})`, () => {
      const tp = transport({
        beta: 0.1,
        scheme,
        boundary: 'zeroFlux',
        velocity: { preset: 'uniform', vmax: v, angleDeg: angle },
      });
      const p0 = sampleField(g, gaussian(6, 6, 1));
      const p = run(g, tp, p0, 0.05, Math.round(T / 0.05));
      const [x, y] = centreOfMass(g, p);
      expect(x).toBeCloseTo(6 + ux * T, 3);
      expect(y).toBeCloseTo(6 + uy * T, 3);
      expect(Math.abs(integral(g, p) / integral(g, p0) - 1)).toBeLessThan(1e-10);
    });
  }

  it('upwind keeps smooth data non-negative', () => {
    const tp = transport({
      beta: 0.05,
      velocity: { preset: 'centerDepression', vmax: 2, angleDeg: 0 },
    });
    const p = run(g, tp, sampleField(g, gaussian(7, 12, 1.5)), 0.25, 80);
    let min = Infinity;
    for (const x of p) min = Math.min(min, x);
    expect(min).toBeGreaterThanOrEqual(-1e-12 * maxAbs(p));
  });

  it('reports Péclet and Courant numbers', () => {
    const tp = transport({ beta: 0.1, velocity: { preset: 'uniform', vmax: 2, angleDeg: 0 } });
    expect(maxCellPeclet(g, tp)).toBeCloseTo((2 * g.dx) / 0.2, 10);
    expect(maxCourant(g, tp, 0.5)).toBeCloseTo((2 * 0.5) / g.dx, 10);
  });

  it('central advection at high Péclet still solves (pivoting)', () => {
    const tp = transport({
      beta: 0.001,
      scheme: 'central',
      velocity: { preset: 'uniform', vmax: 5, angleDeg: 0 },
    });
    const p = run(g, tp, sampleField(g, gaussian(6, 10, 1)), 0.5, 4);
    for (const x of p) expect(Number.isFinite(x)).toBe(true);
  });
});
