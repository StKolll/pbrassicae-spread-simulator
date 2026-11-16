import { useMemo } from 'react';
import type { Data, Layout, Shape } from 'plotly.js';
import type { SeriesPoint } from '../../model/simulate';
import type { ChartTheme } from '../theme';
import { PlotlyChart } from './PlotlyChart';
import type { SeasonBand } from './Timeline';

interface Props {
  series: SeriesPoint[];
  /** Changes whenever `series` grows (it is appended in place). */
  version: number;
  bands: SeasonBand[];
  totalWeeks: number;
  week: number;
  threshold: number;
  theme: ChartTheme;
  onSeekWeek: (week: number) => void;
}

/**
 * Three small charts sharing the week axis (no dual axes): plants by state, spore
 * concentration (max and mean against the threshold), and total spores in the field.
 */
export function TimeSeries({ series, version, bands, totalWeeks, week, threshold, theme, onSeekWeek }: Props) {
  const charts = useMemo(() => {
    const x = series.map((p) => p.week);
    const line = (color: string, dash?: string) => ({ color, width: 2, dash });
    const plants: Data[] = [
      { x, y: series.map((p) => p.healthy), name: 'healthy', line: line(theme.healthy) },
      { x, y: series.map((p) => p.infected), name: 'infected', line: line(theme.infected) },
      { x, y: series.map((p) => p.burst), name: 'burst (this season)', line: line(theme.burst) },
    ].map((t) => ({ ...t, type: 'scatter', mode: 'lines', hovertemplate: '%{y}' }) as Data);
    const conc: Data[] = [
      { x, y: series.map((p) => Math.max(p.maxP, 1e-3)), name: 'max', line: line(theme.series) },
      { x, y: series.map((p) => Math.max(p.meanP, 1e-3)), name: 'field mean', line: line(theme.series, 'dot') },
    ].map((t) => ({ ...t, type: 'scatter', mode: 'lines', hovertemplate: '%{y:.3s}' }) as Data);
    const total: Data[] = [
      {
        type: 'scatter',
        mode: 'lines',
        x,
        y: series.map((p) => Math.max(p.totalSpores, 1)),
        name: 'total spores',
        line: line(theme.series),
        hovertemplate: '%{y:.3s}',
      } as Data,
    ];
    return { plants, conc, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, version, theme]);

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
    const make = (title: string, extra: Partial<Layout> = {}, shapes: Partial<Shape>[] = []): Partial<Layout> => ({
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
      yaxis: { color: theme.muted, gridcolor: theme.grid, zeroline: false, rangemode: 'tozero', ...extra.yaxis },
      shapes: [...bandShapes, ...shapes, cursor],
      uirevision: 'ts',
      ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'yaxis')),
    });
    const thresholdLine: Partial<Shape> = {
      type: 'line',
      xref: 'paper',
      x0: 0,
      x1: 1,
      yref: 'y',
      y0: threshold,
      y1: threshold,
      line: { color: theme.inkSecondary, width: 1, dash: 'dash' },
    };
    return {
      plants: make('Plants'),
      conc: make(
        'Spore concentration [spores/g]',
        {
          yaxis: { type: 'log', exponentformat: 'power', rangemode: 'normal' },
          annotations: [
            {
              xref: 'paper',
              x: 0,
              xanchor: 'left',
              yref: 'y',
              y: Math.log10(threshold),
              yanchor: 'bottom',
              text: 'threshold c*',
              showarrow: false,
              font: { size: 10, color: theme.inkSecondary },
            },
          ],
        },
        [thresholdLine],
      ),
      total: make('Spores in the field', { yaxis: { type: 'log', exponentformat: 'power', rangemode: 'normal' }, showlegend: false }),
    };
  }, [bands, totalWeeks, week, threshold, theme]);

  return (
    <div className="timeseries">
      <PlotlyChart className="ts-plot" data={charts.plants} layout={layouts.plants} config={CONFIG} onClickX={onSeekWeek} />
      <PlotlyChart className="ts-plot" data={charts.conc} layout={layouts.conc} config={CONFIG} onClickX={onSeekWeek} />
      <PlotlyChart className="ts-plot" data={charts.total} layout={layouts.total} config={CONFIG} onClickX={onSeekWeek} />
    </div>
  );
}

const CONFIG = { displayModeBar: false } as const;
