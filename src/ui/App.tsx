import { useEffect, useMemo, useState } from 'react';
import { assess } from '../model/limits';
import { austriaPreset } from '../model/presets';
import type { Scenario } from '../model/scenario';
import { Compare, initialSweepSetup, type SweepSetup } from './Compare';
import { Section } from './controls';
import { CropEditor } from './panels/CropEditor';
import { AdvancedPanel, BiologyPanel, FieldPanel, InitialPanel, NumericsPanel, TransportPanel } from './panels/ParameterPanels';
import { PresetBar } from './panels/PresetBar';
import { RotationEditor } from './panels/RotationEditor';
import { Results } from './Results';
import { RunPanel } from './RunPanel';
import { looksLikeScenario, migrateCropNames } from './scenarioEdit';
import { sameSettings } from './userPresets';
import { useSimulation } from './useSimulation';
import { useSweep } from './useSweep';

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
  const sweep = useSweep();
  const [tab, setTab] = useState<'single' | 'compare'>('single');
  const [sweepSetup, setSweepSetup] = useState<SweepSetup>(() => initialSweepSetup(sc));
  const assessment = useMemo(() => assess(sc), [sc]);

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
  const stale = !!run.scenario && !sameSettings(run.scenario, sc);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Scenario">
        <header className="sidebar-head">
          <h1>
            <i>P. brassicae</i> simulator
          </h1>
          <p className="muted">Clubroot spore spread in a field over a crop rotation.</p>
          <PresetBar sc={sc} set={setSc} />
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
        <div className="tabs segmented" role="tablist" aria-label="Results">
          <button type="button" role="tab" aria-selected={tab === 'single'} aria-pressed={tab === 'single'} onClick={() => setTab('single')}>
            Single run
          </button>
          <button type="button" role="tab" aria-selected={tab === 'compare'} aria-pressed={tab === 'compare'} onClick={() => setTab('compare')}>
            Compare values
          </button>
        </div>
        {tab === 'compare' ? (
          <Compare
            sc={sc}
            setup={sweepSetup}
            setSetup={setSweepSetup}
            view={sweep.view}
            onRun={(plan, label, unit) => sweep.run(plan, sc, label, unit)}
            onCancel={sweep.cancel}
          />
        ) : run.status === 'idle' ? (
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
