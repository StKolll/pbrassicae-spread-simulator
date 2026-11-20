import { LIMITS, assess, type Issue } from '../model/limits';
import type { Scenario } from '../model/scenario';
import { fmtNum } from './theme';

/**
 * Parameter sweep: one base scenario, one parameter, several values. Each value becomes its
 * own scenario and run. Only parameters that leave the grid and the calendar unchanged can be
 * swept, so all runs share the same weeks and snapshots and can be shown side by side.
 */
export interface SweepParam {
  id: string;
  label: string;
  unit?: string;
  /** Suggest values on a log scale (×3 steps) instead of a linear one. */
  log: boolean;
  integer?: boolean;
  /** Smallest and largest sensible value (suggestions are clamped to this range). */
  min: number;
  max: number;
  get(sc: Scenario): number;
  set(draft: Scenario, v: number): void;
  /** Why this parameter cannot be swept for `sc`, or null if it can. */
  unavailable?(sc: Scenario): string | null;
}

const pesticideEvents = (sc: Scenario) => sc.rotation.flatMap((s) => s.pesticide ?? []);

export const SWEEP_PARAMS: SweepParam[] = [
  {
    id: 'beta',
    label: 'Diffusion β',
    unit: 'm²/week',
    log: true,
    min: 1e-4,
    max: 10,
    get: (sc) => sc.transport.beta,
    set: (d, v) => void (d.transport.beta = v),
  },
  {
    id: 'vmax',
    label: 'Max water velocity',
    unit: 'm/week',
    log: false,
    min: 0,
    max: 10,
    get: (sc) => sc.transport.velocity.vmax,
    set: (d, v) => void (d.transport.velocity.vmax = v),
    unavailable: (sc) => (sc.transport.velocity.preset === 'none' ? 'Choose a water flow under "Spore transport" first.' : null),
  },
  {
    id: 'halfLife',
    label: 'Spore half-life',
    unit: 'years',
    log: false,
    min: 0.5,
    max: 20,
    get: (sc) => sc.biology.halfLifeYears,
    set: (d, v) => void (d.biology.halfLifeYears = v),
  },
  {
    id: 'threshold',
    label: 'Infection threshold c*',
    unit: 'spores/g',
    log: true,
    min: 1e2,
    max: 1e7,
    get: (sc) => sc.biology.threshold,
    set: (d, v) => void (d.biology.threshold = v),
  },
  {
    id: 'spores',
    label: 'Spores per infected plant',
    unit: 'spores',
    log: true,
    min: 1e8,
    max: 1e12,
    get: (sc) => sc.biology.sporesPerPlant,
    set: (d, v) => void (d.biology.sporesPerPlant = v),
  },
  {
    id: 'gallWeeks',
    label: 'Gall development time',
    unit: 'weeks',
    log: false,
    integer: true,
    min: 2,
    max: 16,
    get: (sc) => sc.biology.gallWeeks,
    set: (d, v) => void (d.biology.gallWeeks = v),
  },
  {
    id: 'rainKept',
    label: 'Spores kept in topsoil',
    unit: 'fraction',
    log: false,
    min: 0,
    max: 1,
    get: (sc) => sc.biology.rainKept,
    set: (d, v) => void (d.biology.rainKept = v),
  },
  {
    id: 'pesticide',
    label: 'Pesticide kill fraction (all events)',
    unit: 'fraction',
    log: false,
    min: 0,
    max: 1,
    get: (sc) => pesticideEvents(sc)[0]?.killFraction ?? 0,
    set: (d, v) => pesticideEvents(d).forEach((e) => (e.killFraction = v)),
    unavailable: (sc) => (pesticideEvents(sc).length ? null : 'The rotation has no pesticide events.'),
  },
  {
    id: 'initialCount',
    label: 'Initially infected plants',
    log: false,
    integer: true,
    min: 0,
    max: 1e6,
    get: (sc) => sc.initial.count,
    set: (d, v) => void (d.initial.count = v),
    unavailable: (sc) => (sc.initial.positions?.length ? 'The initial infections have fixed positions.' : null),
  },
  {
    id: 'seed',
    label: 'Random seed (repeat with other positions)',
    log: false,
    integer: true,
    min: 0,
    max: 2 ** 31,
    get: (sc) => sc.initial.seed,
    set: (d, v) => void (d.initial.seed = v),
    unavailable: (sc) => (sc.initial.positions?.length ? 'The initial infections have fixed positions.' : null),
  },
];

export const MAX_SWEEP_VALUES = 5;

export const sweepParam = (id: string) => SWEEP_PARAMS.find((p) => p.id === id) ?? SWEEP_PARAMS[0];

