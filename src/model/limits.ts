import { buildCalendar } from './calendar';
import { makeGrid } from './grid';
import { maxCellPeclet, maxCourant } from './operators';
import { plantLattice } from './plants';
import type { Scenario } from './scenario';

/**
 * Safety limits and cost estimate. Everything here is cheap (no simulation), so the UI can
 * call it on every parameter change.
 */
export const LIMITS = {
  minGridPoints: 11,
  maxGridPoints: 151,
  warnGridPoints: 101,
  maxSteps: 20_000,
  maxYears: 30,
  /** Hard limit on the estimated run time [s]; the worker is also stopped after `timeoutSeconds`. */
  maxSeconds: 90,
  warnSeconds: 20,
  timeoutSeconds: 120,
  maxFrameBytes: 200 * 1024 * 1024,
  maxPeclet: 1,
  maxCourant: 5,
  /** AMF solver: warn above, refuse above this diffusion number β·τ/min(dx,dy)². */
  amfWarnDiffusionNumber: 0.1,
  amfMaxDiffusionNumber: 1,
} as const;

/** Diffusion number β·τ/h² with h the smaller grid spacing. */
export function diffusionNumber(sc: Scenario): number {
  const h = Math.min(sc.grid.Lx / (sc.grid.nx - 1), sc.grid.Ly / (sc.grid.ny - 1));
  return (sc.transport.beta * sc.tau) / (h * h);
}

/**
 * Cost model, calibrated in Node 24 and in an Edge web worker (2026-11-15; the browser is up to
 * 1.5× slower for the banded solver, and timings on a busy laptop vary by 2–3×):
 * banded step ≈ 22 ns · N · b, banded factorisation ≈ 4 ns · N · b², AMF step ≈ 150 ns · N,
 * plant update ≈ 250 ns per plant and step.
 */
const COST = { bandedStep: 22e-9, bandedFactor: 4e-9, amfStep: 150e-9, plantStep: 250e-9 };

export type IssueLevel = 'error' | 'warning';
export interface Issue {
  level: IssueLevel;
  message: string;
}

export interface CostEstimate {
  /** Unknowns and bandwidth. */
  N: number;
  bandwidth: number;
  weeks: number;
  steps: number;
  plants: number;
  /** Distinct decay values (one factorisation each). */
  factorizations: number;
  seconds: number;
  /** Snapshot interval after automatic thinning [weeks]. */
  snapshotEveryWeeks: number;
  frames: number;
  frameBytes: number;
}

export interface Assessment {
  cost: CostEstimate | null;
  issues: Issue[];
  /** True if no errors: the run may start (warnings only ask for confirmation). */
  ok: boolean;
}

