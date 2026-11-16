import { xOf, yOf, type Grid } from './grid';
import type { PlantParams } from './scenario';

/**
 * A plant on the lattice with its root area: the grid cells whose centre lies within the
 * root radius. `weights` is a cone, 1 − r/r_root (at least one cell, weight 1, if the radius is
 * smaller than the grid spacing).
 */
export interface Plant {
  x: number;
  y: number;
  cells: Int32Array;
  weights: Float64Array;
  weightSum: number;
}

export function plantLattice(g: Grid, pp: PlantParams): Plant[] {
  const { rootRadius: r, spacing, margin } = pp;
  if (!(r > 0)) throw new Error('Root radius must be positive');
  if (spacing < 2 * r) throw new Error('Plant spacing must be at least twice the root radius');
  const xs = positions(margin, g.Lx - margin, spacing);
  const ys = positions(margin, g.Ly - margin, spacing);
  const plants: Plant[] = [];
  for (const y of ys) for (const x of xs) plants.push(rootArea(g, x, y, r));
  return plants;
}

function positions(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let k = 0; lo + k * step <= hi + 1e-9; k++) out.push(lo + k * step);
  return out;
}

export function rootArea(g: Grid, x: number, y: number, r: number): Plant {
  const cells: number[] = [];
  const weights: number[] = [];
  const i0 = Math.max(0, Math.floor((x - r) / g.dx) - 1);
  const i1 = Math.min(g.mx - 1, Math.ceil((x + r) / g.dx));
  const j0 = Math.max(0, Math.floor((y - r) / g.dy) - 1);
  const j1 = Math.min(g.my - 1, Math.ceil((y + r) / g.dy));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(xOf(g, i) - x, yOf(g, j) - y);
      if (d <= r) {
        cells.push(i + g.mx * j);
        weights.push(1 - d / r);
      }
    }
  }
  if (cells.length === 0 || weights.every((w) => w === 0)) {
    // Radius below the grid resolution: use the nearest interior cell.
    const i = Math.min(g.mx - 1, Math.max(0, Math.round(x / g.dx) - 1));
    const j = Math.min(g.my - 1, Math.max(0, Math.round(y / g.dy) - 1));
    cells.length = 0;
    weights.length = 0;
    cells.push(i + g.mx * j);
    weights.push(1);
  }
  return {
    x,
    y,
    cells: Int32Array.from(cells),
    weights: Float64Array.from(weights),
    weightSum: weights.reduce((a, b) => a + b, 0),
  };
}

/** Mean concentration over the root area (all cells have the same size). */
export function rootMean(p: Float64Array, plant: Plant): number {
  let s = 0;
  for (const k of plant.cells) s += p[k];
  return s / plant.cells.length;
}

/** Add `spores` spores as a cone over the root area; cellGrams = soil mass of one cell [g]. */
export function addCone(p: Float64Array, plant: Plant, spores: number, cellGrams: number): void {
  const f = spores / (plant.weightSum * cellGrams);
  for (let q = 0; q < plant.cells.length; q++) p[plant.cells[q]] += f * plant.weights[q];
}

/** Add a cone whose mean concentration over the root area is `mean`. */
export function addConeWithMean(p: Float64Array, plant: Plant, mean: number): void {
  const f = (mean * plant.cells.length) / plant.weightSum;
  for (let q = 0; q < plant.cells.length; q++) p[plant.cells[q]] += f * plant.weights[q];
}

export const PlantState = {
  /** Not planted this season (non-host season, or not a volunteer). */
  Absent: 0,
  Healthy: 1,
  Infected: 2,
  /** Galls burst and released spores; dead for the rest of the season. */
  Burst: 3,
} as const;
export type PlantState = (typeof PlantState)[keyof typeof PlantState];

/**
 * Plant population state. Gall development is counted in time steps of host growth: the
 * countdown pauses while the crop is dormant.
 */
export class PlantPopulation {
  readonly state: Uint8Array;
  readonly countdown: Int32Array;

  constructor(readonly plants: Plant[]) {
    this.state = new Uint8Array(plants.length);
    this.countdown = new Int32Array(plants.length);
  }

  /** New season: the given plants are healthy, all others absent. */
  replant(active: Iterable<number> | 'all'): void {
    this.state.fill(active === 'all' ? PlantState.Healthy : PlantState.Absent);
    this.countdown.fill(0);
    if (active !== 'all') for (const i of active) this.state[i] = PlantState.Healthy;
  }

  count(s: PlantState): number {
    let n = 0;
    for (const v of this.state) if (v === s) n++;
    return n;
  }

  /**
   * One time step during host growth: infected plants count down and burst when ready, then
   * healthy plants whose root-area mean reaches the threshold become infected.
   * Returns the number of bursts.
   */
  growthStep(
    p: Float64Array,
    threshold: number,
    gallSteps: number,
    release: (plant: Plant) => void,
  ): number {
    let bursts = 0;
    for (let i = 0; i < this.plants.length; i++) {
      const s = this.state[i];
      if (s === PlantState.Infected) {
        if (--this.countdown[i] <= 0) {
          this.state[i] = PlantState.Burst;
          release(this.plants[i]);
          bursts++;
        }
      } else if (s === PlantState.Healthy && rootMean(p, this.plants[i]) >= threshold) {
        this.state[i] = PlantState.Infected;
        this.countdown[i] = gallSteps;
      }
    }
    return bursts;
  }

  /** Harvest or end of season: all galls still in the soil release their spores. */
  burstAllInfected(release: (plant: Plant) => void): number {
    let bursts = 0;
    for (let i = 0; i < this.plants.length; i++) {
      if (this.state[i] === PlantState.Infected) {
        this.state[i] = PlantState.Burst;
        release(this.plants[i]);
        bursts++;
      }
    }
    return bursts;
  }

  /** Index of the plant closest to (x, y). */
  nearest(x: number, y: number): number {
    let best = 0;
    let bd = Infinity;
    this.plants.forEach((pl, i) => {
      const d = (pl.x - x) ** 2 + (pl.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
}
