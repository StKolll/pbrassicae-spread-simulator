import type { Scenario } from './scenario';
import type { Crop, MonthPhase } from './types';

const G: MonthPhase = 'growth';
const D: MonthPhase = 'dormant';
const H: MonthPhase = 'harvest';

/**
 * Canola sown in autumn ("winter canola", thesis: Austria). Matches the thesis timing for a
 * season starting in August: growth Aug–Nov (17 weeks), dormant Dec–Jan (9), growth Feb–Jun
 * (22), harvest Jul (4).
 */
export const autumnCanola: Crop = {
  name: 'Canola, autumn-sown',
  isHost: true,
  //       Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
  months: [D, G, G, G, G, G, H, G, G, G, G, D],
};

/** A non-host cereal such as wheat. Its calendar is irrelevant to the model. */
export const cereal: Crop = {
  name: 'Cereal (e.g. wheat)',
  isHost: false,
  months: [G, G, G, G, G, G, H, D, D, G, G, G],
};

/** Canola sown in spring ("spring canola", thesis: Canada): growth May–Jul (13 weeks), harvest Aug, otherwise dormant. */
export const springCanola: Crop = {
  name: 'Canola, spring-sown',
  isHost: true,
  months: [D, D, D, D, G, G, G, H, D, D, D, D],
};

/** Fallow: no crop. Volunteers can still grow. */
export const bareSoil: Crop = {
  name: 'Bare soil (fallow)',
  isHost: false,
  months: [D, D, D, D, D, D, D, D, D, D, D, D],
};

export const defaultCrops: Crop[] = [autumnCanola, springCanola, cereal, bareSoil];

const base: Omit<Scenario, 'name' | 'rotation' | 'volunteerCrop'> = {
  grid: { Lx: 20, Ly: 20, nx: 71, ny: 71 },
  transport: {
    beta: 0.01,
    velocity: { preset: 'none', vmax: 0.4, angleDeg: 0 },
    scheme: 'upwind',
    boundary: 'dirichlet',
  },
  tau: 0.25,
  solver: 'banded',
  biology: {
    halfLifeYears: 5.3,
    seasonalDecay: null,
    gallWeeks: 8,
    threshold: 1e5,
    sporesPerPlant: 1e10,
    rainKept: 0.5,
    soilDensity: 1500,
    topsoilDepth: 0.2,
  },
  plants: { rootRadius: 0.3, spacing: 0.6, margin: 0.5 },
  initial: { count: 5, maxIntensity: 2, seed: 42 },
  crops: defaultCrops,
  snapshotEveryWeeks: 1,
};

/** Thesis scenario "Austria": autumn-sown canola → cereal ×3 → canola, seasons from August. */
export function austriaPreset(): Scenario {
  return structuredClone({
    ...base,
    name: 'Autumn-sown canola every 4th year',
    volunteerCrop: autumnCanola.name,
    rotation: [
      { crop: autumnCanola.name, startMonth: 7, lengthMonths: 12 },
      { crop: cereal.name, startMonth: 7, lengthMonths: 12 },
      { crop: cereal.name, startMonth: 7, lengthMonths: 12 },
      { crop: cereal.name, startMonth: 7, lengthMonths: 12 },
      { crop: autumnCanola.name, startMonth: 7, lengthMonths: 12 },
    ],
  });
}

/**
 * Thesis scenario "Canada": spring-sown canola and bare-soil years alternating, seasons from May. Three volunteer
 * plants in each fallow year; pesticide 9 weeks into each canola season.
 * Kill fraction 0.4 follows the comment in the thesis code ("reduces … by approximately 40%");
 * the code itself multiplied by 0.2 (80% kill).
 */
export function canadaPreset(): Scenario {
  const pest = [{ week: 9, killFraction: 0.4 }];
  return structuredClone({
    ...base,
    name: 'Spring-sown canola every 2nd year, fallow between',
    volunteerCrop: springCanola.name,
    rotation: [
      { crop: springCanola.name, startMonth: 4, lengthMonths: 12, pesticide: pest },
      { crop: bareSoil.name, startMonth: 4, lengthMonths: 12, volunteers: 3 },
      { crop: springCanola.name, startMonth: 4, lengthMonths: 12, pesticide: pest },
      { crop: bareSoil.name, startMonth: 4, lengthMonths: 12, volunteers: 3 },
      { crop: springCanola.name, startMonth: 4, lengthMonths: 12, pesticide: pest },
    ],
  });
}

/** Presets by display name (no country names in the UI; the thesis scenarios are Austria and Canada). */
export const presets = {
  'Autumn-sown canola every 4th year': austriaPreset,
  'Spring-sown canola every 2nd year, fallow between': canadaPreset,
} as const;
