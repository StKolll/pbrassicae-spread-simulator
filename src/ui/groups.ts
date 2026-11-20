import { LIMITS, assess, type Issue } from '../model/limits';
import type { Scenario } from '../model/scenario';
import type { BoundaryCondition, VelocityPresetKind } from '../model/types';
import { fmtNum } from './theme';

/**
 * Comparison groups: group A is the scenario from the sidebar, groups B, C, … are copies of it
 * in which some parameters have other values. Grid, plants, numerics, crop calendars and the
 * crop rotation are the same for all groups, so all runs share the same weeks and snapshots
 * and can be shown side by side.
 */

export const VELOCITY_OPTIONS: { value: VelocityPresetKind; label: string }[] = [
  { value: 'none', label: 'No water flow' },
  { value: 'uniform', label: 'Uniform flow' },
  { value: 'centerDepression', label: 'Depression in the centre' },
  { value: 'unilateralDepression', label: 'Slope on one half (x > Lx/2)' },
];

export const BOUNDARY_OPTIONS: { value: BoundaryCondition; label: string }[] = [
  { value: 'dirichlet', label: 'Spores leave the field (p = 0)' },
  { value: 'zeroFlux', label: 'Closed (no flux)' },
];

export type GroupValue = number | string;

export const GROUP_SECTIONS = ['Biology', 'Spore transport', 'Initial infection'] as const;
export type GroupSection = (typeof GROUP_SECTIONS)[number];

interface ParamBase {
  id: string;
  section: GroupSection;
  label: string;
  /** Short name for result labels, e.g. "β". */
  short: string;
  unit?: string;
  get(sc: Scenario): GroupValue;
  set(draft: Scenario, v: GroupValue): void;
  /** True if the parameter has no effect in `sc` (e.g. flow speed without water flow). */
  inactive?(sc: Scenario): boolean;
}
export interface NumberParam extends ParamBase {
  kind: 'number';
  integer?: boolean;
}
export interface ChoiceParam extends ParamBase {
  kind: 'choice';
  options: { value: string; label: string }[];
}
export type GroupParam = NumberParam | ChoiceParam;

const num = (v: GroupValue) => Number(v);
const noFlow = (sc: Scenario) => sc.transport.velocity.preset === 'none';
const undirected = (sc: Scenario) => sc.transport.velocity.preset !== 'uniform' && sc.transport.velocity.preset !== 'unilateralDepression';

/** Parameters that may differ between groups, in sidebar order. */
export const GROUP_PARAMS: GroupParam[] = [
  {
    id: 'halfLife',
    section: 'Biology',
    kind: 'number',
    label: 'Spore half-life',
    short: 'half-life',
    unit: 'years',
    get: (sc) => sc.biology.halfLifeYears,
    set: (d, v) => void (d.biology.halfLifeYears = num(v)),
  },
  {
    id: 'threshold',
    section: 'Biology',
    kind: 'number',
    label: 'Infection threshold c*',
    short: 'c*',
    unit: 'spores/g soil',
    get: (sc) => sc.biology.threshold,
    set: (d, v) => void (d.biology.threshold = num(v)),
  },
  {
    id: 'spores',
    section: 'Biology',
    kind: 'number',
    label: 'Spores per infected plant Y',
    short: 'Y',
    unit: 'spores',
    get: (sc) => sc.biology.sporesPerPlant,
    set: (d, v) => void (d.biology.sporesPerPlant = num(v)),
  },
  {
    id: 'gallWeeks',
    section: 'Biology',
    kind: 'number',
    label: 'Gall development time ω',
    short: 'ω',
    unit: 'weeks of growth',
    get: (sc) => sc.biology.gallWeeks,
    set: (d, v) => void (d.biology.gallWeeks = num(v)),
  },
  {
    id: 'rainKept',
    section: 'Biology',
    kind: 'number',
    label: 'Spores kept in topsoil r_rain',
    short: 'r_rain',
    unit: 'fraction',
    get: (sc) => sc.biology.rainKept,
    set: (d, v) => void (d.biology.rainKept = num(v)),
  },
  {
    id: 'beta',
    section: 'Spore transport',
    kind: 'number',
    label: 'Diffusion β',
    short: 'β',
    unit: 'm²/week',
    get: (sc) => sc.transport.beta,
    set: (d, v) => void (d.transport.beta = num(v)),
  },
  {
    id: 'flow',
    section: 'Spore transport',
    kind: 'choice',
    label: 'Water flow',
    short: 'flow',
    options: VELOCITY_OPTIONS,
    get: (sc) => sc.transport.velocity.preset,
    set: (d, v) => void (d.transport.velocity.preset = v as VelocityPresetKind),
  },
  {
    id: 'vmax',
    section: 'Spore transport',
    kind: 'number',
    label: 'Max water velocity',
    short: 'v_max',
    unit: 'm/week',
    get: (sc) => sc.transport.velocity.vmax,
    set: (d, v) => void (d.transport.velocity.vmax = num(v)),
    inactive: noFlow,
  },
  {
    id: 'angle',
    section: 'Spore transport',
    kind: 'number',
    label: 'Flow direction',
    short: 'direction',
    unit: '°, 0 = +x, 90 = +y',
    get: (sc) => sc.transport.velocity.angleDeg,
    set: (d, v) => void (d.transport.velocity.angleDeg = num(v)),
    inactive: undirected,
  },
  {
    id: 'boundary',
    section: 'Spore transport',
    kind: 'choice',
    label: 'Field boundary',
    short: 'boundary',
    options: BOUNDARY_OPTIONS,
    get: (sc) => sc.transport.boundary,
    set: (d, v) => void (d.transport.boundary = v as BoundaryCondition),
  },
  {
    id: 'initialCount',
    section: 'Initial infection',
    kind: 'number',
    integer: true,
    label: 'Initially infected plants',
    short: 'infected plants',
    get: (sc) => sc.initial.count,
    set: (d, v) => void (d.initial.count = num(v)),
  },
  {
    id: 'maxIntensity',
    section: 'Initial infection',
    kind: 'number',
    label: 'Max initial intensity',
    short: 'intensity',
    unit: '× c*',
    get: (sc) => sc.initial.maxIntensity,
    set: (d, v) => void (d.initial.maxIntensity = num(v)),
  },
  {
    id: 'seed',
    section: 'Initial infection',
    kind: 'number',
    integer: true,
    label: 'Random seed (positions)',
    short: 'seed',
    get: (sc) => sc.initial.seed,
    set: (d, v) => void (d.initial.seed = num(v)),
  },
];

