import type { Grid } from './grid';
import type { TransportParams } from './types';
import { velocityAt } from './velocity';

/**
 * Five-point stencil of the transport operator J_T = diffusion + advection (no decay):
 *   (J_T p)_k = c_k p_k + w_k p_{k−1} + e_k p_{k+1} + s_k p_{k−mx} + n_k p_{k+mx}.
 * Coefficients that would reach outside the field are zero.
 */
export interface Stencil {
  grid: Grid;
  /** Diagonal, c = cx + cy (x-face and y-face contributions, used by the AMF solver). */
  c: Float64Array;
  cx: Float64Array;
  cy: Float64Array;
  w: Float64Array;
  e: Float64Array;
  s: Float64Array;
  n: Float64Array;
}

/**
 * Finite-volume assembly of ∂ₜp = β Δp − ∇·(u p).
 *
 * Every cell face carries a flux F = −β ∂p/∂n + u_f · p_f, where u_f is the velocity at the
 * face midpoint and p_f is the upwind value or the mean of both sides (central). A face flux
 * leaves one cell and enters its neighbour, so the scheme conserves mass exactly apart from the
 * boundary faces. At the boundary:
 *   - dirichlet: outside value p = 0 (diffusion and outflow remove spores, no inflow),
 *   - zeroFlux: no flux at all.
 */
export function assembleTransport(g: Grid, tp: TransportParams): Stencil {
  const { mx, my, N, dx, dy } = g;
  const cx = new Float64Array(N);
  const cy = new Float64Array(N);
  let c = cx; // diagonal array the current face loop writes to
  const w = new Float64Array(N);
  const e = new Float64Array(N);
  const s = new Float64Array(N);
  const n = new Float64Array(N);
  const dirichlet = tp.boundary === 'dirichlet';
  const central = tp.scheme === 'central';

  /**
   * Add the flux through the face between cell L and cell R (−1 = outside the field).
   * d = diffusion rate β/h², a = u_f/h (positive means flow from L to R).
   * toR[L] holds the coefficient of p_R in row L, toL[R] that of p_L in row R.
   */
  const face = (
    L: number,
    R: number,
    d: number,
    a: number,
    toR: Float64Array,
    toL: Float64Array,
  ) => {
    if ((L < 0 || R < 0) && !dirichlet) return; // zero flux through the boundary
    let LL = -d;
    let LR = d;
    let RL = d;
    let RR = -d;
    if (central) {
      LL -= a / 2;
      LR -= a / 2;
      RL += a / 2;
      RR += a / 2;
    } else if (a > 0) {
      LL -= a;
      RL += a;
    } else {
      LR -= a;
      RR += a;
    }
    if (L >= 0) {
      c[L] += LL;
      if (R >= 0) toR[L] += LR;
    }
    if (R >= 0) {
      c[R] += RR;
      if (L >= 0) toL[R] += RL;
    }
  };

  const vel = tp.velocity;
  const hasFlow = vel.preset !== 'none' && vel.vmax !== 0;
  const dX = tp.beta / (dx * dx);
  const dY = tp.beta / (dy * dy);

  c = cx;
  // x faces: between column i and i+1 (i = −1 … mx−1), at x = (i + 1.5)·dx.
  for (let j = 0; j < my; j++) {
    const y = (j + 1) * dy;
    for (let i = -1; i < mx; i++) {
      const L = i >= 0 ? i + mx * j : -1;
      const R = i + 1 < mx ? i + 1 + mx * j : -1;
      const a = hasFlow ? velocityAt(vel, g, (i + 1.5) * dx, y)[0] / dx : 0;
      face(L, R, dX, a, e, w);
    }
  }
  c = cy;
  // y faces: between row j and j+1 (j = −1 … my−1), at y = (j + 1.5)·dy.
  for (let j = -1; j < my; j++) {
    for (let i = 0; i < mx; i++) {
      const x = (i + 1) * dx;
      const L = j >= 0 ? i + mx * j : -1;
      const R = j + 1 < my ? i + mx * (j + 1) : -1;
      const a = hasFlow ? velocityAt(vel, g, x, (j + 1.5) * dy)[1] / dy : 0;
      face(L, R, dY, a, n, s);
    }
  }
  const csum = new Float64Array(N);
  for (let k = 0; k < N; k++) csum[k] = cx[k] + cy[k];
  return { grid: g, c: csum, cx, cy, w, e, s, n };
}

/** out = (J_T + κ I) p. */
export function applyJ(st: Stencil, kappa: number, p: Float64Array, out: Float64Array): void {
  const { c, w, e, s, n } = st;
  const { mx, N } = st.grid;
  for (let k = 0; k < N; k++) {
    let v = (c[k] + kappa) * p[k];
    if (k >= 1) v += w[k] * p[k - 1];
    if (k + 1 < N) v += e[k] * p[k + 1];
    if (k >= mx) v += s[k] * p[k - mx];
    if (k + mx < N) v += n[k] * p[k + mx];
    out[k] = v;
  }
}

/** Largest cell Péclet number |u|·h / (2β) over all faces (Infinity if β = 0 and u ≠ 0). */
export function maxCellPeclet(g: Grid, tp: TransportParams): number {
  return maxOverFaces(g, tp, (u, h) => (u === 0 ? 0 : (u * h) / (2 * tp.beta)));
}

/** Largest Courant number |u|·τ / h over all faces. */
export function maxCourant(g: Grid, tp: TransportParams, tau: number): number {
  return maxOverFaces(g, tp, (u, h) => (u * tau) / h);
}

function maxOverFaces(g: Grid, tp: TransportParams, f: (u: number, h: number) => number) {
  let m = 0;
  for (let j = 0; j <= g.my; j++) {
    for (let i = 0; i <= g.mx; i++) {
      const [ux] = velocityAt(tp.velocity, g, (i + 0.5) * g.dx, (j + 1) * g.dy);
      const [, uy] = velocityAt(tp.velocity, g, (i + 1) * g.dx, (j + 0.5) * g.dy);
      m = Math.max(m, f(Math.abs(ux), g.dx), f(Math.abs(uy), g.dy));
    }
  }
  return m;
}
