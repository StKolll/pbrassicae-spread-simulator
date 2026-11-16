import { describe, expect, it } from 'vitest';
import { makeGrid } from '../src/model/grid';
import {
  PlantPopulation,
  PlantState,
  addCone,
  addConeWithMean,
  plantLattice,
  rootArea,
  rootMean,
} from '../src/model/plants';
import { austriaPreset, canadaPreset } from '../src/model/presets';
import { cellSoilGrams, type Scenario } from '../src/model/scenario';
import { simulate } from '../src/model/simulate';

const g = makeGrid({ Lx: 10, Ly: 10, nx: 51, ny: 51 }); // dx = 0.2

describe('root areas and cones', () => {
  it('root area is a disc of cells around the plant', () => {
    const pl = rootArea(g, 5, 5, 0.45);
    // Cells within 0.45 m on a 0.2 m grid: centre, 4 at 0.2, 4 at 0.28, 4 at 0.4, 8 at 0.447.
    expect(pl.cells.length).toBe(21);
    expect(Math.max(...pl.weights)).toBe(1);
  });

  it('a radius below the grid spacing still gives one cell', () => {
    const pl = rootArea(g, 5.05, 5.05, 0.01);
    expect(pl.cells.length).toBe(1);
  });

  it('addCone adds exactly the requested number of spores', () => {
    const pl = rootArea(g, 3, 4, 0.5);
    const p = new Float64Array(g.N);
    addCone(p, pl, 1e9, 123);
    expect(p.reduce((a, b) => a + b, 0) * 123).toBeCloseTo(1e9, 0);
  });

  it('addConeWithMean gives the requested root-area mean', () => {
    const pl = rootArea(g, 3, 4, 0.5);
    const p = new Float64Array(g.N);
    addConeWithMean(p, pl, 7);
    expect(rootMean(p, pl)).toBeCloseTo(7, 12);
  });

  it('lattice respects margin and spacing', () => {
    const plants = plantLattice(g, { rootRadius: 0.3, spacing: 1, margin: 1 });
    expect(plants.length).toBe(9 * 9);
    expect(() => plantLattice(g, { rootRadius: 0.6, spacing: 1, margin: 1 })).toThrow();
  });
});

describe('gall state machine', () => {
  const plants = [rootArea(g, 2, 2, 0.3), rootArea(g, 6, 6, 0.3)];

  it('infects at the threshold, counts down ω steps, then bursts once', () => {
    const pop = new PlantPopulation(plants);
    pop.replant('all');
    const p = new Float64Array(g.N);
    addConeWithMean(p, plants[0], 10); // above threshold 5
    addConeWithMean(p, plants[1], 4.9); // below
    const released: number[] = [];
    const rel = (pl: (typeof plants)[number]) => released.push(pl.x);
    expect(pop.growthStep(p, 5, 3, rel)).toBe(0);
    expect(pop.state[0]).toBe(PlantState.Infected);
    expect(pop.state[1]).toBe(PlantState.Healthy);
    expect(pop.growthStep(p, 5, 3, rel)).toBe(0); // countdown 2
    expect(pop.growthStep(p, 5, 3, rel)).toBe(0); // countdown 1
    expect(pop.growthStep(p, 5, 3, rel)).toBe(1); // burst
    expect(pop.state[0]).toBe(PlantState.Burst);
    expect(pop.growthStep(p, 5, 3, rel)).toBe(0); // dead stays dead
    expect(released).toEqual([2]);
  });

  it('harvest releases all remaining galls', () => {
    const pop = new PlantPopulation(plants);
    pop.replant('all');
    const p = new Float64Array(g.N).fill(10);
    pop.growthStep(p, 5, 100, () => {});
    expect(pop.count(PlantState.Infected)).toBe(2);
    expect(pop.burstAllInfected(() => {})).toBe(2);
    expect(pop.count(PlantState.Burst)).toBe(2);
  });

  it('replant with a subset leaves the others absent', () => {
    const pop = new PlantPopulation(plants);
    pop.replant([1]);
    expect(Array.from(pop.state)).toEqual([PlantState.Absent, PlantState.Healthy]);
  });
});

