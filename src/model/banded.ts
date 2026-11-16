/**
 * Banded LU factorisation for M = I − τγJ of the five-point stencil
 * (lower and upper bandwidth b = mx).
 *
 * Two variants:
 *  - no pivoting (Doolittle). Used when M is diagonally dominant by columns, which holds for
 *    upwind advection; Gaussian elimination is then stable without row exchanges.
 *  - partial pivoting (LINPACK style: multipliers kept per column, row swaps applied to U
 *    only). The upper bandwidth grows to 2b. Used otherwise (central advection at high Péclet).
 */

export interface BandedLU {
  readonly N: number;
  readonly pivoting: boolean;
  /** Solve M x = rhs. `out` may be the same array as `rhs`. */
  solve(rhs: Float64Array, out: Float64Array): void;
}

/** Row-major band storage: entry (i, j) at i·W + (j − i + kl), for j ∈ [i − kl, i + ku]. */
export class BandMatrix {
  readonly W: number;
  readonly a: Float64Array;
  constructor(
    readonly N: number,
    readonly kl: number,
    readonly ku: number,
  ) {
    this.W = kl + ku + 1;
    this.a = new Float64Array(N * this.W);
  }
  get(i: number, j: number): number {
    const o = j - i + this.kl;
    return o < 0 || o >= this.W ? 0 : this.a[i * this.W + o];
  }
  set(i: number, j: number, v: number): void {
    const o = j - i + this.kl;
    if (o < 0 || o >= this.W) throw new Error(`(${i}, ${j}) outside the band`);
    this.a[i * this.W + o] = v;
  }
  /** True if |a_jj| ≥ Σ_{i≠j} |a_ij| for every column j. */
  isColumnDiagonallyDominant(): boolean {
    const { N, kl, ku } = this;
    const off = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const jmax = Math.min(N - 1, i + ku);
      for (let j = Math.max(0, i - kl); j <= jmax; j++) {
        if (j !== i) off[j] += Math.abs(this.get(i, j));
      }
    }
    for (let j = 0; j < N; j++) if (Math.abs(this.get(j, j)) < off[j]) return false;
    return true;
  }
}

/** Factorise A. Without an explicit choice, pivoting is used unless A is column-dominant. */
export function factor(A: BandMatrix, opts: { pivoting?: boolean } = {}): BandedLU {
  const pivoting = opts.pivoting ?? !A.isColumnDiagonallyDominant();
  return pivoting ? factorPivot(A) : factorNoPivot(A);
}

function factorNoPivot(A: BandMatrix): BandedLU {
  const { N, kl, ku, W } = A;
  const a = Float64Array.from(A.a);
  for (let k = 0; k < N; k++) {
    const kk = k * W + kl; // a(k, k)
    const piv = a[kk];
    if (piv === 0 || !Number.isFinite(piv)) throw new Error(`Zero pivot at row ${k}`);
    const jn = Math.min(N - 1, k + ku) - k; // number of entries right of the diagonal
    const imax = Math.min(N - 1, k + kl);
    for (let i = k + 1; i <= imax; i++) {
      const ik = i * W + (k - i + kl); // a(i, k)
      const l = a[ik] / piv;
      a[ik] = l;
      if (l === 0) continue;
      for (let t = 1; t <= jn; t++) a[ik + t] -= l * a[kk + t];
    }
  }
  return {
    N,
    pivoting: false,
    solve(rhs, out) {
      if (out !== rhs) out.set(rhs);
      for (let i = 1; i < N; i++) {
        let v = out[i];
        const base = i * W + kl - i; // a(i, j) = a[base + j]
        for (let k = Math.max(0, i - kl); k < i; k++) v -= a[base + k] * out[k];
        out[i] = v;
      }
      for (let i = N - 1; i >= 0; i--) {
        let v = out[i];
        const base = i * W + kl - i;
        const jmax = Math.min(N - 1, i + ku);
        for (let j = i + 1; j <= jmax; j++) v -= a[base + j] * out[j];
        out[i] = v / a[base + i];
      }
    },
  };
}

function factorPivot(A: BandMatrix): BandedLU {
  const { N, kl, ku } = A;
  const ku2 = ku + kl; // upper bandwidth after row exchanges
  const W = kl + ku2 + 1;
  const a = new Float64Array(N * W); // (i, j) at i·W + (j − i + kl)
  for (let i = 0; i < N; i++) {
    const jmax = Math.min(N - 1, i + ku);
    for (let j = Math.max(0, i - kl); j <= jmax; j++) a[i * W + (j - i + kl)] = A.get(i, j);
  }
  const at = (i: number, j: number) => i * W + (j - i + kl);
  const mult = new Float64Array(N * Math.max(kl, 1)); // multiplier of row k+1+r in column k
  const perm = new Int32Array(N);
  for (let k = 0; k < N; k++) {
    const imax = Math.min(N - 1, k + kl);
    let p = k;
    let best = Math.abs(a[at(k, k)]);
    for (let i = k + 1; i <= imax; i++) {
      const v = Math.abs(a[at(i, k)]);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (best === 0 || !Number.isFinite(best)) throw new Error(`Singular matrix at column ${k}`);
    perm[k] = p;
    const jmax = Math.min(N - 1, k + ku2);
    if (p !== k) {
      for (let j = k; j <= jmax; j++) {
        const x = at(k, j);
        const y = at(p, j);
        const t = a[x];
        a[x] = a[y];
        a[y] = t;
      }
    }
    const kk = at(k, k);
    const piv = a[kk];
    for (let i = k + 1; i <= imax; i++) {
      const ik = at(i, k);
      const l = a[ik] / piv;
      a[ik] = 0;
      mult[k * kl + (i - k - 1)] = l;
      if (l === 0) continue;
      for (let t = 1; t <= jmax - k; t++) a[ik + t] -= l * a[kk + t];
    }
  }
  return {
    N,
    pivoting: true,
    solve(rhs, out) {
      if (out !== rhs) out.set(rhs);
      for (let k = 0; k < N; k++) {
        const p = perm[k];
        if (p !== k) {
          const t = out[k];
          out[k] = out[p];
          out[p] = t;
        }
        const bk = out[k];
        if (bk === 0) continue;
        const imax = Math.min(N - 1, k + kl);
        for (let i = k + 1; i <= imax; i++) out[i] -= mult[k * kl + (i - k - 1)] * bk;
      }
      for (let i = N - 1; i >= 0; i--) {
        let v = out[i];
        const base = i * W + kl - i;
        const jmax = Math.min(N - 1, i + ku2);
        for (let j = i + 1; j <= jmax; j++) v -= a[base + j] * out[j];
        out[i] = v / a[base + i];
      }
    },
  };
}
