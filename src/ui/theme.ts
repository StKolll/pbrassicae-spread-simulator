import { useSyncExternalStore } from 'react';

/**
 * Chart colours for light and dark mode. Plant-state colours (aqua / orange / violet) were
 * checked with a colour-vision-deficiency validator in both modes; plant markers also differ
 * in shape, so state is never shown by colour alone.
 */
export interface ChartTheme {
  dark: boolean;
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  /** Sequential ramp for the spore field, near-zero → high. */
  fieldScale: [number, string][];
  series: string;
  healthy: string;
  infected: string;
  burst: string;
  hostBand: string;
  cursor: string;
}

const BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

const ramp = (stops: string[]): [number, string][] =>
  stops.map((c, i) => [i / (stops.length - 1), c]);

export const LIGHT: ChartTheme = {
  dark: false,
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  fieldScale: ramp(['#fcfcfb', ...BLUE]),
  series: '#2a78d6',
  healthy: '#1baf7a',
  infected: '#eb6834',
  burst: '#6250d6',
  hostBand: 'rgba(235,104,52,0.08)',
  cursor: '#0b0b0b',
};

export const DARK: ChartTheme = {
  dark: true,
  surface: '#1a1a19',
  ink: '#f0efec',
  inkSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  fieldScale: ramp(['#1a1a19', ...[...BLUE].reverse().slice(1), '#e8f1fd']),
  series: '#3987e5',
  healthy: '#199e70',
  infected: '#d95926',
  burst: '#9085e9',
  hostBand: 'rgba(217,89,38,0.12)',
  cursor: '#f0efec',
};

const query = () => window.matchMedia('(prefers-color-scheme: dark)');
const subscribe = (cb: () => void) => {
  const q = query();
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
};

export function useChartTheme(): ChartTheme {
  const dark = useSyncExternalStore(subscribe, () => query().matches);
  return dark ? DARK : LIGHT;
}

/** Compact number format: 0.25, 12.5, 1.2e5. */
export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-2) {
    const [m, e] = v.toExponential(digits - 1).split('e');
    return `${m.replace(/\.0+$/, '')}e${Number(e)}`;
  }
  return String(Number(v.toPrecision(Math.max(digits, Math.ceil(Math.log10(a + 1))))));
}
