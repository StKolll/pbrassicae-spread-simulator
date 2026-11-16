import { BandMatrix, factor, type BandedLU } from './banded';
import type { Stencil } from './operators';

/**
 * Approximate matrix factorisation (AMF) of M = I − s(J_x + J_y + κI), s = τγ:
 *
 *   M ≈ M_x M_y,  M_x = I − s(J_x + κI),  M_y = I − s J_y,
 *   M_x M_y = M + s² (J_x + κI) J_y.
 *
 * M_x couples only neighbours within a grid row, M_y only within a column, so each is a set
 * of independent tridiagonal systems. With rows stored one after another (k = i + mx·j) all
 * row systems form one tridiagonal matrix of size N (couplings across row ends are zero); the
 * column systems become one tridiagonal matrix after reordering to k' = j + my·i.
 * Cost per solve is O(N) instead of O(N·mx) for the full banded LU.
 *
 * Used inside ROS2 the extra term changes the step only at O(τ³), so the method stays second
 * order. J_x and J_y have zero column sums with a zero-flux boundary, hence 1ᵀM_x = 1ᵀM_y = 1ᵀ
 * for κ = 0 and mass is conserved exactly.
 */
export function amfFactor(st: Stencil, kappa: number, s: number, pivoting?: boolean): BandedLU {
  const { mx, my, N } = st.grid;

  const Mx = new BandMatrix(N, 1, 1);
  for (let k = 0; k < N; k++) {
    Mx.set(k, k, 1 - s * (st.cx[k] + kappa));
    if (k >= 1) Mx.set(k, k - 1, -s * st.w[k]);
    if (k + 1 < N) Mx.set(k, k + 1, -s * st.e[k]);
  }

  // Column-major ordering for the y systems: k' = j + my·i  ↔  k = i + mx·j.
  const My = new BandMatrix(N, 1, 1);
  for (let i = 0; i < mx; i++) {
    for (let j = 0; j < my; j++) {
      const k = i + mx * j;
      const kp = j + my * i;
      My.set(kp, kp, 1 - s * st.cy[k]);
      if (j >= 1) My.set(kp, kp - 1, -s * st.s[k]);
      if (j + 1 < my) My.set(kp, kp + 1, -s * st.n[k]);
    }
  }

  const fx = factor(Mx, { pivoting });
  const fy = factor(My, { pivoting });
  const t = new Float64Array(N);

  return {
    N,
    pivoting: fx.pivoting || fy.pivoting,
    solve(rhs, out) {
      fx.solve(rhs, t); // M_x z = r
      for (let i = 0; i < mx; i++) {
        for (let j = 0; j < my; j++) out[j + my * i] = t[i + mx * j];
      }
      fy.solve(out, out); // M_y k = z  (column-major)
      t.set(out);
      for (let i = 0; i < mx; i++) {
        for (let j = 0; j < my; j++) out[i + mx * j] = t[j + my * i];
      }
    },
  };
}