/** Small, fast scenario for loop tests. */
function small(over: (s: Scenario) => void = () => {}): Scenario {
  const s = austriaPreset();
  s.grid = { Lx: 10, Ly: 10, nx: 31, ny: 31 };
  s.tau = 0.5;
  over(s);
  return s;
}

describe('simulate()', () => {
  it('without transport or decay, spores = initial + released (budget closes)', () => {
    const s = small((s) => {
      s.transport.beta = 0;
      s.biology.halfLifeYears = 1e9;
      s.transport.boundary = 'zeroFlux';
    });
    const r = simulate(s);
    const last = r.series.at(-1)!;
    const expected = r.budget.initial + r.budget.released - r.budget.pesticide;
    expect(last.totalSpores / expected).toBeCloseTo(1, 6);
    expect(r.budget.released).toBeGreaterThan(0);
  });

  it('each burst releases r_rain · Y spores', () => {
    const s = small((s) => {
      s.transport.beta = 0;
      s.biology.halfLifeYears = 1e9;
      s.transport.boundary = 'zeroFlux';
    });
    const r = simulate(s);
    const bursts = r.series.reduce((a, x) => a + x.newBursts, 0);
    expect(bursts).toBeGreaterThan(0);
    expect(r.budget.released).toBeCloseTo(bursts * s.biology.rainKept * s.biology.sporesPerPlant, 0);
  });

  it('initial plants burst after ω weeks of growth (β = 0, no decay)', () => {
    const s = small((s) => {
      s.transport.beta = 0;
      s.biology.halfLifeYears = 1e9;
      s.initial.count = 1;
    });
    const r = simulate(s);
    // Season starts in August (growth). Infection is detected after the first step
    // (t = 0.5); the burst follows ω = 8 weeks later at t = 8.5, i.e. in week 9.
    const first = r.series.findIndex((x) => x.newBursts > 0);
    expect(r.series[first].week).toBe(9);
  });

  it('non-host seasons have no plants and no bursts; host seasons replant', () => {
    const r = simulate(small());
    for (const x of r.series) {
      if (x.seasonIndex >= 1 && x.seasonIndex <= 3) {
        expect(x.planted).toBe(0);
        expect(x.newBursts).toBe(0);
      }
    }
    const lastSeasonStart = r.series.find((x) => x.seasonIndex === 4)!;
    expect(lastSeasonStart.planted).toBe(r.plants.length);
  });

  it('pesticide removes the given fraction', () => {
    const s = small((s) => {
      s.rotation = [{ crop: 'Cereal (e.g. wheat)', startMonth: 7, lengthMonths: 12, pesticide: [{ week: 3, killFraction: 0.4 }] }];
      s.transport.beta = 0;
      s.biology.halfLifeYears = 1e9;
    });
    const r = simulate(s);
    // Applied at the start of season week 3, i.e. between series[2] and series[3].
    expect(r.series[3].totalSpores / r.series[2].totalSpores).toBeCloseTo(0.6, 10);
  });

  it('is deterministic for a given seed and differs for another', () => {
    const a = simulate(small()).series.at(-1)!.totalSpores;
    const b = simulate(small()).series.at(-1)!.totalSpores;
    const c = simulate(small((s) => (s.initial.seed = 7))).series.at(-1)!.totalSpores;
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('can be cancelled', () => {
    let n = 0;
    const r = simulate(small(), { shouldCancel: () => ++n >= 10 });
    expect(r.cancelled).toBe(true);
    expect(r.series).toHaveLength(10);
  });

  it('volunteers grow in fallow seasons (Canada)', () => {
    const s = canadaPreset();
    s.grid = { Lx: 10, Ly: 10, nx: 31, ny: 31 };
    s.tau = 0.5;
    const r = simulate(s);
    const fallow = r.series.filter((x) => x.seasonIndex === 1);
    expect(fallow[0].planted).toBe(3);
  });

  it('cell soil mass uses dx·dy·d·ζ', () => {
    expect(cellSoilGrams(0.2, 0.2, austriaPreset().biology)).toBeCloseTo(0.04 * 0.2 * 1500 * 1000);
  });
});
