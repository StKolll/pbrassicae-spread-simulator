import { buildCalendar, type WeekInfo } from './calendar';
import { makeGrid, type Grid } from './grid';
import { assembleTransport } from './operators';
import { PlantPopulation, PlantState, addCone, addConeWithMean, plantLattice } from './plants';
import { mulberry32, sampleIndices } from './rng';
import { Ros2Stepper, decayRate } from './ros2';
import { cellSoilGrams, type Scenario } from './scenario';

export interface SeriesPoint {
  /** End of this simulation week (weeks since start). */
  week: number;
  month: number;
  seasonIndex: number;
  /** Total spores in the field. */
  totalSpores: number;
  meanP: number;
  maxP: number;
  minP: number;
  healthy: number;
  infected: number;
  /** Plants whose galls have burst so far this season. */
  burst: number;
  /** Bursts during this week. */
  newBursts: number;
  /** Plants in this season that ever reached the threshold (infected + burst). */
  diseased: number;
  /** Planted (non-absent) plants this season. */
  planted: number;
}

export interface Frame {
  week: number;
  p: Float32Array;
  plantStates: Uint8Array;
}

export interface SimResult {
  grid: Grid;
  plants: { x: number; y: number }[];
  calendar: WeekInfo[];
  frames: Frame[];
  series: SeriesPoint[];
  /** Spores at t = 0, released by galls, removed by pesticide. */
  budget: { initial: number; released: number; pesticide: number };
  factorizations: number;
  cancelled: boolean;
}

export interface SimOptions {
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
  /** Called for every snapshot (the frame may be transferred; it is not reused). */
  onFrame?: (frame: Frame) => void;
  /** Called after every simulated week. */
  onWeek?: (point: SeriesPoint) => void;
  /** Called once before the first snapshot. */
  onStart?: (info: Pick<SimResult, 'grid' | 'plants' | 'calendar'>) => void;
  /** Keep frames in the result (default true). Streaming callers can set false. */
  storeFrames?: boolean;
}

