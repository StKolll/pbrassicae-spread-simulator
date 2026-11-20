import { describe, expect, it } from 'vitest';
import { LIMITS, assess } from '../src/model/limits';
import { austriaPreset } from '../src/model/presets';
import {
  MAX_GROUPS,
  addGroup,
  describeGroup,
  groupColors,
  groupCount,
  groupScenarios,
  groupValue,
  groupParam,
  initialCompareSetup,
  parallelRuns,
  planGroups,
  removeGroup,
  setGroupValue,
  setSame,
} from '../src/ui/groups';

const beta = groupParam('beta')!;

describe('comparison groups', () => {
  it('starts with two identical groups and refuses to run them', () => {
    const sc = austriaPreset();
    const setup = initialCompareSetup();
    expect(groupCount(setup)).toBe(2);
    const plan = planGroups(sc, setup, 8);
    expect(plan.errors[0].message).toMatch(/All groups are the same/);
  });

  it('copies group A when a row stops being the same, and drops values when it is ticked again', () => {
    const sc = austriaPreset();
    let setup = setSame(initialCompareSetup(), sc, 'beta', false);
    expect(groupValue(setup, sc, 1, beta)).toBe(sc.transport.beta);
    setup = setGroupValue(setup, 1, 'beta', 0.05);
    expect(groupValue(setup, sc, 1, beta)).toBe(0.05);
    expect(groupValue(setup, sc, 0, beta)).toBe(sc.transport.beta);
    setup = setSame(setup, sc, 'beta', true);
    expect(setup.varying).toEqual([]);
    expect(groupValue(setup, sc, 1, beta)).toBe(sc.transport.beta);
  });

  it('adds copies of the last group, up to the maximum, and keeps at least two', () => {
    const sc = austriaPreset();
    let setup = setGroupValue(setSame(initialCompareSetup(), sc, 'beta', false), 1, 'beta', 0.05);
    setup = addGroup(setup, sc);
    expect(groupValue(setup, sc, 2, beta)).toBe(0.05);
    for (let i = 0; i < 10; i++) setup = addGroup(setup, sc);
    expect(groupCount(setup)).toBe(MAX_GROUPS);
    setup = removeGroup(setup, 1);
    expect(groupCount(setup)).toBe(MAX_GROUPS - 1);
    expect(removeGroup(removeGroup(removeGroup(setup, 1), 1), 1).others).toHaveLength(1);
    expect(removeGroup(setup, 0)).toBe(setup);
  });

  it('changes only the varying parameters, several at once', () => {
    const sc = austriaPreset();
    let setup = setSame(setSame(initialCompareSetup(), sc, 'beta', false), sc, 'flow', false);
    setup = setGroupValue(setGroupValue(setup, 1, 'beta', 0.05), 1, 'flow', 'uniform');
    const [a, b] = groupScenarios(sc, setup);
    expect({ ...a, name: '' }).toEqual({ ...sc, name: '' });
    expect(b.transport.beta).toBe(0.05);
    expect(b.transport.velocity.preset).toBe('uniform');
    expect({ ...b, name: '', transport: sc.transport }).toEqual({ ...sc, name: '' });
    expect(describeGroup(sc, setup, 1)).toBe('β = 0.05 m²/week · flow: Uniform flow');
    // Flow speed has no effect without water flow, so it is left out of group A's description.
    setup = setSame(setup, sc, 'vmax', false);
    expect(describeGroup(sc, setup, 0)).not.toMatch(/v_max/);
    expect(describeGroup(sc, setup, 1)).toMatch(/v_max = /);
  });

  it('plans one run per group with the same snapshot weeks within the memory budget', () => {
    const sc = austriaPreset();
    sc.grid = { ...sc.grid, nx: 151, ny: 151 };
    sc.rotation = Array.from({ length: 30 }, () => ({ ...sc.rotation[0] }));
    let setup = setSame(initialCompareSetup(), sc, 'seed', false);
    for (let k = 0; k < 4; k++) setup = addGroup(setup, sc);
    setup.others.forEach((_, j) => (setup = setGroupValue(setup, j + 1, 'seed', j + 100)));
    const plan = planGroups(sc, setup, 8);
    expect(plan.runs.map((r) => r.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(new Set(plan.runs.map((r) => r.scenario.snapshotEveryWeeks)).size).toBe(1);
    const bytes = plan.runs.reduce((s, r) => s + assess(r.scenario).cost!.frameBytes, 0);
    expect(bytes).toBeLessThanOrEqual(LIMITS.maxFrameBytes);
    expect(sc.snapshotEveryWeeks).toBe(austriaPreset().snapshotEveryWeeks);
  });

  it('reports errors per group and warns about identical groups', () => {
    const sc = austriaPreset();
    let setup = setSame(initialCompareSetup(), sc, 'initialCount', false);
    setup = addGroup(setGroupValue(setup, 1, 'initialCount', 100000), sc);
    setup = setGroupValue(setup, 2, 'initialCount', sc.initial.count);
    const plan = planGroups(sc, setup, 8);
    expect(plan.errors.some((e) => e.message.startsWith('Group B:'))).toBe(true);
    expect(plan.warnings.some((w) => /Groups A and C have the same settings/.test(w.message))).toBe(true);
  });

  it('runs at most 4 at once and leaves a core free', () => {
    expect(parallelRuns(5, 16)).toBe(4);
    expect(parallelRuns(5, 2)).toBe(1);
    expect(parallelRuns(2, 8)).toBe(2);
  });

  it('gives each group its own colour', () => {
    expect(new Set(groupColors(5, false)).size).toBe(5);
    expect(new Set(groupColors(5, true)).size).toBe(5);
  });
});
