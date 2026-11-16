/** Shared model types. All times in weeks, lengths in metres. */

export type BoundaryCondition = 'dirichlet' | 'zeroFlux';
export type AdvectionScheme = 'upwind' | 'central';

export type VelocityPresetKind = 'none' | 'uniform' | 'centerDepression' | 'unilateralDepression';

export interface VelocityConfig {
  preset: VelocityPresetKind;
  /** Maximum water velocity [m/week]. */
  vmax: number;
  /** Flow direction for `uniform` and `unilateralDepression` [degrees, 0 = +x, 90 = +y]. */
  angleDeg: number;
}

export type MonthPhase = 'growth' | 'dormant' | 'harvest';

export interface Crop {
  name: string;
  isHost: boolean;
  /** Phase per calendar month, index 0 = January. Length 12. */
  months: MonthPhase[];
}

export interface Season {
  /** Name of a crop in `Scenario.crops`. */
  crop: string;
  /** Calendar month the season starts in, 0 = January. */
  startMonth: number;
  /** Season length in months (default 12). */
  lengthMonths: number;
  /** Number of brassica volunteer plants in a non-host season (0 = none). */
  volunteers?: number;
  /** Pesticide events within this season. */
  pesticide?: PesticideEvent[];
}

export interface PesticideEvent {
  /** Week offset from the start of the season. */
  week: number;
  /** Fraction of spores killed, 0..1. */
  killFraction: number;
}

export interface TransportParams {
  /** Diffusion coefficient β [m²/week]. */
  beta: number;
  velocity: VelocityConfig;
  scheme: AdvectionScheme;
  boundary: BoundaryCondition;
}

export interface GridParams {
  Lx: number;
  Ly: number;
  /** Grid points per direction including the two boundary points. */
  nx: number;
  ny: number;
}
