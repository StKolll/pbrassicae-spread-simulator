import { MONTH_NAMES, WEEKS_PER_MONTH } from '../model/calendar';
import { presets } from '../model/presets';
import type { Scenario } from '../model/scenario';
import type { Crop, MonthPhase, Season } from '../model/types';

/**
 * Pure helpers for editing a scenario in the UI. Each returns a new object; the UI never
 * mutates the current scenario in place.
 */

/** Apply `change` to a deep copy of `sc`. */
export function edit(sc: Scenario, change: (draft: Scenario) => void): Scenario {
  const draft = structuredClone(sc);
  change(draft);
  return draft;
}

/**
 * Seasons follow each other without gaps: every season after the first starts where the
 * previous one ended. Only the first season's start month is free.
 */
export function chainRotation(rotation: Season[]): Season[] {
  const out = rotation.map((s) => ({ ...s }));
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    out[i].startMonth = (prev.startMonth + prev.lengthMonths) % 12;
  }
  return out;
}

/** Edit the rotation and re-chain the start months. */
export function editRotation(sc: Scenario, change: (rotation: Season[]) => void): Scenario {
  return edit(sc, (d) => {
    change(d.rotation);
    d.rotation = chainRotation(d.rotation);
  });
}

export function moveSeason(sc: Scenario, from: number, to: number): Scenario {
  if (to < 0 || to >= sc.rotation.length || from === to) return sc;
  return editRotation(sc, (r) => {
    const first = r[0].startMonth;
    const [s] = r.splice(from, 1);
    r.splice(to, 0, s);
    r[0].startMonth = first; // the simulation start stays where it was
  });
}

export function addSeason(sc: Scenario): Scenario {
  return editRotation(sc, (r) => {
    const last = r.at(-1);
    r.push({
      crop: last?.crop ?? sc.crops[0].name,
      startMonth: last ? (last.startMonth + last.lengthMonths) % 12 : 7,
      lengthMonths: last?.lengthMonths ?? 12,
    });
  });
}

export function removeSeason(sc: Scenario, i: number): Scenario {
  if (sc.rotation.length <= 1) return sc;
  return editRotation(sc, (r) => {
    const first = r[0].startMonth;
    r.splice(i, 1);
    if (i === 0) r[0].startMonth = first;
  });
}

/** Rename a crop and update every reference to it. Returns `sc` unchanged if the name is taken. */
export function renameCrop(sc: Scenario, oldName: string, newName: string): Scenario {
  const name = newName.trim();
  if (!name || name === oldName || sc.crops.some((c) => c.name === name)) return sc;
  return edit(sc, (d) => {
    for (const c of d.crops) if (c.name === oldName) c.name = name;
    for (const s of d.rotation) if (s.crop === oldName) s.crop = name;
    if (d.volunteerCrop === oldName) d.volunteerCrop = name;
  });
}

export const cropInUse = (sc: Scenario, name: string) =>
  sc.rotation.some((s) => s.crop === name) || sc.volunteerCrop === name;

export function addCrop(sc: Scenario): Scenario {
  let n = 1;
  while (sc.crops.some((c) => c.name === `crop ${n}`)) n++;
  const crop: Crop = { name: `crop ${n}`, isHost: false, months: Array(12).fill('growth') };
  return edit(sc, (d) => void d.crops.push(crop));
}

export function removeCrop(sc: Scenario, name: string): Scenario {
  if (cropInUse(sc, name)) return sc;
  return edit(sc, (d) => void (d.crops = d.crops.filter((c) => c.name !== name)));
}

const NEXT_PHASE: Record<MonthPhase, MonthPhase> = {
  growth: 'dormant',
  dormant: 'harvest',
  harvest: 'growth',
};

/** Click on a month of the crop calendar: growth → dormant → harvest → growth. */
export function cycleMonth(sc: Scenario, cropName: string, month: number): Scenario {
  return edit(sc, (d) => {
    const c = d.crops.find((c) => c.name === cropName);
    if (c) c.months[month] = NEXT_PHASE[c.months[month]];
  });
}

/** Copy a season's pesticide events to every season with the same crop. */
export function copyPesticideToSameCrop(sc: Scenario, i: number): Scenario {
  return edit(sc, (d) => {
    const src = d.rotation[i];
    for (const s of d.rotation) {
      if (s !== src && s.crop === src.crop) s.pesticide = structuredClone(src.pesticide ?? []);
    }
  });
}

