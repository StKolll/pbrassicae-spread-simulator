import { describe, expect, it } from 'vitest';
import { austriaPreset, canadaPreset } from '../src/model/presets';
import {
  parseScenarioFile,
  presetNameProblem,
  removePreset,
  sameSettings,
  scenarioFileContent,
  scenarioFileName,
  uniqueName,
  upsertPreset,
} from '../src/ui/userPresets';

describe('user presets', () => {
  it('saves under a name and sets the scenario name', () => {
    const list = upsertPreset([], '  beta 0.03 ', austriaPreset());
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('beta 0.03');
    expect(list[0].scenario.name).toBe('beta 0.03');
  });

  it('replaces a preset with the same name instead of adding a second one', () => {
    let list = upsertPreset([], 'a', austriaPreset());
    list = upsertPreset(list, 'b', austriaPreset());
    const changed = { ...canadaPreset(), name: 'a' };
    list = upsertPreset(list, 'a', changed);
    expect(list.map((p) => p.name)).toEqual(['a', 'b']);
    expect(sameSettings(list[0].scenario, canadaPreset())).toBe(true);
  });

  it('stores a copy, so later edits do not change the saved preset', () => {
    const sc = austriaPreset();
    const list = upsertPreset([], 'a', sc);
    sc.transport.beta = 99;
    expect(list[0].scenario.transport.beta).toBe(austriaPreset().transport.beta);
  });

  it('removes by name', () => {
    const list = upsertPreset(upsertPreset([], 'a', austriaPreset()), 'b', austriaPreset());
    expect(removePreset(list, 'a').map((p) => p.name)).toEqual(['b']);
  });

  it('rejects empty and built-in names', () => {
    expect(presetNameProblem('   ')).not.toBeNull();
    expect(presetNameProblem(austriaPreset().name)).not.toBeNull();
    expect(presetNameProblem('my run')).toBeNull();
  });

  it('finds a free name', () => {
    const list = upsertPreset(upsertPreset([], 'x', austriaPreset()), 'x (2)', austriaPreset());
    expect(uniqueName(list, 'x')).toBe('x (3)');
    expect(uniqueName(list, 'y')).toBe('y');
    expect(uniqueName(list, austriaPreset().name)).toBe(`${austriaPreset().name} (2)`);
  });

  it('compares settings without the name', () => {
    expect(sameSettings({ ...austriaPreset(), name: 'a' }, { ...austriaPreset(), name: 'b' })).toBe(true);
    expect(sameSettings(austriaPreset(), canadaPreset())).toBe(false);
  });
});

describe('settings files', () => {
  it('round-trips through export and import', () => {
    const sc = { ...canadaPreset(), name: 'beta 0.03' };
    sc.transport.beta = 0.03;
    const back = parseScenarioFile(scenarioFileContent(sc));
    expect(back).toEqual(sc);
  });

  it('accepts a bare scenario object', () => {
    const sc = austriaPreset();
    expect(parseScenarioFile(JSON.stringify(sc))).toEqual(sc);
  });

  it('rejects files that are not settings', () => {
    expect(() => parseScenarioFile('not json')).toThrow(/JSON/);
    expect(() => parseScenarioFile('{"foo": 1}')).toThrow(/settings/);
  });

  it('makes a safe file name', () => {
    expect(scenarioFileName({ ...austriaPreset(), name: 'a/b: c?' })).toBe('a_b_ c_.json');
  });
});