/** Run a whole scenario. Pure: no DOM, no globals; safe to call in a worker. */
export function simulate(sc: Scenario, opts: SimOptions = {}): SimResult {
  const g = makeGrid(sc.grid);
  const stepsPerWeek = Math.round(1 / sc.tau);
  if (Math.abs(stepsPerWeek * sc.tau - 1) > 1e-12) {
    throw new Error('The time step must divide one week (1, 1/2, 1/4, 1/8, …)');
  }
  const bio = sc.biology;
  const gallSteps = Math.max(1, Math.round(bio.gallWeeks * stepsPerWeek));
  const cellGrams = cellSoilGrams(g.dx, g.dy, bio);
  const kappa = decayRate(bio.halfLifeYears);
  const cal = buildCalendar(sc.rotation, sc.crops);
  const volunteerCrop = sc.crops.find((c) => c.name === sc.volunteerCrop);

  const stepper = new Ros2Stepper(assembleTransport(g, sc.transport), sc.tau, {
    solver: sc.solver,
  });
  const pop = new PlantPopulation(plantLattice(g, sc.plants));
  const nPlants = pop.plants.length;
  const rand = mulberry32(sc.initial.seed);
  const p = new Float64Array(g.N);

  // Initial infection: cones with mean concentration in [1, p0]·c* at random (or given) plants.
  const init = sc.initial;
  const initIdx = init.positions?.length
    ? init.positions.map(([x, y]) => pop.nearest(x, y))
    : sampleIndices(nPlants, Math.min(init.count, nPlants), rand);
  for (const i of initIdx) {
    const f = 1 + rand() * Math.max(0, init.maxIntensity - 1);
    addConeWithMean(p, pop.plants[i], f * bio.threshold);
  }

  const totalSpores = () => {
    let s = 0;
    for (let k = 0; k < g.N; k++) s += p[k];
    return s * cellGrams;
  };
  const budget = { initial: totalSpores(), released: 0, pesticide: 0 };
  const release = (plant: (typeof pop.plants)[number]) => {
    const spores = bio.rainKept * bio.sporesPerPlant;
    addCone(p, plant, spores, cellGrams);
    budget.released += spores;
  };

  const frames: Frame[] = [];
  const storeFrames = opts.storeFrames ?? true;
  const snapshot = (week: number) => {
    const f = { week, p: Float32Array.from(p), plantStates: Uint8Array.from(pop.state) };
    if (storeFrames) frames.push(f);
    opts.onFrame?.(f);
  };
  const plantPositions = pop.plants.map(({ x, y }) => ({ x, y }));
  opts.onStart?.({ grid: g, plants: plantPositions, calendar: cal });
  snapshot(0);

  const series: SeriesPoint[] = [];
  let seasonIsHost = false;
  let seasonHasVolunteers = false;
  let cancelled = false;

  for (let w = 0; w < cal.length; w++) {
    const info = cal[w];
    const season = sc.rotation[info.seasonIndex];
    const lastWeekOfSeason = w + 1 === cal.length || cal[w + 1].seasonIndex !== info.seasonIndex;

    if (info.weekInSeason === 0) {
      seasonIsHost = info.crop.isHost;
      const k = season.volunteers ?? 0;
      seasonHasVolunteers = !seasonIsHost && k > 0 && volunteerCrop !== undefined;
      if (seasonIsHost) pop.replant('all');
      else if (seasonHasVolunteers) pop.replant(sampleIndices(nPlants, Math.min(k, nPlants), rand));
      else pop.replant([]);
    }

    for (const ev of season.pesticide ?? []) {
      if (ev.week === info.weekInSeason) {
        const before = totalSpores();
        const keep = 1 - ev.killFraction;
        for (let k = 0; k < g.N; k++) p[k] *= keep;
        budget.pesticide += before * ev.killFraction;
      }
    }

    // Phase that drives the plants this week.
    const plantPhase = seasonIsHost
      ? info.phase
      : seasonHasVolunteers
        ? volunteerCrop!.months[info.month]
        : 'dormant';
    const kEff = kappa * (bio.seasonalDecay?.[info.month] ?? 1);

    let newBursts = 0;
    for (let s = 0; s < stepsPerWeek; s++) {
      stepper.step(p, kEff);
      if (plantPhase === 'growth') {
        newBursts += pop.growthStep(p, bio.threshold, gallSteps, release);
      } else if (plantPhase === 'harvest') {
        newBursts += pop.burstAllInfected(release);
      }
    }
    if (lastWeekOfSeason) newBursts += pop.burstAllInfected(release);

    let max = -Infinity;
    let min = Infinity;
    let sum = 0;
    for (let k = 0; k < g.N; k++) {
      const v = p[k];
      sum += v;
      if (v > max) max = v;
      if (v < min) min = v;
    }
    const infected = pop.count(PlantState.Infected);
    const burst = pop.count(PlantState.Burst);
    const point: SeriesPoint = {
      week: w + 1,
      month: info.month,
      seasonIndex: info.seasonIndex,
      totalSpores: sum * cellGrams,
      meanP: sum / g.N,
      maxP: max,
      minP: min,
      healthy: pop.count(PlantState.Healthy),
      infected,
      burst,
      newBursts,
      diseased: infected + burst,
      planted: nPlants - pop.count(PlantState.Absent),
    };
    series.push(point);
    opts.onWeek?.(point);
    if ((w + 1) % sc.snapshotEveryWeeks === 0 || w + 1 === cal.length) snapshot(w + 1);

    opts.onProgress?.((w + 1) / cal.length);
    if (opts.shouldCancel?.()) {
      cancelled = true;
      break;
    }
  }

  return {
    grid: g,
    plants: plantPositions,
    calendar: cal,
    frames,
    series,
    budget,
    factorizations: stepper.factorizations,
    cancelled,
  };
}