/** Months from the simulation start to the start of each season. */
export function seasonOffsets(rotation: Season[]): number[] {
  const out: number[] = [];
  let m = 0;
  for (const s of rotation) {
    out.push(m);
    m += s.lengthMonths;
  }
  return out;
}

/**
 * Human label for season i: "Year 2 · Aug–Jul" for a season that fills one year of the
 * simulation, otherwise "Aug (year 1) – Jan (year 2)".
 */
export function seasonLabel(rotation: Season[], i: number): string {
  const s = rotation[i];
  const start = seasonOffsets(rotation)[i];
  const end = start + s.lengthMonths - 1;
  const year = (m: number) => Math.floor(m / 12) + 1;
  const range = `${monthName(s.startMonth)}–${monthName(s.startMonth + s.lengthMonths - 1)}`;
  if (s.lengthMonths === 12 && start % 12 === 0) return `Year ${year(start)} · ${range}`;
  if (year(start) === year(end)) return `Year ${year(start)} · ${s.lengthMonths === 1 ? monthName(s.startMonth) : range}`;
  return `${monthName(s.startMonth)} (year ${year(start)}) – ${monthName(s.startMonth + s.lengthMonths - 1)} (year ${year(end)})`;
}

/** Calendar month in which week `week` (0-based, counted from the season start) falls. */
export function monthOfSeasonWeek(startMonth: number, week: number): number {
  let m = startMonth;
  let w = week;
  while (w >= WEEKS_PER_MONTH[m % 12]) {
    w -= WEEKS_PER_MONTH[m % 12];
    m++;
  }
  return m % 12;
}

export interface RotationTemplate {
  /** Host crop planted every `every` years, starting in year 1. */
  host: string;
  every: number;
  /** Crop in the other years. */
  other: string;
  years: number;
}

/**
 * Replace the rotation by one-year seasons: `host` in years 1, 1 + every, …, `other` otherwise.
 * The simulation start month is kept. Pesticide and volunteer settings are taken from the
 * first existing season with the same crop.
 */
export function fillRotation(sc: Scenario, t: RotationTemplate): Scenario {
  const years = Math.max(1, Math.min(30, Math.round(t.years)));
  const every = Math.max(1, Math.round(t.every));
  return editRotation(sc, (r) => {
    const like = (crop: string) => r.find((s) => s.crop === crop);
    const start = r[0].startMonth;
    const next: Season[] = Array.from({ length: years }, (_, y) => {
      const crop = y % every === 0 ? t.host : t.other;
      const old = like(crop);
      const s: Season = { crop, startMonth: start, lengthMonths: 12 };
      if (old?.pesticide) s.pesticide = structuredClone(old.pesticide);
      if (old?.volunteers) s.volunteers = old.volunteers;
      return s;
    });
    r.splice(0, r.length, ...next);
  });
}

/** Crop names used before 2026-11 (stored scenarios), mapped to the current names. */
const LEGACY_CROP_NAMES: Record<string, string> = {
  'winter canola': 'Canola, autumn-sown',
  'spring canola': 'Canola, spring-sown',
  'winter wheat': 'Cereal (e.g. wheat)',
  fallow: 'Bare soil (fallow)',
};

/** Rename the old default crop names in a stored scenario. */
export function migrateCropNames(sc: Scenario): Scenario {
  let out = sc;
  for (const [old, name] of Object.entries(LEGACY_CROP_NAMES)) out = renameCrop(out, old, name);
  return out;
}

export const monthName = (m: number) => MONTH_NAMES[((m % 12) + 12) % 12];

export type PresetName = keyof typeof presets;
export const presetNames = Object.keys(presets) as PresetName[];

/** Name of the preset `sc` is identical to, or null if it was modified. */
export function matchingPreset(sc: Scenario): PresetName | null {
  const s = JSON.stringify(sc);
  return presetNames.find((n) => JSON.stringify(presets[n]()) === s) ?? null;
}

/** Light structural check for a scenario restored from storage. */
export function looksLikeScenario(x: unknown): x is Scenario {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<Scenario>;
  return (
    !!s.grid &&
    !!s.transport &&
    !!s.biology &&
    !!s.plants &&
    !!s.initial &&
    Array.isArray(s.crops) &&
    Array.isArray(s.rotation) &&
    s.rotation.length > 0 &&
    typeof s.tau === 'number'
  );
}
