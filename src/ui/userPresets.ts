import type { Scenario } from '../model/scenario';
import { looksLikeScenario, migrateCropNames, presetNames } from './scenarioEdit';

/** A scenario the user saved under a name. `scenario.name` always equals `name`. */
export interface UserPreset {
  name: string;
  scenario: Scenario;
}

const STORAGE_KEY = 'pbrassicae.userPresets.v1';
const FILE_APP = 'pbrassicae-simulator';
const FILE_VERSION = 1;

/** Same settings, ignoring the scenario's name. */
export function sameSettings(a: Scenario, b: Scenario): boolean {
  return JSON.stringify({ ...a, name: '' }) === JSON.stringify({ ...b, name: '' });
}

/** Error message for an unusable preset name, or null if the name is fine. */
export function presetNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Please enter a name.';
  if ((presetNames as string[]).includes(n)) return 'This name belongs to a built-in preset.';
  return null;
}

/** Save `sc` as `name`: replaces a preset with the same name, otherwise appends. */
export function upsertPreset(list: UserPreset[], name: string, sc: Scenario): UserPreset[] {
  const n = name.trim();
  const entry: UserPreset = { name: n, scenario: { ...structuredClone(sc), name: n } };
  const i = list.findIndex((p) => p.name === n);
  return i < 0 ? [...list, entry] : list.map((p, j) => (j === i ? entry : p));
}

export function removePreset(list: UserPreset[], name: string): UserPreset[] {
  return list.filter((p) => p.name !== name);
}

/** `name`, or `name (2)`, `name (3)`, … whichever is not used yet (built-in names count as used). */
export function uniqueName(list: UserPreset[], name: string): string {
  const base = name.trim() || 'Imported settings';
  const taken = (n: string) => list.some((p) => p.name === n) || presetNameProblem(n) !== null;
  if (!taken(base)) return base;
  let k = 2;
  while (taken(`${base} (${k})`)) k++;
  return `${base} (${k})`;
}

/** Contents of an exported settings file. */
export function scenarioFileContent(sc: Scenario): string {
  return JSON.stringify({ app: FILE_APP, version: FILE_VERSION, scenario: sc }, null, 2);
}

/** File name for an exported scenario, e.g. "beta 0.03.json". */
export function scenarioFileName(sc: Scenario): string {
  const safe = sc.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'settings';
  return `${safe}.json`;
}

/**
 * Read an exported settings file. Accepts the export format and a bare scenario object.
 * Throws an Error with a readable message if the file is not usable.
 */
export function parseScenarioFile(text: string): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const wrapped = data as { app?: unknown; scenario?: unknown } | null;
  const sc = wrapped && typeof wrapped === 'object' && 'scenario' in wrapped ? wrapped.scenario : data;
  if (!looksLikeScenario(sc)) throw new Error('The file does not contain simulator settings.');
  if (typeof sc.name !== 'string') sc.name = 'Imported settings';
  return migrateCropNames(sc);
}

function isUserPreset(x: unknown): x is UserPreset {
  const p = x as Partial<UserPreset> | null;
  return !!p && typeof p.name === 'string' && looksLikeScenario(p.scenario);
}

/** Presets saved in this browser; empty if storage is unavailable or corrupt. */
export function loadUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.filter(isUserPreset).map((p) => ({ name: p.name, scenario: migrateCropNames({ ...p.scenario, name: p.name }) }));
  } catch {
    return [];
  }
}

/** Returns false if the browser refused to store the presets. */
export function storeUserPresets(list: UserPreset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
