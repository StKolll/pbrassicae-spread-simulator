import { amfFactor } from './amf';
import { BandMatrix, factor, type BandedLU } from './banded';
import { applyJ, type Stencil } from './operators';

/**
 * ROS2: two-stage Rosenbrock–Wanner method, order 2, L-stable (R(∞) = 0).
 *
 *   M = I − τγJ,  γ = 1 + 1/√2,  β21 = ½ − γ
 *   M k1 = τ J pⁿ
 *   M k2 = τ J (pⁿ + β21 k1)
 *   pⁿ⁺¹ = pⁿ + k2
 *
 * For the linear right-hand side f(p) = J p this is the scheme of the thesis (eq. 5.19);
 * its stability function is R(z) = 1 + z/(1−γz) + β21 z²/(1−γz)².
 */
export const ROS2_GAMMA = 1 + 1 / Math.SQRT2;
export const ROS2_BETA21 = 0.5 - ROS2_GAMMA;

/** Build M = I − τγ (J_T + κI) in band storage (bandwidth mx). */
export function buildSystemMatrix(st: Stencil, kappa: number, tau: number): BandMatrix {
  const { mx, N } = st.grid;
  const s = tau * ROS2_GAMMA;
  const M = new BandMatrix(N, mx, mx);
  for (let k = 0; k < N; k++) {
    M.set(k, k, 1 - s * (st.c[k] + kappa));
    if (k >= 1 && st.w[k] !== 0) M.set(k, k - 1, -s * st.w[k]);
    if (k + 1 < N && st.e[k] !== 0) M.set(k, k + 1, -s * st.e[k]);
    if (k >= mx && st.s[k] !== 0) M.set(k, k - mx, -s * st.s[k]);
    if (k + mx < N && st.n[k] !== 0) M.set(k, k + mx, -s * st.n[k]);
  }
  return M;
}

/** Linear solver for the ROS2 stages: exact banded LU or approximate factorisation. */
export type LinearSolver = 'banded' | 'amf';

/**
 * Time stepper for ∂ₜp = (J_T + κ I) p with a fixed step τ. κ may change between steps
 * (e.g. seasonal decay); one factorisation is cached per distinct κ.
 */
export class Ros2Stepper {
  private readonly cache = new Map<number, BandedLU>();
  private readonly r: Float64Array;
  private readonly k1: Float64Array;
  private readonly tmp: Float64Array;
  /** Number of factorisations performed so far. */
  factorizations = 0;

  constructor(
    readonly stencil: Stencil,
    readonly tau: number,
    private readonly opts: { solver?: LinearSolver; pivoting?: boolean; maxCached?: number } = {},
  ) {
    if (!(tau > 0)) throw new Error('Time step must be positive');
    const N = stencil.grid.N;
    this.r = new Float64Array(N);
    this.k1 = new Float64Array(N);
    this.tmp = new Float64Array(N);
  }

  lu(kappa: number): BandedLU {
    let f = this.cache.get(kappa);
    if (!f) {
      f =
        this.opts.solver === 'amf'
          ? amfFactor(this.stencil, kappa, this.tau * ROS2_GAMMA, this.opts.pivoting)
          : factor(buildSystemMatrix(this.stencil, kappa, this.tau), {
              pivoting: this.opts.pivoting,
            });
      this.factorizations++;
      if (this.cache.size >= (this.opts.maxCached ?? 12)) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      this.cache.set(kappa, f);
    }
    return f;
  }

  /** Advance p in place by one step τ. */
  step(p: Float64Array, kappa: number): void {
    const { r, k1, tmp, tau } = this;
    const lu = this.lu(kappa);
    const N = p.length;
    applyJ(this.stencil, kappa, p, r);
    for (let k = 0; k < N; k++) r[k] *= tau;
    lu.solve(r, k1);
    for (let k = 0; k < N; k++) tmp[k] = p[k] + ROS2_BETA21 * k1[k];
    applyJ(this.stencil, kappa, tmp, r);
    for (let k = 0; k < N; k++) r[k] *= tau;
    lu.solve(r, r); // r = k2
    for (let k = 0; k < N; k++) p[k] += r[k];
  }
}

/** Decay rate κ = ln(0.5) / (HL · 52) [1/week] for a half-life HL in years. */
export function decayRate(halfLifeYears: number): number {
  if (!(halfLifeYears > 0)) throw new Error('Half-life must be positive');
  return Math.log(0.5) / (halfLifeYears * 52);
}