/** Parse "0.003, 0.01; 0.03 1e-1" into numbers. */
export function parseValues(text: string, p: SweepParam): { values: number[]; error: string | null } {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const values: number[] = [];
  for (const s of parts) {
    const v = Number(s);
    if (!Number.isFinite(v)) return { values, error: `"${s}" is not a number.` };
    if (p.integer && !Number.isInteger(v)) return { values, error: `${p.label} must be a whole number.` };
    if (v < p.min || v > p.max) return { values, error: `${fmtNum(v, 3)} is outside ${fmtNum(p.min)}–${fmtNum(p.max)}.` };
    if (!values.includes(v)) values.push(v);
  }
  if (values.length < 2) return { values, error: 'Enter at least two different values.' };
  if (values.length > MAX_SWEEP_VALUES) return { values, error: `At most ${MAX_SWEEP_VALUES} values.` };
  return { values: values.sort((a, b) => a - b), error: null };
}

const round3 = (v: number) => Number(v.toPrecision(3));

/** Three values around the current one: ÷3, ×1, ×3 (log) or −50 %, ×1, +50 % (linear). */
export function suggestValues(p: SweepParam, current: number): number[] {
  let raw: number[];
  if (p.id === 'seed') raw = [current, current + 1, current + 2];
  else if (p.log) raw = [current / 3, current, current * 3];
  else if (current === 0) raw = [0, (p.max - p.min) / 4, (p.max - p.min) / 2];
  else raw = [current * 0.5, current, current * 1.5];
  const vals = raw.map((v) => Math.min(p.max, Math.max(p.min, p.integer ? Math.round(v) : round3(v))));
  return [...new Set(vals)].sort((a, b) => a - b);
}

export const formatValues = (values: number[]) => values.map((v) => fmtNum(v, 3)).join(', ');

export interface SweepRunSpec {
  value: number;
  label: string;
  scenario: Scenario;
}

export interface SweepPlan {
  runs: SweepRunSpec[];
  /** Errors per value (the sweep cannot start while there are any). */
  errors: Issue[];
  /** Warnings, each listed once with the values it applies to. */
  warnings: Issue[];
  /** Estimated wall time with `parallel` runs at once [s]. */
  seconds: number;
  parallel: number;
}

/** How many runs to compute at once: leave one core for the page. */
export function parallelRuns(n: number, cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2): number {
  return Math.max(1, Math.min(n, Math.max(1, (cores || 2) - 1), 4));
}

/**
 * One scenario per value. Snapshots are thinned so that all runs together stay within the
 * single-run frame memory budget.
 */
export function planSweep(base: Scenario, p: SweepParam, values: number[], cores?: number): SweepPlan {
  const runs: SweepRunSpec[] = [];
  const errors: Issue[] = [];
  const warnMap = new Map<string, string[]>();
  let total = 0;
  let longest = 0;
  for (const value of values) {
    const label = `${fmtNum(value, 3)}`;
    const sc = structuredClone(base);
    p.set(sc, value);
    sc.name = `${base.name} · ${p.label} = ${label}`;
    const a = assess(sc);
    for (const i of a.issues) {
      if (i.level === 'error') errors.push({ level: 'error', message: `${p.label} = ${label}: ${i.message}` });
      else if (!i.message.startsWith('Snapshots thinned')) warnMap.set(i.message, [...(warnMap.get(i.message) ?? []), label]);
    }
    if (a.cost) {
      const c = a.cost;
      const frameSize = c.frameBytes / c.frames;
      const budget = LIMITS.maxFrameBytes / values.length;
      let every = Math.max(1, c.snapshotEveryWeeks);
      while ((Math.floor(c.weeks / every) + 2) * frameSize > budget) every++;
      sc.snapshotEveryWeeks = every;
      total += c.seconds;
      longest = Math.max(longest, c.seconds);
    }
    runs.push({ value, label, scenario: sc });
  }
  const parallel = parallelRuns(values.length, cores);
  const warnings: Issue[] = [...warnMap].map(([message, labels]) => ({
    level: 'warning',
    message: labels.length === values.length ? message : `${message} (${p.label} = ${labels.join(', ')})`,
  }));
  // Parallel runs compete for memory bandwidth: measured in Edge, 3 runs at once took
  // about 1.9× as long each as a single run.
  const slowdown = 1 + 0.45 * (parallel - 1);
  return { runs, errors, warnings, seconds: Math.max(longest, total / parallel) * slowdown, parallel };
}

/**
 * Line colours for n ordered values: one blue hue, low value light → high value dark (light mode)
 * or dark → bright (dark mode). Steps validated as an ordinal ramp against both chart surfaces.
 */
const ORDINAL_LIGHT = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'];
const ORDINAL_DARK = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'];

export function sweepColors(n: number, dark: boolean): string[] {
  const ramp = dark ? ORDINAL_DARK : ORDINAL_LIGHT;
  if (n <= 1) return [ramp[2]];
  return Array.from({ length: n }, (_, k) => ramp[Math.round((k * (ramp.length - 1)) / (n - 1))]);
}
