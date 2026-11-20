import { makeGrid } from '../../model/grid';
import { diffusionNumber } from '../../model/limits';
import { plantLattice } from '../../model/plants';
import type { Scenario } from '../../model/scenario';
import { CheckboxField, NumberInput, SelectField, SliderField } from '../controls';
import { BOUNDARY_OPTIONS, VELOCITY_OPTIONS } from '../groups';
import { edit, monthName } from '../scenarioEdit';
import { fmtNum } from '../theme';

export interface PanelProps {
  sc: Scenario;
  set: (sc: Scenario) => void;
}

export function FieldPanel({ sc, set }: PanelProps) {
  const up = (f: (d: Scenario) => void) => set(edit(sc, f));
  let info: string;
  try {
    const g = makeGrid(sc.grid);
    const n = sc.plants.spacing >= 2 * sc.plants.rootRadius ? plantLattice(g, sc.plants).length : 0;
    info = `Cell size ${fmtNum(g.dx)} × ${fmtNum(g.dy)} m · ${g.N.toLocaleString('en')} unknowns · ${n} plants`;
  } catch {
    info = 'Invalid grid';
  }
  return (
    <>
      <SliderField label="Field length x" unit="m" min={5} max={100} value={sc.grid.Lx} onChange={(v) => up((d) => (d.grid.Lx = v))} />
      <SliderField label="Field length y" unit="m" min={5} max={100} value={sc.grid.Ly} onChange={(v) => up((d) => (d.grid.Ly = v))} />
      <SliderField label="Grid points x" min={21} max={151} step={2} integer value={sc.grid.nx} onChange={(v) => up((d) => (d.grid.nx = v))} />
      <SliderField label="Grid points y" min={21} max={151} step={2} integer value={sc.grid.ny} onChange={(v) => up((d) => (d.grid.ny = v))} />
      <SliderField label="Root radius" unit="m" min={0.05} max={1} value={sc.plants.rootRadius} onChange={(v) => up((d) => (d.plants.rootRadius = v))} />
      <SliderField
        label="Plant spacing"
        unit="m"
        min={0.1}
        max={3}
        value={sc.plants.spacing}
        hint="Distance between plants on the square lattice; at least twice the root radius."
        onChange={(v) => up((d) => (d.plants.spacing = v))}
      />
      <SliderField label="Border margin" unit="m" min={0.05} max={5} value={sc.plants.margin} onChange={(v) => up((d) => (d.plants.margin = v))} />
      <p className="info">{info}</p>
    </>
  );
}

export function BiologyPanel({ sc, set }: PanelProps) {
  const up = (f: (d: Scenario) => void) => set(edit(sc, f));
  const b = sc.biology;
  return (
    <>
      <SliderField
        label="Spore half-life"
        unit="years"
        min={0.5}
        max={20}
        value={b.halfLifeYears}
        hint={`Decay rate κ = ln(0.5)/(HL·52) = ${fmtNum(Math.log(0.5) / (b.halfLifeYears * 52), 3)} per week.`}
        onChange={(v) => up((d) => (d.biology.halfLifeYears = v))}
      />
      <SliderField
        label="Infection threshold c*"
        unit="spores/g soil"
        log
        min={1e3}
        max={1e6}
        value={b.threshold}
        hint="A plant is infected when the mean concentration over its root area reaches c*."
        onChange={(v) => up((d) => (d.biology.threshold = v))}
      />
      <SliderField
        label="Spores per infected plant Y"
        unit="spores"
        log
        min={1e8}
        max={1e12}
        value={b.sporesPerPlant}
        onChange={(v) => up((d) => (d.biology.sporesPerPlant = v))}
      />
      <SliderField
        label="Gall development time ω"
        unit="weeks of growth"
        min={sc.tau}
        max={16}
        step={sc.tau}
        value={b.gallWeeks}
        hint="Time from infection to spore release. Counts only weeks in which the host grows."
        onChange={(v) => up((d) => (d.biology.gallWeeks = v))}
      />
      <SliderField
        label="Spores kept in topsoil r_rain"
        min={0}
        max={1}
        step={0.01}
        value={b.rainKept}
        hint="Fraction of released spores that stays in the topsoil; the rest is washed out."
        onChange={(v) => up((d) => (d.biology.rainKept = v))}
      />
    </>
  );
}

