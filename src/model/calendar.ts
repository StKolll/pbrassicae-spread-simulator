import type { Crop, MonthPhase, Season } from './types';

/**
 * Calendar with 52 weeks per year. Months get 4 or 5 weeks in a fixed 4-4-5 pattern per
 * quarter: Jan 4, Feb 4, Mar 5, Apr 4, May 4, Jun 5, Jul 4, Aug 4, Sep 5, Oct 4, Nov 4, Dec 5.
 */
export const WEEKS_PER_YEAR = 52;
export const WEEKS_PER_MONTH: readonly number[] = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** First week of the year (0-based) of each month. */
export const MONTH_START_WEEK: readonly number[] = WEEKS_PER_MONTH.reduce<number[]>(
  (acc, _w, m) => (m === 0 ? [0] : [...acc, acc[m - 1] + WEEKS_PER_MONTH[m - 1]]),
  [],
);

const WEEK_TO_MONTH: readonly number[] = WEEKS_PER_MONTH.flatMap((w, m) =>
  Array<number>(w).fill(m),
);

/** Calendar month (0 = Jan) of week-of-year w (any integer, wraps around). */
export function monthOfWeek(w: number): number {
  return WEEK_TO_MONTH[((w % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR];
}

/** Number of weeks covering `count` months starting at calendar month `start`. */
export function weeksInMonths(start: number, count: number): number {
  let w = 0;
  for (let m = 0; m < count; m++) w += WEEKS_PER_MONTH[(start + m) % 12];
  return w;
}

export interface WeekInfo {
  /** Simulation week (0-based). */
  week: number;
  /** Calendar month 0..11. */
  month: number;
  seasonIndex: number;
  /** Week within the season (0-based). */
  weekInSeason: number;
  crop: Crop;
  phase: MonthPhase;
  /** The crop is a host and in its growth phase. */
  hostGrowth: boolean;
}

/**
 * Expand a rotation into one entry per simulated week. The simulation starts at the start
 * month of the first season; each following season starts where the previous one ended
 * (its own `startMonth` is then only a consistency check).
 */
export function buildCalendar(rotation: Season[], crops: Crop[]): WeekInfo[] {
  if (rotation.length === 0) throw new Error('Rotation is empty');
  const byName = new Map(crops.map((c) => [c.name, c]));
  const out: WeekInfo[] = [];
  let month = rotation[0].startMonth;
  rotation.forEach((season, seasonIndex) => {
    const crop = byName.get(season.crop);
    if (!crop) throw new Error(`Unknown crop "${season.crop}"`);
    if (crop.months.length !== 12) throw new Error(`Crop "${crop.name}" needs 12 months`);
    if (season.startMonth !== month) {
      throw new Error(
        `Season ${seasonIndex + 1} starts in ${MONTH_NAMES[season.startMonth]} but the previous ` +
          `season ends in ${MONTH_NAMES[(month + 11) % 12]}`,
      );
    }
    let weekInSeason = 0;
    for (let m = 0; m < season.lengthMonths; m++) {
      const cm = (month + m) % 12;
      const phase = crop.months[cm];
      for (let w = 0; w < WEEKS_PER_MONTH[cm]; w++) {
        out.push({
          week: out.length,
          month: cm,
          seasonIndex,
          weekInSeason: weekInSeason++,
          crop,
          phase,
          hostGrowth: crop.isHost && phase === 'growth',
        });
      }
    }
    month = (month + season.lengthMonths) % 12;
  });
  return out;
}
