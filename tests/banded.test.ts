import { describe, expect, it } from 'vitest';
import { BandMatrix, factor } from '../src/model/banded';

/** Deterministic pseudo-random numbers in [−1, 1). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

function randomBand(N: number, kl: number, ku: number, diag: number, seed: number) {
  const r = rng(seed);
  const A = new BandMatrix(N, kl, ku);
  for (let i = 0; i < N; i++) {
    for (let j = Math.max(0, i - kl); j <= Math.min(N - 1, i + ku); j++) {
      A.set(i, j, r() + (i === j ? diag : 0));
    }
  }
  return A;
}

function residual(A: BandMatrix, x: Float64Array, b: Float64Array) {
  let m = 0;
  for (let i = 0; i < A.N; i++) {
    let v = -b[i];
    for (let j = Math.max(0, i - A.kl); j <= Math.min(A.N - 1, i + A.ku); j++) {
      v += A.get(i, j) * x[j];
    }
    m = Math.max(m, Math.abs(v));
  }
  return m;
}

describe('banded LU', () => {
  const N = 200;
  const b = Float64Array.from({ length: N }, (_, i) => Math.sin(i));

  it('solves a diagonally dominant system without pivoting', () => {
    const A = randomBand(N, 7, 7, 20, 1);
    expect(A.isColumnDiagonallyDominant()).toBe(true);
    const lu = factor(A);
    expect(lu.pivoting).toBe(false);
    const x = new Float64Array(N);
    lu.solve(b, x);
    expect(residual(A, x, b)).toBeLessThan(1e-12);
  });

  it('solves a non-dominant system with partial pivoting', () => {
    const A = randomBand(N, 5, 5, 0, 2);
    // A zero on the diagonal forces a row exchange.
    A.set(3, 3, 0);
    const lu = factor(A);
    expect(lu.pivoting).toBe(true);
    const x = new Float64Array(N);
    lu.solve(b, x);
    expect(residual(A, x, b)).toBeLessThan(1e-9);
  });

  it('gives the same answer with and without pivoting on a dominant matrix', () => {
    const A = randomBand(N, 4, 4, 12, 3);
    const x1 = new Float64Array(N);
    const x2 = new Float64Array(N);
    factor(A, { pivoting: false }).solve(b, x1);
    factor(A, { pivoting: true }).solve(b, x2);
    for (let i = 0; i < N; i++) expect(x1[i]).toBeCloseTo(x2[i], 12);
  });

  it('solves in place', () => {
    const A = randomBand(50, 3, 3, 10, 4);
    const bb = Float64Array.from({ length: 50 }, (_, i) => i);
    const x = Float64Array.from(bb);
    factor(A).solve(x, x);
    expect(residual(A, x, bb)).toBeLessThan(1e-12);
  });
});
