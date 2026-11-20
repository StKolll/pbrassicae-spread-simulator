import { useMemo } from 'react';
import type { Data, Layout, Shape } from 'plotly.js';
import type { SeriesPoint } from '../../model/simulate';
import type { ChartTheme } from '../theme';
import { PlotlyChart } from './PlotlyChart';
import type { SeasonBand } from './Timeline';

export interface CompareLine {
  name: string;
  color: string;
  series: SeriesPoint[];
}

interface Props {
  lines: CompareLine[];
  /** Changes whenever any series grows (they are appended in place). */
  version: number;
  bands: SeasonBand[];
  totalWeeks: number;
  week: number;
  /** Infection threshold, if the same for all runs (drawn as a reference line). */
  threshold: number | null;
  theme: ChartTheme;
  onSeekWeek: (week: number) => void;
}

/** One small chart per measure, one line per swept value, sharing the week axis. */
export function CompareSeries({ lines, version, bands, totalWeeks, week, threshold, theme, onSeekWeek }: Props) {
  const charts = useMemo(() => {
    const trace = (l: CompareLine, y: (p: SeriesPoint) => number, fmt: string): Data =>
      ({
        type: 'scatter',
        mode: 'lines',
        name: l.name,
        x: l.series.map((p) => p.week),
        y: l.series.map(y),
        line: { color: l.color, width: 2 },
        hovertemplate: `${fmt}<extra>${l.name}</extra>`,
      }) as Data;
    return {
      diseased: lines.map((l) => trace(l, (p) => p.diseased, '%{y}')),
      maxP: lines.map((l) => trace(l, (p) => Math.max(p.maxP, 1e-3), '%{y:.3s}')),
      total: lines.map((l) => trace(l, (p) => Math.max(p.totalSpores, 1), '%{y:.3s}')),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, version]);

  const layouts = useMemo(() => {
    const bandShapes: Partial<Shape>[] = bands
      .filter((b) => b.host)
      .map((b) => ({
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: b.start,
        x1: b.end,
        y0: 0,
        y1: 1,
        fillcolor: theme.hostBand,
        line: { width: 0 },
        layer: 'below',
      }));
    const cursor: Partial<Shape> = {
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: week,
      x1: week,
      y0: 0,
      y1: 1,
      line: { color: theme.cursor, width: 1 },
    };
    const make = (title: string, log: boolean, extraShapes: Partial<Shape>[] = []): Partial<Layout> => ({
      paper_bgcolor: theme.surface,
      plot_bgcolor: theme.surface,
      font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: theme.ink, size: 11 },
      title: { text: title, x: 0, xanchor: 'left', font: { size: 12, color: theme.ink } },
      margin: { l: 55, r: 10, t: 28, b: 30 },
      hovermode: 'x unified',
      showlegend: true,
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom', font: { color: theme.inkSecondary, size: 11 } },
      xaxis: {
        range: [0, totalWeeks],
        color: theme.muted,
        gridcolor: theme.grid,
        zeroline: false,
        title: { text: 'week' },
        tickvals: Array.from({ length: Math.floor(totalWeeks / 52) + 1 }, (_, k) => k * 52),
      },
      yaxis: log
        ? { type: 'log', exponentformat: 'power', color: theme.muted, gridcolor: theme.grid, zeroline: false }
        : { color: theme.muted, gridcolor: theme.grid, zeroline: false, rangemode: 'tozero' },
      shapes: [...bandShapes, ...extraShapes, cursor],
      uirevision: 'compare',
    });
    const thresholdLine: Partial<Shape>[] =
      threshold === null
        ? []
        : [
            {
              type: 'line',
              xref: 'paper',
              x0: 0,
              x1: 1,
              yref: 'y',
              y0: threshold,
              y1: threshold,
              line: { color: theme.inkSecondary, width: 1, dash: 'dash' },
            },
          ];
    return {
      diseased: make('Diseased plants (infected + burst, this season)', false),
      maxP: make(`Maximum spore concentration [spores/g]${threshold === null ? '' : ' · dashed: threshold c*'}`, true, thresholdLine),
      total: make('Spores in the field', true),
    };
  }, [bands, totalWeeks, week, threshold, theme]);

  return (
    <div className="timeseries">
      <PlotlyChart className="ts-plot" data={charts.diseased} layout={layouts.diseased} config={CONFIG} onClickX={onSeekWeek} />
      <PlotlyChart className="ts-plot" data={charts.maxP} layout={layouts.maxP} config={CONFIG} onClickX={onSeekWeek} />
      <PlotlyChart className="ts-plot" data={charts.total} layout={layouts.total} config={CONFIG} onClickX={onSeekWeek} />
    </div>
  );
}

const CONFIG = { displayModeBar: false } as const;
