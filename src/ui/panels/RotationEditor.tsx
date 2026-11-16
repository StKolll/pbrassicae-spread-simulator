import { useState } from 'react';
import { weeksInMonths } from '../../model/calendar';
import type { Scenario } from '../../model/scenario';
import type { Crop, MonthPhase, PesticideEvent, Season } from '../../model/types';
import { NumberInput } from '../controls';
import {
  addSeason,
  copyPesticideToSameCrop,
  edit,
  editRotation,
  fillRotation,
  monthName,
  monthOfSeasonWeek,
  moveSeason,
  removeSeason,
  seasonLabel,
  type RotationTemplate,
} from '../scenarioEdit';
import type { PanelProps } from './ParameterPanels';

const PHASE_TEXT: Record<MonthPhase, string> = {
  growth: 'growing: infection and gall development',
  dormant: 'resting: nothing happens to the plants',
  harvest: 'harvest: galls burst and release spores',
};

/**
 * The crop rotation as a list of seasons (usually one per year). Seasons follow each other
 * without gaps, so only the simulation start month can be chosen. Each season shows a month
 * strip of what the host plants do.
 */
export function RotationEditor({ sc, set }: PanelProps) {
  const cropByName = new Map(sc.crops.map((c) => [c.name, c]));
  const upRot = (f: Parameters<typeof editRotation>[1]) => set(editRotation(sc, f));
  const totalMonths = sc.rotation.reduce((a, s) => a + s.lengthMonths, 0);
  const volunteerCrop = cropByName.get(sc.volunteerCrop);

  return (
    <div className="rotation">
      <p className="info">
        Only <b>host</b> crops (canola) can be infected. Spores move and decay under every crop. The month calendars are set under <i>Crop calendars</i>.
      </p>

      <RotationTemplateBox sc={sc} set={set} />

      <div className="field">
        <label htmlFor="rot-start">Simulation starts in</label>
        <div className="field-control">
          <select id="rot-start" value={sc.rotation[0].startMonth} onChange={(e) => upRot((r) => (r[0].startMonth = Number(e.target.value)))}>
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="strip-legend" aria-hidden>
        <span>
          <i className="cell growth" /> growing
        </span>
        <span>
          <i className="cell dormant" /> resting
        </span>
        <span>
          <i className="cell harvest" /> harvest
        </span>
        <span>
          <i className="cell none" /> no host
        </span>
      </div>

      <ol className="seasons">
        {sc.rotation.map((s, i) => (
          <SeasonItem key={i} sc={sc} set={set} i={i} crop={cropByName.get(s.crop)} volunteerCrop={volunteerCrop} />
        ))}
      </ol>
      <button type="button" onClick={() => set(addSeason(sc))}>
        + Add season
      </button>
      <p className="info">
        {sc.rotation.length} seasons · {(totalMonths / 12).toFixed(totalMonths % 12 ? 1 : 0)} years.
      </p>

      <div className="field">
        <label htmlFor="vol-crop">Volunteer plants grow like</label>
        <div className="field-control">
          <select id="vol-crop" value={sc.volunteerCrop} onChange={(e) => set(edit(sc, (d) => (d.volunteerCrop = e.target.value)))}>
            {sc.crops.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">Volunteers are canola plants sprouting from seed lost at an earlier harvest. They can keep the disease going in years without a host crop.</p>
      </div>
    </div>
  );
}

function SeasonItem({ sc, set, i, crop, volunteerCrop }: PanelProps & { i: number; crop?: Crop; volunteerCrop?: Crop }) {
  const s = sc.rotation[i];
  const host = crop?.isHost ?? false;
  const weeks = weeksInMonths(s.startMonth, s.lengthMonths);
  const pest = s.pesticide ?? [];
  const volunteers = s.volunteers ?? 0;
  const [showLength, setShowLength] = useState(s.lengthMonths !== 12);
  const upRot = (f: Parameters<typeof editRotation>[1]) => set(editRotation(sc, f));
  const setPest = (f: (p: PesticideEvent[]) => void) =>
    upRot((r) => {
      const list = (r[i].pesticide ??= []);
      f(list);
      if (!list.length) delete r[i].pesticide;
    });

  // What the host plants do in each month of this season.
  const phaseOf = (month: number): MonthPhase | null => {
    if (host) return crop!.months[month];
    if (volunteers > 0 && volunteerCrop) return volunteerCrop.months[month];
    return null;
  };

  return (
    <li className={host ? 'season host' : 'season'}>
      <div className="season-head">
        <span className="season-label">{seasonLabel(sc.rotation, i)}</span>
        <span className="season-tools">
          <button type="button" className="icon" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => set(moveSeason(sc, i, i - 1))}>
            ↑
          </button>
          <button type="button" className="icon" aria-label="Move down" title="Move down" disabled={i === sc.rotation.length - 1} onClick={() => set(moveSeason(sc, i, i + 1))}>
            ↓
          </button>
          <button type="button" className="icon" aria-label="Remove season" title="Remove season" disabled={sc.rotation.length <= 1} onClick={() => set(removeSeason(sc, i))}>
            ×
          </button>
        </span>
      </div>
      <div className="season-row">
        <select className="season-crop" aria-label={`${seasonLabel(sc.rotation, i)} crop`} value={s.crop} onChange={(e) => upRot((r) => (r[i].crop = e.target.value))}>
          {sc.crops.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
              {c.isHost ? ' · host' : ''}
            </option>
          ))}
        </select>
      </div>

      <MonthStrip season={s} phaseOf={phaseOf} volunteer={!host && volunteers > 0} />

      <div className="season-row">
        {!host && (
          <label title={`Volunteer plants growing in this season, following the "${sc.volunteerCrop}" calendar.`}>
            Volunteer plants
            <NumberInput ariaLabel={`Season ${i + 1} volunteers`} integer value={volunteers} width="3em" onChange={(v) => upRot((r) => (r[i].volunteers = Math.max(0, v)))} />
          </label>
        )}
        {showLength ? (
          <label>
            Length
            <NumberInput ariaLabel={`Season ${i + 1} length in months`} integer value={s.lengthMonths} width="3em" onChange={(v) => upRot((r) => (r[i].lengthMonths = Math.max(1, Math.min(36, v))))} />
            months
          </label>
        ) : (
          <button type="button" className="link" onClick={() => setShowLength(true)}>
            change length
          </button>
        )}
      </div>

      {pest.map((ev, k) => (
        <div className="season-row pesticide" key={k}>
          <span aria-hidden>▼</span> Pesticide in week
          <NumberInput ariaLabel="Pesticide week" integer value={ev.week} width="3em" onChange={(v) => setPest((p) => (p[k].week = Math.max(0, Math.min(weeks - 1, v))))} />
          <span className="muted">({monthName(monthOfSeasonWeek(s.startMonth, ev.week))})</span>
          kills
          <NumberInput
            ariaLabel="Pesticide kill percentage"
            value={Math.round(ev.killFraction * 1000) / 10}
            width="3.5em"
            onChange={(v) => setPest((p) => (p[k].killFraction = Math.max(0, Math.min(100, v)) / 100))}
          />
          %
          <button type="button" className="icon" aria-label="Remove pesticide event" title="Remove" onClick={() => setPest((p) => p.splice(k, 1))}>
            ×
          </button>
        </div>
      ))}
      <div className="season-row">
        <button type="button" className="link" onClick={() => setPest((p) => p.push({ week: Math.min(9, weeks - 1), killFraction: 0.4 }))}>
          + pesticide
        </button>
        {pest.length > 0 && sc.rotation.some((o, j) => j !== i && o.crop === s.crop) && (
          <button type="button" className="link" onClick={() => set(copyPesticideToSameCrop(sc, i))}>
            copy to all “{s.crop}” seasons
          </button>
        )}
      </div>
    </li>
  );
}

