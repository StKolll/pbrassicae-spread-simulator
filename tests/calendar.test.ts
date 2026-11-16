import { describe, expect, it } from 'vitest';
import {
  MONTH_START_WEEK,
  WEEKS_PER_MONTH,
  buildCalendar,
  monthOfWeek,
  weeksInMonths,
} from '../src/model/calendar';
import type { Crop } from '../src/model/types';

const canola: Crop = {
  name: 'canola',
  isHost: true,
  months: ['dormant', 'dormant', 'growth', 'growth', 'growth', 'growth', 'harvest', 'dormant',
    'growth', 'growth', 'dormant', 'dormant'],
};
const wheat: Crop = { name: 'wheat', isHost: false, months: Array(12).fill('growth') };

describe('calendar', () => {
  it('has 52 weeks in 12 months', () => {
    expect(WEEKS_PER_MONTH.reduce((a, b) => a + b, 0)).toBe(52);
    expect(MONTH_START_WEEK[0]).toBe(0);
    expect(MONTH_START_WEEK[11]).toBe(47);
    expect(monthOfWeek(0)).toBe(0);
    expect(monthOfWeek(51)).toBe(11);
    expect(monthOfWeek(52)).toBe(0);
    expect(monthOfWeek(8)).toBe(2);
    expect(weeksInMonths(10, 4)).toBe(4 + 5 + 4 + 4);
  });

  it('expands a rotation week by week', () => {
    const cal = buildCalendar(
      [
        { crop: 'canola', startMonth: 7, lengthMonths: 12 },
        { crop: 'wheat', startMonth: 7, lengthMonths: 12 },
      ],
      [canola, wheat],
    );
    expect(cal).toHaveLength(104);
    expect(cal[0].month).toBe(7);
    expect(cal[0].crop.name).toBe('canola');
    expect(cal[52].seasonIndex).toBe(1);
    expect(cal[52].weekInSeason).toBe(0);
    expect(cal.filter((w) => w.hostGrowth).length).toBe(
      WEEKS_PER_MONTH.filter((_, m) => canola.months[m] === 'growth').reduce((a, b) => a + b, 0),
    );
    expect(cal.slice(52).some((w) => w.hostGrowth)).toBe(false);
  });

  it('rejects gaps and unknown crops', () => {
    expect(() =>
      buildCalendar(
        [
          { crop: 'canola', startMonth: 0, lengthMonths: 6 },
          { crop: 'wheat', startMonth: 0, lengthMonths: 6 },
        ],
        [canola, wheat],
      ),
    ).toThrow(/starts in Jan/);
    expect(() => buildCalendar([{ crop: 'rye', startMonth: 0, lengthMonths: 12 }], [])).toThrow(
      /Unknown crop/,
    );
  });
});
