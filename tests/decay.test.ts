import { describe, expect, it } from 'vitest';
import { sampleField } from '../src/model/grid';
import { ROS2_BETA21, ROS2_GAMMA, decayRate } from '../src/model/ros2';
import { run, square, transport } from './helpers';

describe('decay', () => {
  it('κ = ln(0.5)/(HL·52) halves the concentration after HL years', () => {
    const HL = 5.3;
    const kappa = decayRate(HL);
    const g = square(10, 11);
    const tp = transport({ beta: 0 });
    const tau = 0.25;
    const weeks = HL * 52;
    const steps = Math.round(weeks / tau);
    const p = run(g, tp, sampleField(g, () => 3), tau, steps, kappa);
    for (const v of p) expect(Math.abs(v / 3 - 0.5)).toBeLessThan(0.0005);
  });

  it('does not depend on run length or time step (finding A1)', () => {
    const kappa = decayRate(2);
    const g = square(10, 6);
    const tp = transport({ beta: 0 });
    const a = run(g, tp, sampleField(g, () => 1), 1, 52, kappa)[0];
    const b = run(g, tp, sampleField(g, () => 1), 0.125, 416, kappa)[0];
    // Order-2 error over one year: ≈ 2e-5 at τ = 1 week, ≈ 3e-7 at τ = 1/8 week.
    expect(Math.abs(a - Math.exp(kappa * 52))).toBeLessThan(5e-5);
    expect(Math.abs(b - Math.exp(kappa * 52))).toBeLessThan(1e-6);
  });
});

describe('ROS2 coefficients', () => {
  const R = (z: number) => {
    const d = 1 - ROS2_GAMMA * z;
    return 1 + z / d + (ROS2_BETA21 * z * z) / (d * d);
  };

  it('is order 2: R(z) = 1 + z + z²/2 + O(z³)', () => {
    for (const z of [1e-2, 5e-3, 2.5e-3]) {
      const err = Math.abs(R(z) - (1 + z + z * z / 2));
      expect(err / z ** 3).toBeLessThan(2);
    }
  });

  it('is L-stable: |R(z)| ≤ 1 for z ≤ 0 and R(−∞) = 0', () => {
    for (let z = 0; z > -1e6; z = z * 1.3 - 0.01) expect(Math.abs(R(z))).toBeLessThanOrEqual(1);
    expect(Math.abs(R(-1e12))).toBeLessThan(1e-9);
  });
});
