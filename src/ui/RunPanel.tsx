import { useState } from 'react';
import { fmtTime, type Assessment } from '../model/limits';
import type { RunStatus } from './useSimulation';

interface Props {
  assessment: Assessment;
  status: RunStatus;
  fraction: number;
  onRun: () => void;
  onCancel: () => void;
}

/** Cost estimate, validation messages and the Run / Cancel buttons. */
export function RunPanel({ assessment, status, fraction, onRun, onCancel }: Props) {
  const [confirming, setConfirming] = useState(false);
  const { cost, issues, ok } = assessment;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const running = status === 'running';

  const run = () => {
    if (warnings.length && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onRun();
  };

  return (
    <div className="run-panel">
      <div className={`cost ${ok ? (warnings.length ? 'warn' : 'ok') : 'bad'}`}>
        {cost ? (
          <>
            <span className="cost-time" title="Estimated run time on a typical laptop">
              {ok ? (warnings.length ? '⚠' : '✓') : '✕'} ~{fmtTime(cost.seconds)}
            </span>
            <span className="muted">
              {(cost.weeks / 52).toFixed(cost.weeks % 52 ? 1 : 0)} years · {cost.steps.toLocaleString('en')} steps · {cost.plants} plants
            </span>
          </>
        ) : (
          <span className="cost-time">✕ cannot estimate</span>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="issues">
          {errors.map((i, k) => (
            <li key={`e${k}`} className="error">
              <b>Error:</b> {i.message}
            </li>
          ))}
          {warnings.map((i, k) => (
            <li key={`w${k}`} className="warning">
              <b>Warning:</b> {i.message}
            </li>
          ))}
        </ul>
      )}
      {running ? (
        <div className="run-row">
          <progress value={fraction} max={1} aria-label="Simulation progress" />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : confirming ? (
        <div className="run-row">
          <span>Run despite {warnings.length === 1 ? 'the warning' : `${warnings.length} warnings`}?</span>
          <button type="button" className="primary" onClick={run}>
            Run
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Back
          </button>
        </div>
      ) : (
        <div className="run-row">
          <button type="button" className="primary run" disabled={!ok} onClick={run}>
            Run simulation
          </button>
        </div>
      )}
    </div>
  );
}
