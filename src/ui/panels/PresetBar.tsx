import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { presets } from '../../model/presets';
import type { Scenario } from '../../model/scenario';
import { matchingPreset, presetNames, type PresetName } from '../scenarioEdit';
import {
  loadUserPresets,
  parseScenarioFile,
  presetNameProblem,
  removePreset,
  sameSettings,
  scenarioFileContent,
  scenarioFileName,
  storeUserPresets,
  uniqueName,
  upsertPreset,
  type UserPreset,
} from '../userPresets';

interface Props {
  sc: Scenario;
  set: Dispatch<SetStateAction<Scenario>>;
}

const BUILT_IN = 'b:';
const USER = 'u:';

/**
 * Preset picker with the user's own presets: save, save as, delete, export to and import from
 * a JSON file. User presets live in this browser's storage; files move them between computers.
 */
export function PresetBar({ sc, set }: Props) {
  const [list, setList] = useState<UserPreset[]>(loadUserPresets);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (next: UserPreset[]) => {
    setList(next);
    if (!storeUserPresets(next)) setMessage({ text: 'The browser did not allow saving. Use Export to keep a file instead.', error: true });
  };

  const builtIn = matchingPreset(sc);
  const ownMatch = builtIn ? undefined : list.find((p) => p.name === sc.name && sameSettings(p.scenario, sc));
  /** The user preset the current settings came from (possibly modified since). */
  const ownBase = list.find((p) => p.name === sc.name);
  const modifiedOwn = !!ownBase && !ownMatch;
  const selectValue = builtIn ? BUILT_IN + builtIn : ownMatch ? USER + ownMatch.name : '';

  const choose = (value: string) => {
    setMessage(null);
    setNaming(false);
    if (value.startsWith(BUILT_IN)) {
      const n = value.slice(BUILT_IN.length) as PresetName;
      if (n in presets) set(presets[n]());
    } else if (value.startsWith(USER)) {
      const p = list.find((p) => p.name === value.slice(USER.length));
      if (p) set(structuredClone(p.scenario));
    }
  };

  const saveAs = (name: string) => {
    const n = name.trim();
    const problem = presetNameProblem(n);
    if (problem) return setMessage({ text: problem, error: true });
    if (n !== sc.name && list.some((p) => p.name === n) && !window.confirm(`Replace your preset "${n}"?`)) return;
    update(upsertPreset(list, n, sc));
    set((cur) => ({ ...cur, name: n }));
    setNaming(false);
    setMessage({ text: `Saved as "${n}".` });
  };

  const save = () => {
    if (!ownBase) return;
    update(upsertPreset(list, ownBase.name, sc));
    setMessage({ text: `Saved "${ownBase.name}".` });
  };

  const remove = () => {
    if (!ownBase || !window.confirm(`Delete your preset "${ownBase.name}"? Exported files are not affected.`)) return;
    update(removePreset(list, ownBase.name));
    setMessage({ text: `Deleted "${ownBase.name}". The current settings are kept.` });
  };

  const exportFile = () => {
    const blob = new Blob([scenarioFileContent(sc)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = scenarioFileName(sc);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importFile = async (file: File) => {
    try {
      const imported = parseScenarioFile(await file.text());
      if (matchingPreset(imported)) {
        set(imported);
        setMessage({ text: `Loaded the built-in preset "${imported.name}".` });
        return;
      }
      const same = list.find((p) => sameSettings(p.scenario, imported));
      if (same) {
        set(structuredClone(same.scenario));
        setMessage({ text: `These settings are already saved as "${same.name}".` });
        return;
      }
      const name = uniqueName(list, imported.name);
      update(upsertPreset(list, name, imported));
      set({ ...imported, name });
      setMessage({ text: `Imported as "${name}".` });
    } catch (e) {
      setMessage({ text: `Import failed: ${(e as Error).message}`, error: true });
    }
  };

  return (
    <div className="preset-bar">
      <div className="field">
        <label htmlFor="preset">Preset</label>
        <div className="field-control">
          <select id="preset" value={selectValue} onChange={(e) => choose(e.target.value)}>
            {!selectValue && <option value="">Modified ({sc.name})</option>}
            <optgroup label="Built-in">
              {presetNames.map((n) => (
                <option key={n} value={BUILT_IN + n}>
                  {n}
                </option>
              ))}
            </optgroup>
            {list.length > 0 && (
              <optgroup label="My presets">
                {list.map((p) => (
                  <option key={p.name} value={USER + p.name}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {naming ? (
        <form
          className="preset-actions"
          onSubmit={(e) => {
            e.preventDefault();
            saveAs(draftName);
          }}
        >
          <input
            className="preset-name"
            aria-label="Name for the new preset"
            placeholder="e.g. beta 0.03"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
          />
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="preset-actions">
          {ownBase && modifiedOwn && (
            <button type="button" title={`Overwrite "${ownBase.name}" with the current settings`} onClick={save}>
              Save
            </button>
          )}
          <button
            type="button"
            title="Save the current settings under a new name"
            onClick={() => {
              setDraftName(ownBase || builtIn ? `${sc.name} (copy)` : sc.name);
              setNaming(true);
              setMessage(null);
            }}
          >
            Save as…
          </button>
          {ownBase && (
            <button type="button" title={`Delete "${ownBase.name}" from your presets`} onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" title="Download the current settings as a file" onClick={exportFile}>
            Export
          </button>
          <button type="button" title="Load settings from an exported file" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
      )}
      {message && <p className={message.error ? 'preset-msg error' : 'preset-msg'}>{message.text}</p>}
    </div>
  );
}