/** One cell per month of the season, coloured by what the host plants do. */
function MonthStrip({ season, phaseOf, volunteer }: { season: Season; phaseOf: (m: number) => MonthPhase | null; volunteer: boolean }) {
  const months = Array.from({ length: season.lengthMonths }, (_, k) => (season.startMonth + k) % 12);
  return (
    <div className={volunteer ? 'month-strip volunteer' : 'month-strip'} style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
      {months.map((m, k) => {
        const ph = phaseOf(m);
        const text = ph ? (volunteer ? `volunteers ${PHASE_TEXT[ph]}` : PHASE_TEXT[ph]) : 'no host plants';
        return (
          <span key={k} className="strip-month" title={`${monthName(m)}: ${text}`}>
            <span className="m-name">{monthName(m)[0]}</span>
            <i className={`cell ${ph ?? 'none'}`} />
          </span>
        );
      })}
    </div>
  );
}

const EVERY = [1, 2, 3, 4, 5, 6];
const ordinal = (n: number) => (n === 1 ? 'every year' : `every ${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} year`);

/** Fill the whole rotation from a simple pattern: host every n-th year, another crop otherwise. */
function RotationTemplateBox({ sc, set }: { sc: Scenario; set: (s: Scenario) => void }) {
  const hosts = sc.crops.filter((c) => c.isHost);
  const others = sc.crops.filter((c) => !c.isHost);
  const usedHost = sc.rotation.find((s) => hosts.some((c) => c.name === s.crop))?.crop;
  const usedOther = sc.rotation.find((s) => others.some((c) => c.name === s.crop))?.crop;
  const [t, setT] = useState<RotationTemplate>(() => {
    const hostYears = sc.rotation.map((s, k) => (hosts.some((c) => c.name === s.crop) ? k : -1)).filter((k) => k >= 0);
    return {
      host: usedHost ?? hosts[0]?.name ?? '',
      other: usedOther ?? others[0]?.name ?? '',
      every: hostYears.length > 1 ? hostYears[1] - hostYears[0] : 2,
      years: sc.rotation.length,
    };
  });
  // Fall back if a crop was renamed or deleted.
  const host = hosts.some((c) => c.name === t.host) ? t.host : (usedHost ?? hosts[0]?.name);
  const other = others.some((c) => c.name === t.other) ? t.other : (usedOther ?? others[0]?.name);
  if (!host) return null;

  return (
    <div className="rotation-template">
      <div className="template-title">Quick fill</div>
      <div className="template-row">
        <select aria-label="Host crop" value={host} onChange={(e) => setT({ ...t, host: e.target.value })}>
          {hosts.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="template-row">
        <select aria-label="How often" value={t.every} onChange={(e) => setT({ ...t, every: Number(e.target.value) })}>
          {EVERY.map((n) => (
            <option key={n} value={n}>
              {ordinal(n)}
            </option>
          ))}
        </select>
      </div>
      {t.every > 1 && other && (
        <div className="template-row">
          <span>otherwise</span>
          <select aria-label="Crop in the other years" value={other} onChange={(e) => setT({ ...t, other: e.target.value })}>
            {others.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="template-row">
        <span>for</span>
        <NumberInput ariaLabel="Number of years" integer value={t.years} width="3em" onChange={(v) => setT({ ...t, years: Math.max(1, Math.min(30, v)) })} />
        <span>years</span>
        <button type="button" onClick={() => set(fillRotation(sc, { ...t, host, other: other ?? host }))}>
          Fill rotation
        </button>
      </div>
    </div>
  );
}
