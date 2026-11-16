import { useEffect, useRef, useState } from 'react';
import type { Config, Data, Layout, PlotlyHTMLElement } from 'plotly.js';

type PlotlyModule = typeof import('plotly.js');

/** Plotly is large (~3.5 MB); load it once, on first use, so the sidebar appears immediately. */
let plotlyPromise: Promise<PlotlyModule> | null = null;
const loadPlotly = () =>
  (plotlyPromise ??= import('plotly.js-dist-min').then(
    (m) => ((m as { default?: PlotlyModule }).default ?? m) as PlotlyModule,
  ));

export interface PlotlyChartProps {
  data: Data[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  /** Called with the x value of a clicked point. */
  onClickX?: (x: number) => void;
  /** Called once the chart exists (e.g. for PNG export later). */
  onReady?: (div: PlotlyHTMLElement) => void;
}

/**
 * Thin wrapper around `Plotly.react`. Updates in place (keeps the 3D camera and zoom when the
 * layout carries a `uirevision`) and resizes with its container.
 */
export function PlotlyChart({ data, layout, config, className, onClickX, onReady }: PlotlyChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [plotly, setPlotly] = useState<PlotlyModule | null>(null);
  const [failed, setFailed] = useState(false);
  const clickRef = useRef(onClickX);
  const readyRef = useRef(onReady);
  useEffect(() => {
    clickRef.current = onClickX;
    readyRef.current = onReady;
  });

  useEffect(() => {
    let alive = true;
    loadPlotly().then(
      (p) => alive && setPlotly(() => p),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Create once, then update with Plotly.react.
  const created = useRef(false);
  useEffect(() => {
    const div = ref.current;
    if (!plotly || !div) return;
    const cfg: Partial<Config> = { displaylogo: false, responsive: true, ...config };
    void plotly.react(div, data, layout, cfg).then((gd) => {
      if (created.current) return;
      created.current = true;
      gd.on('plotly_click', (e) => {
        const x = e.points[0]?.x;
        if (typeof x === 'number') clickRef.current?.(x);
      });
      readyRef.current?.(gd);
    });
  }, [plotly, data, layout, config]);

  useEffect(() => {
    const div = ref.current;
    if (!plotly || !div) return;
    const ro = new ResizeObserver(() => plotly.Plots.resize(div));
    ro.observe(div);
    return () => {
      ro.disconnect();
      plotly.purge(div);
      created.current = false;
    };
  }, [plotly]);

  return (
    <div className={className} ref={ref}>
      {!plotly && <div className="plot-placeholder">{failed ? 'Could not load the plotting library.' : 'Loading chart…'}</div>}
    </div>
  );
}
