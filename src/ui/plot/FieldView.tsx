import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import type { Frame } from '../../model/simulate';
import type { RunMeta } from '../../worker/protocol';
import { fmtNum, type ChartTheme } from '../theme';
import { PlotlyChart } from './PlotlyChart';

export type FieldMode = '3d' | 'heatmap';
export interface ColorSettings {
  log: boolean;
  /** Upper end of the colour scale as a multiple of the threshold (linear scale). */
  maxFactor: number;
  showPlants: boolean;
}

interface Props {
  meta: RunMeta;
  frame: Frame;
  threshold: number;
  mode: FieldMode;
  color: ColorSettings;
  theme: ChartTheme;
}

/** log10 floor for the log scale: 1 spore/g. */
const LOG_FLOOR = 0;

/** Spore field of one snapshot as a 3D surface or a heatmap, with plants and the threshold contour. */
export function FieldView({ meta, frame, threshold, mode, color, theme }: Props) {
  const { grid: g, plants } = meta;
  const xs = useMemo(() => Array.from({ length: g.mx }, (_, i) => (i + 1) * g.dx), [g]);
  const ys = useMemo(() => Array.from({ length: g.my }, (_, j) => (j + 1) * g.dy), [g]);

  const data = useMemo<Data[]>(() => {
    const tr = (v: number) => (color.log ? Math.log10(Math.max(v, 10 ** LOG_FLOOR)) : v);
    const cmax = color.log ? Math.ceil(Math.log10(threshold * 100)) : color.maxFactor * threshold;
    const cmin = color.log ? LOG_FLOOR : 0;
    const level = tr(threshold);
    const z: number[][] = [];
    const text: string[][] = [];
    for (let j = 0; j < g.my; j++) {
      const row = new Array<number>(g.mx);
      const trow = mode === '3d' ? new Array<string>(g.mx) : [];
      for (let i = 0; i < g.mx; i++) {
        const v = frame.p[i + g.mx * j];
        // In 3D the surface is clipped at the top of the scale so peaks do not hide the field.
        row[i] = mode === '3d' ? Math.min(tr(v), cmax) : tr(v);
        if (mode === '3d') trow[i] = fmtNum(v, 3);
      }
      z.push(row);
      text.push(trow);
    }
    const tickvals = color.log ? Array.from({ length: cmax - cmin + 1 }, (_, k) => cmin + k) : undefined;
    const colorbar = {
      title: { text: 'spores/g', side: 'right' as const },
      tickvals,
      ticktext: tickvals?.map((t) => `1e${t}`),
      tickfont: { color: theme.inkSecondary },
      outlinewidth: 0,
      len: 0.8,
    };
    const traces: Data[] = [];
    if (mode === 'heatmap') {
      traces.push({
        type: 'heatmap',
        x: xs,
        y: ys,
        z,
        zmin: cmin,
        zmax: cmax,
        colorscale: theme.fieldScale,
        colorbar,
        hovertemplate: color.log ? 'x %{x:.2f} m, y %{y:.2f} m<br>10^%{z:.2f} spores/g<extra></extra>' : 'x %{x:.2f} m, y %{y:.2f} m<br>%{z:.3s} spores/g<extra></extra>',
      } as Data);
      traces.push({
        type: 'contour',
        x: xs,
        y: ys,
        z,
        showscale: false,
        hoverinfo: 'skip',
        contours: { start: level, end: level, size: 1, coloring: 'none' },
        line: { color: theme.ink, width: 1.5, dash: 'dot' },
        name: 'threshold c*',
      } as Data);
      if (color.showPlants) traces.push(...plantTraces(plants, frame, theme, false));
    } else {
      traces.push({
        type: 'surface',
        x: xs,
        y: ys,
        z,
        text,
        cmin,
        cmax,
        // Without the surface-coloured first stop, so the zero plane stays visible.
        colorscale: theme.fieldScale.slice(1).map(([, c], k, a) => [k / (a.length - 1), c]),
        colorbar,
        hovertemplate: 'x %{x:.2f} m, y %{y:.2f} m<br>%{text} spores/g<extra></extra>',
        contours: {
          z: { show: true, start: level, end: level, size: 1, color: theme.ink, width: 2, usecolormap: false },
        },
        lighting: { ambient: 0.85, diffuse: 0.4, specular: 0.05 },
      } as unknown as Data);
      if (color.showPlants) traces.push(...plantTraces(plants, frame, theme, true, cmin));
    }
    return traces;
  }, [g, xs, ys, frame, threshold, mode, color, theme, plants]);

  const layout = useMemo<Partial<Layout>>(() => {
    const cmax = color.log ? Math.ceil(Math.log10(threshold * 100)) : color.maxFactor * threshold;
    const axis = { color: theme.inkSecondary, gridcolor: theme.grid, zerolinecolor: theme.axis };
    const base: Partial<Layout> = {
      paper_bgcolor: theme.surface,
      plot_bgcolor: theme.surface,
      font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: theme.ink, size: 12 },
      margin: { l: 50, r: 10, t: 10, b: 40 },
      // Keeps zoom and camera while frames change; reset when the grid changes.
      uirevision: `${mode}-${g.Lx}-${g.Ly}`,
      showlegend: color.showPlants,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: theme.inkSecondary } },
    };
    if (mode === 'heatmap') {
      return {
        ...base,
        xaxis: { ...axis, title: { text: 'x [m]' }, range: [0, g.Lx], constrain: 'domain' },
        yaxis: { ...axis, title: { text: 'y [m]' }, range: [0, g.Ly], scaleanchor: 'x' },
      };
    }
    return {
      ...base,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      scene: {
        xaxis: { ...axis, title: { text: 'x [m]' }, range: [0, g.Lx], backgroundcolor: theme.surface },
        yaxis: { ...axis, title: { text: 'y [m]' }, range: [0, g.Ly], backgroundcolor: theme.surface },
        zaxis: {
          ...axis,
          title: { text: color.log ? 'log10 spores/g' : 'spores/g' },
          range: [color.log ? LOG_FLOOR : 0, cmax],
          backgroundcolor: theme.surface,
        },
        aspectmode: 'manual',
        // A cube for square fields; the height follows the longer side.
        aspectratio: { x: 1, y: g.Ly / g.Lx, z: Math.max(1, g.Ly / g.Lx) },
      },
    };
  }, [mode, g, color, threshold, theme]);

  return <PlotlyChart className="field-plot" data={data} layout={layout} />;
}