export const groupParam = (id: string) => GROUP_PARAMS.find((p) => p.id === id);

export const MAX_GROUPS = 5;
export const groupLetter = (k: number) => String.fromCharCode(65 + k);

export interface CompareSetup {
  /** Parameters that differ between groups ("Same along groups" unticked). */
  varying: string[];
  /** Values of the varying parameters for groups B, C, … (group A is the sidebar scenario). */
  others: Record<string, GroupValue>[];
}

export const initialCompareSetup = (): CompareSetup => ({ varying: [], others: [{}] });

export const groupCount = (setup: CompareSetup) => setup.others.length + 1;

/** Value of `p` in group k (0 = A). */
export function groupValue(setup: CompareSetup, sc: Scenario, k: number, p: GroupParam): GroupValue {
  if (k === 0 || !setup.varying.includes(p.id)) return p.get(sc);
  return setup.others[k - 1]?.[p.id] ?? p.get(sc);
}

/** Tick or untick "Same along groups". Unticking starts every group with group A's value. */
export function setSame(setup: CompareSetup, sc: Scenario, id: string, same: boolean): CompareSetup {
  const p = groupParam(id);
  if (!p) return setup;
  if (same) {
    return {
      varying: setup.varying.filter((v) => v !== id),
      others: setup.others.map((g) => {
        const rest = { ...g };
        delete rest[id];
        return rest;
      }),
    };
  }
  if (setup.varying.includes(id)) return setup;
  const order = GROUP_PARAMS.map((q) => q.id);
  return {
    varying: [...setup.varying, id].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    others: setup.others.map((g) => ({ ...g, [id]: p.get(sc) })),
  };
}

export function setGroupValue(setup: CompareSetup, k: number, id: string, v: GroupValue): CompareSetup {
  if (k < 1) return setup;
  return { ...setup, others: setup.others.map((g, j) => (j === k - 1 ? { ...g, [id]: v } : g)) };
}

/** Add a group as a copy of the last one. */
export function addGroup(setup: CompareSetup, sc: Scenario): CompareSetup {
  if (groupCount(setup) >= MAX_GROUPS) return setup;
  const last = groupCount(setup) - 1;
  const copy: Record<string, GroupValue> = {};
  for (const id of setup.varying) {
    const p = groupParam(id);
    if (p) copy[id] = groupValue(setup, sc, last, p);
  }
  return { ...setup, others: [...setup.others, copy] };
}

/** Remove group k (k ≥ 1; group A is the sidebar and cannot be removed). At least two groups remain. */
export function removeGroup(setup: CompareSetup, k: number): CompareSetup {
  if (k < 1 || groupCount(setup) <= 2) return setup;
  return { ...setup, others: setup.others.filter((_, j) => j !== k - 1) };
}

