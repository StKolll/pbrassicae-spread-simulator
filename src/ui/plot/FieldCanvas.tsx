import { useEffect, useMemo, useRef, useState } from 'react';
import type { Frame } from '../../model/simulate';
import type { RunMeta } from '../../worker/protocol';
import { fmtNum, type ChartTheme } from '../theme';
import type { ColorSettings } from './FieldView';

/**
 * Top view of the spore field drawn directly on a canvas: smooth (bilinear) colour image,
 * dotted threshold contour, plants by state, axes and colour bar. Drawing one frame takes
 * about a millisecond, so playback stays smooth (Plotly needed far longer per frame).
 */
interface Props {
  meta: RunMeta;
  frame: Frame;
  threshold: number;
  color: ColorSettings;
  theme: ChartTheme;
}

const LOG_FLOOR = 0; // log scale starts at 1 spore/g

interface Scale {
  log: boolean;
  cmin: number;
  cmax: number;
  /** Value → transformed value on the colour axis. */
  tr: (v: number) => number;
}

export function scaleFor(color: ColorSettings, threshold: number): Scale {
  if (color.log) {
    return {
      log: true,
      cmin: LOG_FLOOR,
      cmax: Math.ceil(Math.log10(threshold * 100)),
      tr: (v) => Math.log10(Math.max(v, 10 ** LOG_FLOOR)),
    };
  }
  return { log: false, cmin: 0, cmax: color.maxFactor * threshold, tr: (v) => v };
}

