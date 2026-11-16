import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../src/model/calendar';
import { austriaPreset, canadaPreset } from '../src/model/presets';
import {
  addCrop,
  addSeason,
  copyPesticideToSameCrop,
  cycleMonth,
  editRotation,
  fillRotation,
  migrateCropNames,
  monthOfSeasonWeek,
  seasonLabel,
  looksLikeScenario,
  matchingPreset,
  moveSeason,
  removeCrop,
  removeSeason,
  renameCrop,
} from '../src/ui/scenarioEdit';

describe('scenario editing helpers', () => {
  it('keeps the rotation gap-free when season lengths change', () => {
    const s = editRotation(austriaPreset(), (r) => (r[1].lengthMonths = 9));
    expect(s.rotation.map((x) => x.startMonth)).toEqual([7, 7, 4, 4, 4]);
    expect(() => buildCalendar(s.rotation, s.crops)).not.toThrow();
  });

  it('adds, moves and removes seasons without breaking the calendar', () => {
    let s = canadaPreset();
    s = addSeason(s);
    expect(s.rotation).toHaveLength(6);
    s = moveSeason(s, 1, 0);
    expect(s.rotation[0].crop).toBe('Bare soil (fallow)');
    expect(s.rotation[0].startMonth).toBe(4); // simulation start unchanged
    s = removeSeason(s, 0);
    expect(s.rotation[0].crop).toBe('Canola, spring-sown');
    for (const x of [s]) expect(() => buildCalendar(x.rotation, x.crops)).not.toThrow();
    // The last season cannot be removed.
    s.rotation = s.rotation.slice(0, 1);
    expect(removeSeason(s, 0).rotation).toHaveLength(1);
  });

  it('renames crops everywhere and refuses duplicate names', () => {
    const a = austriaPreset();
    const s = renameCrop(a, 'Canola, autumn-sown', 'oilseed rape');
    expect(s.rotation[0].crop).toBe('oilseed rape');
    expect(s.volunteerCrop).toBe('oilseed rape');
    expect(s.crops.map((c) => c.name)).toContain('oilseed rape');
    expect(renameCrop(a, 'Canola, autumn-sown', 'Cereal (e.g. wheat)')).toBe(a);
    expect(a.rotation[0].crop).toBe('Canola, autumn-sown'); // original untouched
  });

  it('adds and removes crops, but not crops in use', () => {
    let s = addCrop(austriaPreset());
    expect(s.crops.at(-1)!.name).toBe('crop 1');
    s = removeCrop(s, 'crop 1');
    expect(s.crops.some((c) => c.name === 'crop 1')).toBe(false);
    expect(removeCrop(s, 'Cereal (e.g. wheat)').crops).toHaveLength(s.crops.length);
  });

  it('cycles month phases', () => {
    let s = austriaPreset();
    s = cycleMonth(s, 'Canola, autumn-sown', 0); // dormant → harvest
    expect(s.crops[0].months[0]).toBe('harvest');
    s = cycleMonth(s, 'Canola, autumn-sown', 0);
    expect(s.crops[0].months[0]).toBe('growth');
  });

  it('copies pesticide events to seasons with the same crop', () => {
    const s = editRotation(austriaPreset(), (r) => (r[0].pesticide = [{ week: 3, killFraction: 0.5 }]));
    const c = copyPesticideToSameCrop(s, 0);
    expect(c.rotation[4].pesticide).toEqual([{ week: 3, killFraction: 0.5 }]);
    expect(c.rotation[1].pesticide).toBeUndefined();
  });

  it('recognises presets and stored scenarios', () => {
    expect(matchingPreset(austriaPreset())).toBe('Autumn-sown canola every 4th year');
    expect(matchingPreset(canadaPreset())).toBe('Spring-sown canola every 2nd year, fallow between');
    expect(matchingPreset(addSeason(austriaPreset()))).toBeNull();
    expect(looksLikeScenario(JSON.parse(JSON.stringify(austriaPreset())))).toBe(true);
    expect(looksLikeScenario({ grid: {} })).toBe(false);
  });

  it('fills a rotation from a template, keeping start month and season settings', () => {
    const c = canadaPreset();
    const s = fillRotation(c, { host: 'Canola, spring-sown', every: 3, other: 'Bare soil (fallow)', years: 7 });
    expect(s.rotation.map((x) => x.crop[0])).toEqual(['C', 'B', 'B', 'C', 'B', 'B', 'C']);
    expect(s.rotation.every((x) => x.startMonth === 4 && x.lengthMonths === 12)).toBe(true);
    expect(s.rotation[3].pesticide).toEqual(c.rotation[0].pesticide);
    expect(s.rotation[1].volunteers).toBe(3);
    expect(() => buildCalendar(s.rotation, s.crops)).not.toThrow();
  });

  it('labels seasons by year and finds the month of a season week', () => {
    const a = austriaPreset();
    expect(seasonLabel(a.rotation, 0)).toBe('Year 1 · Aug–Jul');
    expect(seasonLabel(a.rotation, 3)).toBe('Year 4 · Aug–Jul');
    const s = editRotation(a, (r) => (r[0].lengthMonths = 6));
    expect(seasonLabel(s.rotation, 0)).toBe('Year 1 · Aug–Jan');
    expect(seasonLabel(s.rotation, 1)).toBe('Feb (year 1) – Jan (year 2)');
    expect(monthOfSeasonWeek(7, 0)).toBe(7);
    expect(monthOfSeasonWeek(7, 9)).toBe(9); // Aug 4 + Sep 5 weeks → October
  });

  it('renames the old default crop names of stored scenarios', () => {
    const old = renameCrop(renameCrop(austriaPreset(), 'Canola, autumn-sown', 'winter canola'), 'Cereal (e.g. wheat)', 'winter wheat');
    expect(migrateCropNames(old)).toEqual(austriaPreset());
  });
});