export function assess(sc: Scenario): Assessment {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ level: 'error', message });
  const warn = (message: string) => issues.push({ level: 'warning', message });
  const done = (cost: CostEstimate | null): Assessment => ({
    cost,
    issues,
    ok: !issues.some((i) => i.level === 'error'),
  });

  // --- Grid -------------------------------------------------------------------------------
  const { nx, ny, Lx, Ly } = sc.grid;
  for (const [name, n] of [['nx', nx], ['ny', ny]] as const) {
    if (!Number.isInteger(n)) err(`${name} must be a whole number.`);
    else if (n < LIMITS.minGridPoints) err(`${name} must be at least ${LIMITS.minGridPoints}.`);
    else if (n > LIMITS.maxGridPoints) err(`${name} must be at most ${LIMITS.maxGridPoints}.`);
    else if (n > LIMITS.warnGridPoints) warn(`${name} = ${n} is a fine grid; runs will be slow.`);
  }
  if (!(Lx > 0 && Ly > 0)) err('Field size must be positive.');
  if (issues.some((i) => i.level === 'error')) return done(null);
  const g = makeGrid(sc.grid);

  // --- Time -------------------------------------------------------------------------------
  const stepsPerWeek = Math.round(1 / sc.tau);
  if (!(sc.tau > 0) || Math.abs(stepsPerWeek * sc.tau - 1) > 1e-9) {
    err('The time step must divide one week (1, 1/2, 1/4, 1/8 week).');
    return done(null);
  }
  let weeks = 0;
  try {
    weeks = buildCalendar(sc.rotation, sc.crops).length;
  } catch (e) {
    err(`Crop rotation: ${(e as Error).message}.`);
    return done(null);
  }
  const steps = weeks * stepsPerWeek;
  if (weeks / 52 > LIMITS.maxYears) err(`At most ${LIMITS.maxYears} years can be simulated.`);
  if (steps > LIMITS.maxSteps) {
    err(`${steps} time steps exceed the limit of ${LIMITS.maxSteps}; use a larger time step.`);
  }

  // --- Rotation details -------------------------------------------------------------------
  const cropNames = new Set(sc.crops.map((c) => c.name));
  if (sc.rotation.some((s) => (s.volunteers ?? 0) > 0) && !cropNames.has(sc.volunteerCrop)) {
    err(`Volunteer crop "${sc.volunteerCrop}" is not defined.`);
  }
  sc.rotation.forEach((s, i) => {
    const seasonWeeks = Math.round((s.lengthMonths * 52) / 12);
    for (const ev of s.pesticide ?? []) {
      if (!(ev.killFraction >= 0 && ev.killFraction <= 1)) {
        err(`Season ${i + 1}: pesticide kill fraction must be between 0 and 1.`);
      }
      if (!(ev.week >= 0 && ev.week < seasonWeeks + 1)) {
        warn(`Season ${i + 1}: pesticide week ${ev.week} lies outside the season.`);
      }
    }
  });

  // --- Biology ----------------------------------------------------------------------------
  const b = sc.biology;
  const positive: [string, number][] = [
    ['Half-life', b.halfLifeYears],
    ['Infection threshold', b.threshold],
    ['Soil density', b.soilDensity],
    ['Topsoil depth', b.topsoilDepth],
    ['Gall development time', b.gallWeeks],
  ];
  for (const [name, v] of positive) if (!(v > 0)) err(`${name} must be positive.`);
  if (!(b.sporesPerPlant >= 0)) err('Spores per plant must not be negative.');
  if (!(b.rainKept >= 0 && b.rainKept <= 1)) err('Rain washout fraction must be between 0 and 1.');
  if (b.gallWeeks > 0 && b.gallWeeks < sc.tau) {
    err('Gall development time must be at least one time step.');
  } else if (Math.abs(b.gallWeeks * stepsPerWeek - Math.round(b.gallWeeks * stepsPerWeek)) > 1e-9) {
    warn('Gall development time is not a multiple of the time step; it will be rounded.');
  }
  if (b.seasonalDecay && (b.seasonalDecay.length !== 12 || b.seasonalDecay.some((m) => !(m >= 0)))) {
    err('Seasonal decay needs 12 non-negative monthly factors.');
  }
  if (!(sc.transport.beta >= 0)) err('Diffusion coefficient must not be negative.');
  if (!(sc.transport.velocity.vmax >= 0)) err('Water velocity must not be negative.');

  // --- Plants -----------------------------------------------------------------------------
  const pp = sc.plants;
  let plants = 0;
  if (!(pp.rootRadius > 0)) err('Root radius must be positive.');
  else if (pp.spacing < 2 * pp.rootRadius) err('Plant spacing must be at least twice the root radius.');
  else if (pp.margin < pp.rootRadius) err('Border margin must be at least the root radius.');
  else {
    plants = plantLattice(g, pp).length;
    if (plants === 0) err('No plant fits into the field with this spacing and margin.');
    if (pp.rootRadius < Math.min(g.dx, g.dy)) {
      warn('The root radius is smaller than one grid cell; refine the grid for meaningful root areas.');
    }
  }
  const init = sc.initial;
  if (!init.positions?.length) {
    if (!(init.count >= 0 && Number.isInteger(init.count))) err('Number of infected plants must be a whole number ≥ 0.');
    else if (plants > 0 && init.count > plants) err(`Only ${plants} plants fit; reduce the initially infected plants.`);
  }
  if (!(init.maxIntensity >= 1)) err('Maximum initial intensity must be at least 1 (× threshold).');

  // --- Numerics warnings ------------------------------------------------------------------
  const tp = sc.transport;
  // The AMF solver barely damps grid-scale components that are stiff in both directions,
  // so sharp spore cones survive and oscillate. Measured against the exact solver on the
  // presets: error ≈ 1 % at d = 0.03, ≈ 8 % at d = 0.15, > 100 % at d ≥ 1.
  if (sc.solver === 'amf') {
    const d = diffusionNumber(sc);
    const msg = `diffusion number β·τ/dx² = ${fmt(d)}`;
    if (d > LIMITS.amfMaxDiffusionNumber) {
      err(`The fast (AMF) solver is unusable at ${msg} (> ${LIMITS.amfMaxDiffusionNumber}): it would produce large negative concentrations. Use the exact solver.`);
    } else if (d > LIMITS.amfWarnDiffusionNumber) {
      warn(`The fast (AMF) solver is inaccurate at ${msg}; errors of several percent or more. The exact solver is recommended.`);
    }
  }
  if (tp.velocity.preset !== 'none' && tp.velocity.vmax > 0) {
    if (tp.scheme === 'central') {
      const pe = maxCellPeclet(g, tp);
      if (pe > LIMITS.maxPeclet) {
        warn(`Cell Péclet number ${fmt(pe)} > 1: central advection may oscillate; use upwind or refine the grid.`);
      }
    }
    const co = maxCourant(g, tp, sc.tau);
    if (co > LIMITS.maxCourant) {
      warn(`Courant number ${fmt(co)} > ${LIMITS.maxCourant}: the time step is large for this flow; results get inaccurate.`);
    }
  }

  // --- Cost -------------------------------------------------------------------------------
  const N = g.N;
  const bw = g.mx;
  const factorizations = b.seasonalDecay ? new Set(b.seasonalDecay).size : 1;
  const stepCost = sc.solver === 'amf' ? COST.amfStep * N : COST.bandedStep * N * bw;
  const factorCost = sc.solver === 'amf' ? 1e-6 * N : COST.bandedFactor * N * bw * bw;
  const seconds = steps * (stepCost + COST.plantStep * plants) + factorizations * factorCost;
  if (seconds > LIMITS.maxSeconds) {
    err(`Estimated run time ${fmtTime(seconds)} exceeds the limit of ${LIMITS.maxSeconds} s. Use a coarser grid, a larger time step or a shorter rotation.`);
  } else if (seconds > LIMITS.warnSeconds) {
    warn(`Estimated run time ${fmtTime(seconds)}.`);
  }

  // Frames: thin snapshots automatically to stay within the memory budget.
  const frameSize = N * 4 + plants;
  let every = Math.max(1, Math.round(sc.snapshotEveryWeeks));
  const framesFor = (e: number) => Math.floor(weeks / e) + 2;
  while (framesFor(every) * frameSize > LIMITS.maxFrameBytes) every++;
  if (every !== Math.max(1, Math.round(sc.snapshotEveryWeeks))) {
    warn(`Snapshots thinned to one every ${every} weeks to stay below ${LIMITS.maxFrameBytes / 2 ** 20} MB.`);
  }
  const frames = framesFor(every);

  return done({
    N,
    bandwidth: bw,
    weeks,
    steps,
    plants,
    factorizations,
    seconds,
    snapshotEveryWeeks: every,
    frames,
    frameBytes: frames * frameSize,
  });
}

const fmt = (x: number) => (x >= 100 ? x.toFixed(0) : x.toPrecision(2));
export const fmtTime = (s: number) => (s < 1 ? `${Math.max(0.1, s).toFixed(1)} s` : s < 90 ? `${s.toFixed(0)} s` : `${(s / 60).toFixed(1)} min`);
