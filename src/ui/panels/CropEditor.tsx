import { useState } from 'react';
import type { MonthPhase } from '../../model/types';
import { addCrop, cropInUse, cycleMonth, edit, monthName, removeCrop, renameCrop } from '../scenarioEdit';
import type { PanelProps } from './ParameterPanels';

const PHASE_LABEL: Record<MonthPhase, string> = { growth: 'G', dormant: 'R', harvest: 'H' };
const PHASE_NAME: Record<MonthPhase, string> = { growth: 'growing', dormant: 'resting', harvest: 'harvest' };

/** Crop calendars: click a month to cycle growth → dormant → harvest. */
export function CropEditor({ sc, set }: PanelProps) {
  return (
    <div className="crops">
      <p className="info">
        What the plants of each crop do in each calendar month. Click a month to change it: <b>G</b> growing (infection and gall development), <b>R</b> resting (nothing happens), <b>H</b> harvest (galls burst). The calendar of a non-host crop only matters for volunteer plants.
      </p>
      {sc.crops.map((c) => {
        const used = cropInUse(sc, c.name);
        return (
          <div key={c.name} className="crop">
            <div className="crop-head">
              <CropName name={c.name} onRename={(n) => set(renameCrop(sc, c.name, n))} />
              <label title="Host plants can be infected by P. brassicae.">
                <input type="checkbox" checked={c.isHost} onChange={(e) => set(edit(sc, (d) => (d.crops.find((x) => x.name === c.name)!.isHost = e.target.checked)))} /> host
              </label>
              <button
                type="button"
                className="icon"
                aria-label={`Delete ${c.name}`}
                title={used ? 'Used in the rotation' : 'Delete crop'}
                disabled={used}
                onClick={() => set(removeCrop(sc, c.name))}
              >
                ×
              </button>
            </div>
            <div className="months" role="group" aria-label={`${c.name} calendar`}>
              {c.months.map((ph, m) => (
                <button
                  type="button"
                  key={m}
                  className={`month ${ph}`}
                  title={`${monthName(m)}: ${PHASE_NAME[ph]}`}
                  aria-label={`${monthName(m)}: ${PHASE_NAME[ph]}`}
                  onClick={() => set(cycleMonth(sc, c.name, m))}
                >
                  <span className="m-name">{monthName(m)[0]}</span>
                  <span className="m-phase">{PHASE_LABEL[ph]}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => set(addCrop(sc))}>
        + Add crop
      </button>
    </div>
  );
}

function CropName({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [text, setText] = useState(name);
  const [prev, setPrev] = useState(name);
  if (prev !== name) {
    setPrev(name);
    setText(name);
  }
  return (
    <input
      className="crop-name"
      aria-label="Crop name"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        // A refused rename (empty or duplicate name) falls back to the old name.
        if (text.trim() && text !== name) onRename(text);
        setText(name);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
