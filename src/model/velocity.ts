import type { VelocityConfig } from './types';
import type { Grid } from './grid';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Water velocity u(x, y) [m/week].
 *
 * - `none`: no flow.
 * - `uniform`: constant flow vmax in direction angleDeg (covers the thesis' parallel and
 *   diagonal cases).
 * - `centerDepression`: flow towards the field centre, per component; speed vmax, falling off
 *   linearly within a quarter of the field size from the centre (like `centered_depression.m`).
 * - `unilateralDepression`: no flow on the half x < Lx/2, uniform flow vmax·(cos θ, sin θ) on
 *   the half x ≥ Lx/2 (like `tridiagonalblockmatrix_unilateral_depr_adv.m`).
 */
export function velocityAt(cfg: VelocityConfig, g: Grid, x: number, y: number): [number, number] {
  const { vmax } = cfg;
  const th = (cfg.angleDeg * Math.PI) / 180;
  switch (cfg.preset) {
    case 'none':
      return [0, 0];
    case 'uniform':
      return [vmax * Math.cos(th), vmax * Math.sin(th)];
    case 'centerDepression': {
      const ux = -vmax * clamp((x - g.Lx / 2) / (g.Lx / 4), -1, 1);
      const uy = -vmax * clamp((y - g.Ly / 2) / (g.Ly / 4), -1, 1);
      return [ux, uy];
    }
    case 'unilateralDepression':
      return x < g.Lx / 2 ? [0, 0] : [vmax * Math.cos(th), vmax * Math.sin(th)];
  }
}
