import { makeGrid, type Grid } from '../src/model/grid';
import { assembleTransport } from '../src/model/operators';
import { Ros2Stepper, type LinearSolver } from '../src/model/ros2';
import type { TransportParams, VelocityConfig } from '../src/model/types';

export const noFlow: VelocityConfig = { preset: 'none', vmax: 0, angleDeg: 0 };

export function transport(over: Partial<TransportParams> = {}): TransportParams {
  return { beta: 1, velocity: noFlow, scheme: 'upwind', boundary: 'dirichlet', ...over };
}

/** Run `steps` ROS2 steps of size tau and return the final field. */
export function run(
  g: Grid,
  tp: TransportParams,
  p0: Float64Array,
  tau: number,
  steps: number,
  kappa = 0,
  pivoting?: boolean,
  solver: LinearSolver = 'banded',
): Float64Array {
  const st = new Ros2Stepper(assembleTransport(g, tp), tau, { pivoting, solver });
  const p = Float64Array.from(p0);
  for (let n = 0; n < steps; n++) st.step(p, kappa);
  return p;
}

export const square = (L: number, n: number): Grid => makeGrid({ Lx: L, Ly: L, nx: n, ny: n });

export function gaussian(x0: number, y0: number, sigma: number, amp = 1) {
  return (x: number, y: number) =>
    amp * Math.exp(-((x - x0) ** 2 + (y - y0) ** 2) / (2 * sigma * sigma));
}

export const maxAbs = (a: ArrayLike<number>) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  return m;
};