/** 256-entry RGB lookup table from the theme's colour stops. */
function makeLut(stops: [number, string][]): Uint8ClampedArray {
  const rgb = stops.map(([t, c]) => [t, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let k = 0; k < 256; k++) {
    const t = k / 255;
    let s = 0;
    while (s < rgb.length - 2 && t > rgb[s + 1][0]) s++;
    const [t0, r0, g0, b0] = rgb[s];
    const [t1, r1, g1, b1] = rgb[s + 1];
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    lut[3 * k] = r0 + f * (r1 - r0);
    lut[3 * k + 1] = g0 + f * (g1 - g0);
    lut[3 * k + 2] = b0 + f * (b1 - b0);
  }
  return lut;
}

const niceStep = (span: number) => {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
};

const STATE_NAMES = ['', 'healthy', 'infected', 'burst'];

export function FieldCanvas({ meta, frame, threshold, color, theme }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ px: number; py: number; text: string } | null>(null);
  const lut = useMemo(() => makeLut(theme.fieldScale), [theme]);
  const scale = useMemo(() => scaleFor(color, threshold), [color, threshold]);
  const { grid: g, plants } = meta;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Plot rectangle in CSS pixels, keeping the field's aspect ratio.
  const rect = useMemo(() => {
    const m = { l: 52, r: 96, t: 30, b: 40 };
    const aw = Math.max(10, size.w - m.l - m.r);
    const ah = Math.max(10, size.h - m.t - m.b);
    const s = Math.min(aw / g.Lx, ah / g.Ly);
    const w = g.Lx * s;
    const h = g.Ly * s;
    return { x: m.l + (aw - w) / 2, y: m.t + (ah - h) / 2, w, h, s };
  }, [size, g]);

  // Offscreen image: one pixel per interior cell.
  const image = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = g.mx;
    c.height = g.my;
    return c;
  }, [g]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { cmin, cmax, tr } = scale;
    const norm = (v: number) => Math.min(1, Math.max(0, (tr(v) - cmin) / (cmax - cmin)));
    const X = (x: number) => rect.x + (x / g.Lx) * rect.w;
    const Y = (y: number) => rect.y + rect.h - (y / g.Ly) * rect.h;

    // Field image (row j = 0 is y = dy, drawn at the bottom).
    const ictx = image.getContext('2d')!;
    const img = ictx.createImageData(g.mx, g.my);
    for (let j = 0; j < g.my; j++) {
      const row = g.my - 1 - j;
      for (let i = 0; i < g.mx; i++) {
        const k = Math.round(255 * norm(frame.p[i + g.mx * j])) * 3;
        const o = 4 * (i + g.mx * row);
        img.data[o] = lut[k];
        img.data[o + 1] = lut[k + 1];
        img.data[o + 2] = lut[k + 2];
        img.data[o + 3] = 255;
      }
    }
    ictx.putImageData(img, 0, 0);
    ctx.fillStyle = `rgb(${lut[0]},${lut[1]},${lut[2]})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Cell centres sit at (i+1)·dx, so the image spans dx/2 … Lx − dx/2.
    ctx.drawImage(image, X(g.dx / 2), Y(g.Ly - g.dy / 2), (g.mx * g.dx * rect.w) / g.Lx, (g.my * g.dy * rect.h) / g.Ly);

    // Threshold contour (marching squares on the cell-centre grid).
    const level = norm(threshold);
    if (level > 0 && level < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const v = (i: number, j: number) => norm(frame.p[i + g.mx * j]) - level;
      const px = (i: number) => X((i + 1) * g.dx);
      const py = (j: number) => Y((j + 1) * g.dy);
      for (let j = 0; j + 1 < g.my; j++) {
        for (let i = 0; i + 1 < g.mx; i++) {
          const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
          const pts: [number, number][] = [];
          const edge = (f0: number, f1: number, x0: number, y0: number, x1: number, y1: number) => {
            if ((f0 < 0) !== (f1 < 0)) {
              const t = f0 / (f0 - f1);
              pts.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)]);
            }
          };
          edge(a, b, px(i), py(j), px(i + 1), py(j));
          edge(b, c, px(i + 1), py(j), px(i + 1), py(j + 1));
          edge(c, d, px(i + 1), py(j + 1), px(i), py(j + 1));
          edge(d, a, px(i), py(j + 1), px(i), py(j));
          for (let s = 0; s + 1 < pts.length; s += 2) {
            ctx.moveTo(pts[s][0], pts[s][1]);
            ctx.lineTo(pts[s + 1][0], pts[s + 1][1]);
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Plants: healthy ●, infected ◆, burst ✕ (shape and colour).
    const counts = [0, 0, 0, 0];
    if (color.showPlants) {
      const sp = plants.length > 1 ? Math.hypot(plants[1].x - plants[0].x, plants[1].y - plants[0].y) * rect.s : 10;
      const r = Math.max(1.2, Math.min(3.5, sp * 0.2));
      for (let k = 0; k < plants.length; k++) {
        const st = frame.plantStates[k];
        counts[st]++;
        if (st === 0) continue;
        const x = X(plants[k].x);
        const y = Y(plants[k].y);
        if (st === 1) {
          ctx.fillStyle = theme.healthy;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fill();
        } else if (st === 2) {
          const q = r * 2;
          ctx.fillStyle = theme.infected;
          ctx.strokeStyle = theme.surface;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y - q);
          ctx.lineTo(x + q, y);
          ctx.lineTo(x, y + q);
          ctx.lineTo(x - q, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          const q = r * 1.6;
          ctx.strokeStyle = theme.burst;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - q, y - q);
          ctx.lineTo(x + q, y + q);
          ctx.moveTo(x + q, y - q);
          ctx.lineTo(x - q, y + q);
          ctx.stroke();
        }
      }
    }

    // Frame and axes.
    ctx.setLineDash([]);
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.fillStyle = theme.inkSecondary;
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const sx = niceStep(g.Lx);
    for (let x = 0; x <= g.Lx + 1e-9; x += sx) {
      ctx.fillRect(X(x), rect.y + rect.h, 1, 4);
      ctx.fillText(fmtNum(x), X(x), rect.y + rect.h + 6);
    }
    ctx.fillText('x [m]', rect.x + rect.w / 2, rect.y + rect.h + 22);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const sy = niceStep(g.Ly);
    for (let y = 0; y <= g.Ly + 1e-9; y += sy) {
      ctx.fillRect(rect.x - 4, Y(y), 4, 1);
      ctx.fillText(fmtNum(y), rect.x - 7, Y(y));
    }
    ctx.save();
    ctx.translate(rect.x - 38, rect.y + rect.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('y [m]', 0, 0);
    ctx.restore();

    // Colour bar with the threshold marked.
    const cbx = rect.x + rect.w + 18;
    const cbh = rect.h * 0.85;
    const cby = rect.y + (rect.h - cbh) / 2;
    for (let k = 0; k < cbh; k++) {
      const idx = Math.round((255 * (cbh - 1 - k)) / (cbh - 1)) * 3;
      ctx.fillStyle = `rgb(${lut[idx]},${lut[idx + 1]},${lut[idx + 2]})`;
      ctx.fillRect(cbx, cby + k, 14, 1.5);
    }
    ctx.strokeStyle = theme.axis;
    ctx.strokeRect(cbx + 0.5, cby + 0.5, 13, cbh - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.inkSecondary;
    const cbY = (t: number) => cby + cbh - ((t - cmin) / (cmax - cmin)) * cbh;
    const ticks = scale.log
      ? Array.from({ length: cmax - cmin + 1 }, (_, k) => cmin + k)
      : Array.from({ length: 5 }, (_, k) => cmin + ((cmax - cmin) * k) / 4);
    for (const t of ticks) ctx.fillText(scale.log ? `1e${t}` : fmtNum(t), cbx + 20, cbY(t));
    const lt = scale.tr(threshold);
    if (lt > cmin && lt < cmax) {
      ctx.fillStyle = theme.ink;
      ctx.fillRect(cbx - 4, cbY(lt), 22, 1.5);
      ctx.fillText('c*', cbx + 60, cbY(lt));
    }
    ctx.save();
    ctx.translate(cbx + 84, cby + cbh / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.inkSecondary;
    ctx.fillText('spores/g soil', 0, 0);
    ctx.restore();

    // Legend.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let lx = rect.x;
    const ly = 12;
    const item = (draw: () => void, label: string) => {
      draw();
      ctx.fillStyle = theme.inkSecondary;
      ctx.fillText(label, lx + 22, ly);
      lx += 30 + ctx.measureText(label).width;
    };
    item(() => {
      ctx.strokeStyle = theme.ink;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 16, ly);
      ctx.stroke();
      ctx.setLineDash([]);
    }, 'threshold c*');
    if (color.showPlants) {
      item(() => {
        ctx.fillStyle = theme.healthy;
        ctx.beginPath();
        ctx.arc(lx + 8, ly, 3, 0, 2 * Math.PI);
        ctx.fill();
      }, `healthy (${counts[1]})`);
      item(() => {
        ctx.fillStyle = theme.infected;
        ctx.beginPath();
        ctx.moveTo(lx + 8, ly - 5);
        ctx.lineTo(lx + 13, ly);
        ctx.lineTo(lx + 8, ly + 5);
        ctx.lineTo(lx + 3, ly);
        ctx.fill();
      }, `infected (${counts[2]})`);
      item(() => {
        ctx.strokeStyle = theme.burst;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx + 4, ly - 4);
        ctx.lineTo(lx + 12, ly + 4);
        ctx.moveTo(lx + 12, ly - 4);
        ctx.lineTo(lx + 4, ly + 4);
        ctx.stroke();
      }, `burst (${counts[3]})`);
    }
  }, [size, rect, frame, scale, lut, theme, threshold, color.showPlants, g, image, plants]);

  const onMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const x = ((px - rect.x) / rect.w) * g.Lx;
    const y = ((rect.y + rect.h - py) / rect.h) * g.Ly;
    if (x < 0 || y < 0 || x > g.Lx || y > g.Ly) return setHover(null);
    const i = Math.min(g.mx - 1, Math.max(0, Math.round(x / g.dx) - 1));
    const j = Math.min(g.my - 1, Math.max(0, Math.round(y / g.dy) - 1));
    let text = `x ${x.toFixed(2)} m, y ${y.toFixed(2)} m · ${fmtNum(frame.p[i + g.mx * j], 3)} spores/g`;
    let best = Infinity;
    let bk = -1;
    for (let k = 0; k < plants.length; k++) {
      const d = Math.hypot(plants[k].x - x, plants[k].y - y);
      if (d < best) {
        best = d;
        bk = k;
      }
    }
    if (bk >= 0 && best * rect.s < 6 && frame.plantStates[bk] > 0) text += ` · ${STATE_NAMES[frame.plantStates[bk]]} plant`;
    setHover({ px, py, text });
  };

  let maxP = 0;
  for (let k = 0; k < frame.p.length; k++) if (frame.p[k] > maxP) maxP = frame.p[k];
  return (
    <div className="field-plot field-canvas" ref={box} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h }}
        role="img"
        aria-label={`Spore field in week ${frame.week}; maximum ${fmtNum(maxP)} spores per gram`}
      />
      {hover && (
        <div className="tooltip" style={{ left: hover.px + 12, top: hover.py + 12 }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}
