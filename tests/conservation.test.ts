import { describe, expect, it } from 'vitest';
import { integral, sampleField } from '../src/model/grid';
import { assembleTransport } from '../src/model/operators';
import type { AdvectionScheme, VelocityPresetKind } from '../src/model/types';
import { gaussian, run, square, transport } from './helpers';

const presets: VelocityPresetKind[] = [
  'none',
  'uniform',
  'centerDepression',
  'unilateralDepression',
];
const schemes: AdvectionScheme[] = ['upwind', 'central'];

describe('mass conservation (finding A5)', () => {
  const g = square(20, 41);

  for (const preset of presets) {
    for (const scheme of schemes) {
      it(`zero-flux boundary, ${preset}, ${scheme}: total mass is constant`, () => {
        const tp = transport({
          beta: 0.5,
          scheme,
          boundary: 'zeroFlux',
          velocity: { preset, vmax: 2, angleDeg: 30 },
        });
        // Mass close to the boundary on purpose, so flow pushes against the walls.
        const p0 = sampleField(g, gaussian(6, 14, 2));
        const m0 = integral(g, p0);
        const p = run(g, tp, p0, 0.25, 80);
        expect(Math.abs(integral(g, p) / m0 - 1)).toBeLessThan(1e-10);
      });
    }
  }

  it('zero-flux operator has zero column sums', () => {
    const st = assembleTransport(
      g,
      transport({ boundary: 'zeroFlux', velocity: { preset: 'centerDepression', vmax: 3, angleDeg: 0 } }),
    );
    const { mx, N } = g;
    const col = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      col[k] += st.c[k];
      if (k >= 1) col[k - 1] += st.w[k];
      if (k + 1 < N) col[k + 1] += st.e[k];
      if (k >= mx) col[k - mx] += st.s[k];
      if (k + mx < N) col[k + mx] += st.n[k];
    }
    for (const v of col) expect(Math.abs(v)).toBeLessThan(1e-12);
  });

  it('centre depression gathers mass in the centre without losing it', () => {
    const tp = transport({
      beta: 0.2,
      boundary: 'zeroFlux',
      velocity: { preset: 'centerDepression', vmax: 1, angleDeg: 0 },
    });
    const p0 = sampleField(g, () => 1);
    const p = run(g, tp, p0, 0.25, 200);
    const centre = p[20 - 1 + g.mx * (20 - 1)];
    expect(centre).toBeGreaterThan(5);
    expect(Math.abs(integral(g, p) / integral(g, p0) - 1)).toBeLessThan(1e-10);
  });

  it('Dirichlet boundary only ever removes mass', () => {
    const tp = transport({
      beta: 1,
      velocity: { preset: 'uniform', vmax: 1, angleDeg: 0 },
    });
    let p = sampleField(g, gaussian(10, 10, 2));
    let m = integral(g, p);
    for (let i = 0; i < 10; i++) {
      p = run(g, tp, p, 0.5, 4);
      const m2 = integral(g, p);
      expect(m2).toBeLessThanOrEqual(m * (1 + 1e-12));
      m = m2;
    }
  });
});
