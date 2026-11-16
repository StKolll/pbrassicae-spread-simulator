import type { Scenario } from '../../model/scenario';
import type { CalendarWeek } from '../../worker/protocol';

export interface SeasonBand {
  index: number;
  crop: string;
  host: boolean;
  start: number;
  end: number;
  volunteers: number;
  pesticideWeeks: number[];
}

/** Season bands (in simulation weeks) from the calendar of a run. */
export function seasonBands(calendar: CalendarWeek[], sc: Scenario): SeasonBand[] {
  const bands: SeasonBand[] = [];
  const hostByName = new Map(sc.crops.map((c) => [c.name, c.isHost]));
  calendar.forEach((w, k) => {
    const last = bands.at(-1);
    if (last && last.index === w.seasonIndex) {
      last.end = k + 1;
      return;
    }
    const season = sc.rotation[w.seasonIndex];
    bands.push({
      index: w.seasonIndex,
      crop: w.crop,
      host: hostByName.get(w.crop) ?? false,
      start: k,
      end: k + 1,
      volunteers: season?.volunteers ?? 0,
      pesticideWeeks: (season?.pesticide ?? []).map((p) => k + p.week),
    });
  });
  return bands;
}

interface Props {
  bands: SeasonBand[];
  totalWeeks: number;
  /** Week of the current frame. */
  week: number;
  /** Week of the latest available frame (the rest is not computed yet). */
  availableWeek: number;
  frameWeeks: number[];
  frameIndex: number;
  onSeek: (frameIndex: number) => void;
}

/**
 * Season bands with pesticide markers above a slider over the stored frames. The slider is the
 * keyboard-accessible part; clicking a band also seeks.
 */
export function Timeline({ bands, totalWeeks, week, availableWeek, frameWeeks, frameIndex, onSeek }: Props) {
  const pct = (w: number) => `${(100 * w) / Math.max(1, totalWeeks)}%`;
  const seekWeek = (w: number) => {
    // Nearest stored frame at or before w.
    let k = 0;
    while (k + 1 < frameWeeks.length && frameWeeks[k + 1] <= w) k++;
    onSeek(k);
  };
  return (
    <div className="timeline">
      <div
        className="bands"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seekWeek(Math.round(((e.clientX - r.left) / r.width) * totalWeeks));
        }}
      >
        {bands.map((b) => (
          <div
            key={b.index}
            className={b.host ? 'band host' : 'band'}
            style={{ left: pct(b.start), width: pct(b.end - b.start) }}
            title={`Season ${b.index + 1}: ${b.crop}${b.host ? ' (host)' : ''}${b.volunteers ? `, ${b.volunteers} volunteers` : ''}, weeks ${b.start}–${b.end}`}
          >
            <span className="band-label">
              {b.crop}
              {b.volunteers ? ` · ${b.volunteers} vol.` : ''}
            </span>
          </div>
        ))}
        {bands.flatMap((b) =>
          b.pesticideWeeks.map((w) => (
            <span key={`${b.index}-${w}`} className="pest-marker" style={{ left: pct(w) }} title={`Pesticide, week ${w}`}>
              ▼
            </span>
          )),
        )}
        {availableWeek < totalWeeks && <div className="pending" style={{ left: pct(availableWeek), width: pct(totalWeeks - availableWeek) }} />}
        <div className="cursor" style={{ left: pct(week) }} />
      </div>
      <input
        type="range"
        className="scrubber"
        aria-label="Simulation week"
        min={0}
        max={Math.max(0, frameWeeks.length - 1)}
        step={1}
        value={frameIndex}
        style={{ width: frameWeeks.length ? pct(frameWeeks.at(-1)!) : '0%' }}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <div className="years">
        {Array.from({ length: Math.floor(totalWeeks / 52) + 1 }, (_, y) => (
          <span key={y} style={{ left: pct(y * 52) }}>
            {y === 0 ? 'year 0' : y}
          </span>
        ))}
      </div>
    </div>
  );
}
