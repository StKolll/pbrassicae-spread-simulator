import { useEffect, useMemo, useState } from 'react';
import { assess } from '../model/limits';
import { austriaPreset, presets } from '../model/presets';
import type { Scenario } from '../model/scenario';
import { Section } from './controls';
import { CropEditor } from './panels/CropEditor';
import { AdvancedPanel, BiologyPanel, FieldPanel, InitialPanel, NumericsPanel, TransportPanel } from './panels/ParameterPanels';
import { RotationEditor } from './panels/RotationEditor';
import { Results } from './Results';
import { RunPanel } from './RunPanel';
import { looksLikeScenario, matchingPreset, migrateCropNames, presetNames, type PresetName } from './scenarioEdit';
import { useSimulation } from './useSimulation';

const STORAGE_KEY = 'pbrassicae.scenario.v1';

/** The last edited scenario is restored on reload (this browser only). */
function loadStored(): Scenario {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s: unknown = JSON.parse(raw);
      if (looksLikeScenario(s)) return migrateCropNames(s);
    }
  } catch {
    /* storage unavailable or corrupt: fall back to the preset */
  }
  return austriaPreset();
}

export function App() {
  const [sc, setSc] = useState<Scenario>(loadStored);
  const sim = useSimulation();
  const assessment = useMemo(() => assess(sc), [sc]);
  const preset = matchingPreset(sc);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sc));
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [sc]);

  const run = sim.view;
  const stale = !!run.scenario && JSON.stringify(run.scenario) !== JSON.stringify(sc);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Scenario">
        <header className="sidebar-head">
          <h1>
            <i>P. brassicae</i> simulator
          </h1>
          <p className="muted">Clubroot spore spread in a field over a crop rotation.</p>
          <div className="field">
            <label htmlFor="preset">Preset</label>
            <div className="field-control">
              <select
                id="preset"
                value={preset ?? ''}
                onChange={(e) => {
                  const n = e.target.value as PresetName;
                  if (n in presets) setSc(presets[n]());
                }}
              >
                {!preset && <option value="">Modified ({sc.name})</option>}
                {presetNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>
        <div className="sections">
          <Section title="Biology" open>
            <BiologyPanel sc={sc} set={setSc} />
          </Section>
          <Section title="Spore transport">
            <TransportPanel sc={sc} set={setSc} />
          </Section>
          <Section title="Crop rotation">
            <RotationEditor sc={sc} set={setSc} />
          </Section>
          <Section title="Crop calendars">
            <CropEditor sc={sc} set={setSc} />
          </Section>
          <Section title="Initial infection">
            <InitialPanel sc={sc} set={setSc} />
          </Section>
          <Section title="Field, grid and plants">
            <FieldPanel sc={sc} set={setSc} />
          </Section>
          <Section title="Numerics">
            <NumericsPanel sc={sc} set={setSc} />
          </Section>
          <Section title="Advanced">
            <AdvancedPanel sc={sc} set={setSc} />
          </Section>
        </div>
        <RunPanel assessment={assessment} status={run.status} fraction={run.fraction} onRun={() => sim.run(sc)} onCancel={sim.cancel} />
      </aside>
      <main className="main">
        {run.status === 'idle' ? (
          <div className="empty">
            <h2>No results yet</h2>
            <p>
              Choose a preset or change the parameters on the left, then press <b>Run simulation</b>. The run happens in the
              background; results appear week by week and can be played back afterwards.
            </p>
          </div>
        ) : (
          <Results run={run} stale={stale} />
        )}
      </main>
    </div>
  );
}