export function TransportPanel({ sc, set }: PanelProps) {
  const up = (f: (d: Scenario) => void) => set(edit(sc, f));
  const t = sc.transport;
  const flow = t.velocity.preset !== 'none';
  const directed = t.velocity.preset === 'uniform' || t.velocity.preset === 'unilateralDepression';
  return (
    <>
      <SliderField
        label="Diffusion β"
        unit="m²/week"
        log
        min={0.0001}
        max={10}
        value={t.beta}
        hint="Most uncertain parameter. Resting spores barely move in soil: try 0.001–0.05. Large β smears spores out below the threshold and drains them over the field edge."
        onChange={(v) => up((d) => (d.transport.beta = v))}
      />
      <SelectField label="Water flow" value={t.velocity.preset} options={VELOCITY_OPTIONS} onChange={(v) => up((d) => (d.transport.velocity.preset = v))} />
      <SliderField
        label="Max water velocity"
        unit="m/week"
        min={0}
        max={10}
        step={0.05}
        disabled={!flow}
        value={t.velocity.vmax}
        onChange={(v) => up((d) => (d.transport.velocity.vmax = v))}
      />
      <SliderField
        label="Flow direction"
        unit="° (0 = +x, 90 = +y)"
        min={0}
        max={360}
        step={5}
        integer
        disabled={!directed}
        value={t.velocity.angleDeg}
        onChange={(v) => up((d) => (d.transport.velocity.angleDeg = v))}
      />
      <SelectField
        label="Field boundary"
        value={t.boundary}
        options={BOUNDARY_OPTIONS}
        onChange={(v) => up((d) => (d.transport.boundary = v))}
      />
    </>
  );
}

export function InitialPanel({ sc, set }: PanelProps) {
  const up = (f: (d: Scenario) => void) => set(edit(sc, f));
  const i = sc.initial;
  return (
    <>
      <SliderField
        label="Initially infected plants"
        min={0}
        max={50}
        step={1}
        integer
        value={i.count}
        onChange={(v) => up((d) => (d.initial.count = v))}
      />
      <SliderField
        label="Max initial intensity"
        unit="× threshold"
        min={1}
        max={20}
        step={0.5}
        value={i.maxIntensity}
        hint="Each initial plant gets a cone with mean concentration between 1 and this value times c*."
        onChange={(v) => up((d) => (d.initial.maxIntensity = v))}
      />
      <div className="field">
        <label>Random seed</label>
        <div className="field-control">
          <NumberInput ariaLabel="Random seed" integer value={i.seed} onChange={(v) => up((d) => (d.initial.seed = v))} />
          <button type="button" onClick={() => up((d) => (d.initial.seed = Math.floor(Math.random() * 1e6)))} title="New random positions">
            New seed
          </button>
        </div>
      </div>
    </>
  );
}

export function NumericsPanel({ sc, set }: PanelProps) {
  const up = (f: (d: Scenario) => void) => set(edit(sc, f));
  return (
    <>
      <SelectField
        label="Time step τ"
        unit="weeks"
        value={sc.tau}
        options={[1, 0.5, 0.25, 0.125].map((v) => ({ value: v, label: v === 1 ? '1' : `1/${1 / v}` }))}
        onChange={(v) => up((d) => (d.tau = v))}
      />
      <SelectField
        label="Linear solver"
        value={sc.solver}
        hint={`Diffusion number β·τ/dx² = ${fmtNum(diffusionNumber(sc))}. The fast solver is only accurate below 0.1 (small β or fine time steps).`}
        options={[
          { value: 'banded', label: 'Exact (banded LU)' },
          { value: 'amf', label: 'Fast (approximate factorisation)' },
        ]}
        onChange={(v) => up((d) => (d.solver = v))}
      />
      <SelectField
        label="Advection scheme"
        value={sc.transport.scheme}
        options={[
          { value: 'upwind', label: 'Upwind (no oscillations)' },
          { value: 'central', label: 'Central (2nd order)' },
        ]}
        onChange={(v) => up((d) => (d.transport.scheme = v))}
      />
      <SliderField
        label="Snapshot every"
        unit="weeks"
        min={1}
        max={13}
        step={1}
        integer
        value={sc.snapshotEveryWeeks}
        onChange={(v) => up((d) => (d.snapshotEveryWeeks = Math.max(1, v)))}
      />
    </>
  );
}

export function AdvancedPanel({ sc, set }: PanelProps) {
  const up = (f: (d: Scenario) => void) => set(edit(sc, f));
  const b = sc.biology;
  return (
    <>
      <SliderField label="Soil density ζ" unit="kg/m³" min={1200} max={1700} step={10} value={b.soilDensity} onChange={(v) => up((d) => (d.biology.soilDensity = v))} />
      <SliderField label="Topsoil depth d" unit="m" min={0.05} max={0.5} step={0.01} value={b.topsoilDepth} onChange={(v) => up((d) => (d.biology.topsoilDepth = v))} />
      <CheckboxField
        label="Seasonal decay"
        hint="Multiply the decay rate by a factor per month (e.g. slower decay in a cold winter)."
        checked={!!b.seasonalDecay}
        onChange={(on) => up((d) => (d.biology.seasonalDecay = on ? Array(12).fill(1) : null))}
      />
      {b.seasonalDecay && (
        <div className="month-grid">
          {b.seasonalDecay.map((f, m) => (
            <label key={m}>
              <span>{monthName(m)}</span>
              <NumberInput ariaLabel={`Decay factor ${monthName(m)}`} value={f} onChange={(v) => up((d) => (d.biology.seasonalDecay![m] = v))} width="3.5em" />
            </label>
          ))}
        </div>
      )}
    </>
  );
}
