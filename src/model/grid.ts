import type { GridParams } from './types';

/**
 * Vertex grid with nx × ny points; the unknowns are the (nx−2)·(ny−2) interior points.
 * Each interior point is the centre of a finite-volume cell of size dx × dy.
 * Flattened index k = i + mx·j with i ∈ [0, mx), j ∈ [0, my).
 */
export interface Grid extends GridParams {
  dx: number;
  dy: number;
  mx: number;
  my: number;
  N: number;
}

export function makeGrid(params: GridParams): Grid {
  const { Lx, Ly, nx, ny } = params;
  if (!(nx >= 3 && ny >= 3)) throw new Error('Grid needs at least 3 points per direction');
  if (!Number.isInteger(nx) || !Number.isInteger(ny)) throw new Error('nx, ny must be integers');
  if (!(Lx > 0 && Ly > 0)) throw new Error('Field size must be positive');
  const mx = nx - 2;
  const my = ny - 2;
  return { Lx, Ly, nx, ny, dx: Lx / (nx - 1), dy: Ly / (ny - 1), mx, my, N: mx * my };
}

/** x coordinate of interior column i. */
export const xOf = (g: Grid, i: number) => (i + 1) * g.dx;
/** y coordinate of interior row j. */
export const yOf = (g: Grid, j: number) => (j + 1) * g.dy;
export const idx = (g: Grid, i: number, j: number) => i + g.mx * j;

/** Fill a field from a function of (x, y). */
export function sampleField(g: Grid, f: (x: number, y: number) => number): Float64Array {
  const p = new Float64Array(g.N);
  for (let j = 0; j < g.my; j++) {
    const y = yOf(g, j);
    for (let i = 0; i < g.mx; i++) p[i + g.mx * j] = f(xOf(g, i), y);
  }
  return p;
}

/** ∫ p dA over the field (sum of cell values × cell area). */
export function integral(g: Grid, p: ArrayLike<number>): number {
  let s = 0;
  for (let k = 0; k < g.N; k++) s += p[k];
  return s * g.dx * g.dy;
}