const STATES = [
  { code: 1, name: 'healthy', symbol: 'circle', key: 'healthy' },
  { code: 2, name: 'infected', symbol: 'diamond', key: 'infected' },
  { code: 3, name: 'burst', symbol: 'x', key: 'burst' },
] as const;

function plantTraces(plants: RunMeta['plants'], frame: Frame, theme: ChartTheme, is3d: boolean, z0 = 0): Data[] {
  // In 3D, healthy plants would cover the surface; show only diseased ones.
  return STATES.filter((s) => !is3d || s.code !== 1).map((s) => {
    const x: number[] = [];
    const y: number[] = [];
    for (let k = 0; k < plants.length; k++) {
      if (frame.plantStates[k] === s.code) {
        x.push(plants[k].x);
        y.push(plants[k].y);
      }
    }
    const marker = {
      color: theme[s.key],
      symbol: is3d && s.symbol === 'x' ? 'x' : s.symbol,
      size: is3d ? 3 : s.code === 1 ? 5 : 8,
      line: { color: theme.surface, width: is3d ? 0 : 1 },
    };
    const name = `${s.name} (${x.length})`;
    return is3d
      ? ({ type: 'scatter3d', mode: 'markers', x, y, z: x.map(() => z0), marker, name, hovertemplate: `${s.name}<extra></extra>` } as Data)
      : ({ type: 'scatter', mode: 'markers', x, y, marker, name, hovertemplate: `${s.name} plant<br>x %{x:.2f} m, y %{y:.2f} m<extra></extra>` } as Data);
  });
}
