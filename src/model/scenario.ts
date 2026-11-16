import type { LinearSolver } from './ros2';
import type { Crop, GridParams, Season, TransportParams } from './types';

/** Biological parameters. Concentrations are resting spores per gram of soil. */
export interface BiologyParams {
  /** Half-life of resting spores [years]. */
  halfLifeYears: number;
  /** Optional decay multiplier per calendar month (12 values, 1 = normal); null = all 1. */
  seasonalDecay: number[] | null;
  /** Gall development time ω [weeks of host growth] from infection to spore release. */
  gallWeeks: number;
  /** Infection threshold c* [spores/g soil]: mean concentration over the root area. */
  threshold: number;
  /** Spores released by one infected plant Y [spores]. */
  sporesPerPlant: number;
  /** Fraction of released spores that stays in the topsoil, r_rain ∈ [0, 1]. */
  rainKept: number;
  /** Soil bulk density ζ [kg/m³]. */
  soilDensity: number;
  /** Depth of the topsoil layer d [m]. */
  topsoilDepth: number;
}

export interface PlantParams {
  /** Root radius [m]; the root area is a disc of this radius. */
  rootRadius: number;
  /** Distance between plants on the square lattice [m]. */
  spacing: number;
  /** Distance from the field edge to the first plant row [m]. */
  margin: number;
}

export interface InitialInfection {
  /** Number of initially infected plants (random positions unless `positions` is given). */
  count: number;
  /** Maximum initial intensity as a multiple of the threshold (mean over root area ∈ [1, p0]·c*). */
  maxIntensity: number;
  seed: number;
  /** Optional explicit positions [x, y] in metres; snapped to the nearest plant. */
  positions?: [number, number][];
}

export interface Scenario {
  name: string;
  grid: GridParams;
  transport: TransportParams;
  /** Time step τ [weeks]; must divide one week (1, 1/2, 1/4, 1/8). */
  tau: number;
  /** Linear solver: 'banded' (exact LU, default) or 'amf' (fast approximate factorisation;
   *  only accurate for diffusion numbers β·τ/dx² below about 0.1, see limits.ts). */
  solver: LinearSolver;
  biology: BiologyParams;
  plants: PlantParams;
  initial: InitialInfection;
  crops: Crop[];
  rotation: Season[];
  /** Crop whose calendar volunteer plants follow in non-host seasons. */
  volunteerCrop: string;
  /** Store a field snapshot every this many weeks. */
  snapshotEveryWeeks: number;
}

/** Grams of soil in one grid cell: dx·dy·d·ζ·1000. */
export function cellSoilGrams(dx: number, dy: number, b: BiologyParams): number {
  return dx * dy * b.topsoilDepth * b.soilDensity * 1000;
}
