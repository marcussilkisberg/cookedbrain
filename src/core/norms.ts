import type { InputClass } from './types';

/**
 * Reference curves. These are modelled, not measured from players. They stand
 * in until a test has MIN_PLAYERS real players, and every result says so.
 *
 * Only the reaction curve is anchored on public data: the 273 ms median that
 * Human Benchmark publishes from 81M clicks. The rest are estimates to be
 * replaced by the first real population.
 */
export interface Curve {
  kind: 'lognormal' | 'normal';
  /** Centre of the curve. */
  mid: number;
  /** Log-space sigma for lognormal, standard deviation for normal. */
  spread: number;
  /** Whole-number scores, such as a level reached. */
  discrete: boolean;
}

type ByInput = Partial<Record<InputClass, Curve>> & { mouse: Curve };

const ln = (mid: number, spread: number): Curve => ({ kind: 'lognormal', mid, spread, discrete: false });
const nd = (mid: number, spread: number): Curve => ({ kind: 'normal', mid, spread, discrete: true });

export const CURVES: Record<string, ByInput> = {
  flinch: { mouse: ln(273, 0.17), keyboard: ln(262, 0.17), touch: ln(305, 0.18) },
  snipe: { mouse: ln(520, 0.2), touch: ln(600, 0.22) },
  deadstop: { mouse: ln(300, 0.62), keyboard: ln(290, 0.62), touch: ln(320, 0.62) },
  echo: { mouse: nd(8, 2.4) },
  digits: { mouse: nd(8, 1.9) },
  flashgrid: { mouse: nd(7, 2.6) },
  chimp: { mouse: nd(8, 2.5) },
  liar: { mouse: nd(26, 7), keyboard: nd(29, 7), touch: nd(25, 7) },
  offcolour: { mouse: nd(15, 4.5) },
  sums: { mouse: nd(11, 5), keyboard: nd(14, 6), touch: nd(12, 5) },
  spin: { mouse: nd(13, 5), keyboard: nd(14, 5) },
  pattern: { mouse: nd(9, 4), keyboard: nd(10, 4) },
  oddone: { mouse: nd(16, 6), keyboard: nd(17, 6) },
  dont: { mouse: nd(78, 14), keyboard: nd(80, 14), touch: nd(74, 14) },
  keys: { mouse: nd(45, 17), keyboard: nd(45, 17), touch: nd(30, 11) },
};

export function curveFor(testId: string, input: InputClass): Curve {
  const c = CURVES[testId];
  if (!c) throw new Error(`no curve for ${testId}`);
  return c[input] ?? c.mouse;
}

/** Standard normal CDF (Abramowitz and Stegun 26.2.17). */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Inverse normal CDF (Acklam's rational approximation). */
function phiInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  const at = (x: number[], i: number) => x[i]!;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((at(c, 0) * q + at(c, 1)) * q + at(c, 2)) * q + at(c, 3)) * q + at(c, 4)) * q + at(c, 5)) /
      ((((at(d, 0) * q + at(d, 1)) * q + at(d, 2)) * q + at(d, 3)) * q + 1)
    );
  }
  if (p > 1 - pl) return -phiInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((at(a, 0) * r + at(a, 1)) * r + at(a, 2)) * r + at(a, 3)) * r + at(a, 4)) * r + at(a, 5)) * q) /
    (((((at(b, 0) * r + at(b, 1)) * r + at(b, 2)) * r + at(b, 3)) * r + at(b, 4)) * r + 1)
  );
}

export function cdf(c: Curve, x: number): number {
  if (c.kind === 'lognormal') return x <= 0 ? 0 : phi(Math.log(x / c.mid) / c.spread);
  return phi((x - c.mid) / c.spread);
}

export function quantile(c: Curve, p: number): number {
  const z = phiInv(Math.max(1e-6, Math.min(1 - 1e-6, p)));
  if (c.kind === 'lognormal') return c.mid * Math.exp(z * c.spread);
  return Math.max(0, c.mid + z * c.spread);
}