const varyingParams = (setup: CompareSetup) => setup.varying.map(groupParam).filter((p): p is GroupParam => !!p);

export function groupScenarios(sc: Scenario, setup: CompareSetup): Scenario[] {
  const params = varyingParams(setup);
  return Array.from({ length: groupCount(setup) }, (_, k) => {
    const d = structuredClone(sc);
    for (const p of params) p.set(d, groupValue(setup, sc, k, p));
    d.name = `${sc.name} · group ${groupLetter(k)}`;
    return d;
  });
}

export function formatGroupValue(p: GroupParam, v: GroupValue): string {
  if (p.kind === 'choice') return p.options.find((o) => o.value === v)?.label ?? String(v);
  const unit = p.unit && p.unit !== 'fraction' && !p.unit.includes(',') ? ` ${p.unit}` : p.id === 'angle' ? '°' : '';
  return `${fmtNum(Number(v), 3)}${unit}`;
}

/** The varying parameters of group k, e.g. "β = 0.01 m²/week · flow: Uniform flow". */
export function describeGroup(sc: Scenario, setup: CompareSetup, k: number): string {
  const g = groupScenarios(sc, setup)[k];
  return varyingParams(setup)
    .filter((p) => !p.inactive?.(g))
    .map((p) => (p.kind === 'choice' ? `${p.short}: ${formatGroupValue(p, p.get(g))}` : `${p.short} = ${formatGroupValue(p, p.get(g))}`))
    .join(' · ');
}

export interface GroupRunSpec {
  label: string;
  description: string;
  scenario: Scenario;
}

export interface GroupPlan {
  runs: GroupRunSpec[];
  /** The comparison cannot start while there are errors. */
  errors: Issue[];
  /** Warnings, each listed once with the groups it applies to. */
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
 * One scenario per group. Snapshots are thinned so that all runs together stay within the
 * single-run frame memory budget; all groups keep the same snapshot weeks.
 */
export function planGroups(sc: Scenario, setup: CompareSetup, cores?: number): GroupPlan {
  const scenarios = groupScenarios(sc, setup);
  const n = scenarios.length;
  const errors: Issue[] = [];
  const warnMap = new Map<string, string[]>();
  if (!setup.varying.length) errors.push({ level: 'error', message: 'All groups are the same. Untick "Same along groups" for the parameters you want to compare.' });
  else {
    const keys = scenarios.map((s) => JSON.stringify({ ...s, name: '' }));
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        if (keys[a] === keys[b]) warnMap.set(`Groups ${groupLetter(a)} and ${groupLetter(b)} have the same settings.`, []);
  }
  let total = 0;
  let longest = 0;
  let every = 1;
  const runs: GroupRunSpec[] = scenarios.map((s, k) => {
    const label = groupLetter(k);
    const a = assess(s);
    for (const i of a.issues) {
      if (i.level === 'error') errors.push({ level: 'error', message: `Group ${label}: ${i.message}` });
      else if (!i.message.startsWith('Snapshots thinned')) warnMap.set(i.message, [...(warnMap.get(i.message) ?? []), label]);
    }
    if (a.cost) {
      const c = a.cost;
      const frameSize = c.frameBytes / c.frames;
      const budget = LIMITS.maxFrameBytes / n;
      let e = Math.max(1, c.snapshotEveryWeeks);
      while ((Math.floor(c.weeks / e) + 2) * frameSize > budget) e++;
      every = Math.max(every, e);
      total += c.seconds;
      longest = Math.max(longest, c.seconds);
    }
    return { label, description: describeGroup(sc, setup, k), scenario: s };
  });
  for (const r of runs) r.scenario.snapshotEveryWeeks = every;
  const parallel = parallelRuns(n, cores);
  const warnings: Issue[] = [...warnMap].map(([message, labels]) => ({
    level: 'warning',
    message: labels.length === 0 || labels.length === n ? message : `${message} (group${labels.length > 1 ? 's' : ''} ${labels.join(', ')})`,
  }));
  // Parallel runs compete for memory bandwidth: measured in Edge, 3 runs at once took
  // about 1.9× as long each as a single run.
  const slowdown = 1 + 0.45 * (parallel - 1);
  return { runs, errors, warnings, seconds: Math.max(longest, total / parallel) * slowdown, parallel };
}

/**
 * Group colours: the first five categorical slots (blue, orange, aqua, yellow, magenta), in fixed
 * order so a group keeps its colour when others are added or removed behind it.
 */
const GROUP_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const GROUP_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

export function groupColors(n: number, dark: boolean): string[] {
  return (dark ? GROUP_DARK : GROUP_LIGHT).slice(0, n);
}
