import type { CookedTest, InputClass } from './types';
import { curveFor, cdf, quantile, type Curve } from './norms';

export interface Tier {
  id: string;
  name: string;
  /** Upper bound of this tier on the % Cooked scale. */
  max: number;
  line: string;
}

/** The doneness ladder. % Cooked is the share of players who beat you. */
export const TIERS: Tier[] = [
  { id: 'raw', name: 'Raw', max: 5, line: 'Nothing has touched this brain.' },
  { id: 'rare', name: 'Rare', max: 20, line: 'Still very pink in the middle.' },
  { id: 'mrare', name: 'Medium Rare', max: 40, line: 'The way the chef likes it.' },
  { id: 'medium', name: 'Medium', max: 60, line: 'Right in the middle of the pan.' },
  { id: 'well', name: 'Well Done', max: 80, line: 'Firm. A little dry.' },
  { id: 'cooked', name: 'Cooked', max: 95, line: 'It has been on too long.' },
  { id: 'burnt', name: 'Burnt', max: 100, line: 'Happens to the best kitchens. Go again.' },
];

export function tierFor(cooked: number): Tier {
  return TIERS.find((t) => cooked < t.max) ?? TIERS[TIERS.length - 1]!;
}

export function median(values: readonly number[]): number {
  if (!values.length) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Below this many other players there is no empirical percentile. */
export const MIN_PLAYERS = 30;
/** Below this many it is labelled an early estimate. */
export const SOLID_PLAYERS = 100;

export type Basis = 'reference' | 'early' | 'players';

export interface Bin {
  /** Position across the scale, 0 is the best end. */
  from: number;
  to: number;
  share: number;
}

export interface Placement {
  /** Share of players you beat, 0 to 100. */
  beaten: number;
  /** 100 minus beaten. */
  cooked: number;
  tier: Tier;
  basis: Basis;
  /** Real players compared against. */
  players: number;
  /** Your position among real players, when there are enough of them. */
  rank: number | null;
  /** Typical player. */
  medianScore: number;
  /** Where the top 10% starts. */
  top10: number;
  /** The score that reaches the next tier up, if there is one. */
  nextTier: { tier: Tier; score: number } | null;
  bins: Bin[];
  /** The scores at each end of the chart. */
  bestEnd: number;
  worstEnd: number;
  /** Map a score to 0..1 across the chart, 0 is the best end. */
  position(score: number): number;
  /** Plain-language name for who is being compared. */
  who: string;
}

const INPUT_NAMES: Record<InputClass, string> = { mouse: 'mouse', touch: 'touchscreen', keyboard: 'keyboard' };

/** Share of a sample you beat, with ties split so equal scores land mid-rank. */
export function beatenInSample(score: number, sample: readonly number[], lowerIsBetter: boolean): number {
  let worse = 0;
  let same = 0;
  for (const v of sample) {
    if (v === score) same++;
    else if (lowerIsBetter ? v > score : v < score) worse++;
  }
  return ((worse + same / 2) / sample.length) * 100;
}

function beatenOnCurve(score: number, curve: Curve, lowerIsBetter: boolean): number {
  // Whole-number scores take the middle of their step, so ties split evenly.
  const p = curve.discrete ? (cdf(curve, score + 0.5) + cdf(curve, score - 0.5)) / 2 : cdf(curve, score);
  return (lowerIsBetter ? 1 - p : p) * 100;
}

function clampPct(v: number) {
  return Math.max(0.1, Math.min(99.9, v));
}

const BINS = 32;

function binsFromCurve(curve: Curve, lo: number, hi: number, lowerIsBetter: boolean): Bin[] {
  const out: Bin[] = [];
  for (let i = 0; i < BINS; i++) {
    const a = i / BINS;
    const b = (i + 1) / BINS;
    const va = lowerIsBetter ? lo + (hi - lo) * a : hi - (hi - lo) * a;
    const vb = lowerIsBetter ? lo + (hi - lo) * b : hi - (hi - lo) * b;
    out.push({ from: a, to: b, share: Math.abs(cdf(curve, vb) - cdf(curve, va)) });
  }
  return out;
}

function binsFromSample(sample: readonly number[], lo: number, hi: number, lowerIsBetter: boolean): Bin[] {
  // Few players mean wide bars, otherwise the chart is mostly gaps.
  const size = Math.max(8, Math.min(BINS, Math.ceil(Math.sqrt(sample.length) * 2)));
  const counts = new Array<number>(size).fill(0);
  for (const v of sample) {
    const t = (v - lo) / (hi - lo || 1);
    const pos = lowerIsBetter ? t : 1 - t;
    const i = Math.min(size - 1, Math.max(0, Math.floor(pos * size)));
    counts[i]!++;
  }
  return counts.map((c, i) => ({ from: i / size, to: (i + 1) / size, share: c / sample.length }));
}

/**
 * Where a score lands. Others' rolling medians are the population: one row per
 * player, so nobody counts twice however much they play. Under MIN_PLAYERS the
 * reference curve stands in and the result says so.
 */
export function place(
  test: Pick<CookedTest, 'id' | 'lowerIsBetter'>,
  input: InputClass,
  score: number,
  others: readonly number[] = [],
): Placement {
  const lower = test.lowerIsBetter;
  const curve = curveFor(test.id, input);
  const real = others.length >= MIN_PLAYERS;
  const sorted = real ? others.slice().sort((a, b) => a - b) : [];

  const q = (p: number) => {
    if (!real) return quantile(curve, p);
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[i]!;
  };

  const beaten = clampPct(real ? beatenInSample(score, others, lower) : beatenOnCurve(score, curve, lower));
  const cooked = 100 - beaten;
  const tier = tierFor(cooked);

  // The chart covers the 1st to 99th percentile, stretched to include you.
  const lo = Math.min(q(0.01), score);
  const hi = Math.max(q(0.99), score);
  const span = hi - lo || 1;
  const position = (v: number) => {
    const t = (v - lo) / span;
    return Math.max(0, Math.min(1, lower ? t : 1 - t));
  };

  const idx = TIERS.indexOf(tier);
  let nextTier: Placement['nextTier'] = null;
  if (idx > 0) {
    const target = TIERS[idx - 1]!;
    // Beating (100 - max)% of players puts you inside the better tier.
    const p = lower ? target.max / 100 : 1 - target.max / 100;
    const raw = q(p);
    const next = curve.discrete || (real && Number.isInteger(raw)) ? (lower ? Math.floor(raw) : Math.ceil(raw)) : Math.round(raw);
    nextTier = { tier: target, score: next };
  }

  let rank: number | null = null;
  if (real) {
    rank = 1 + others.filter((v) => (lower ? v < score : v > score)).length;
  }

  return {
    beaten,
    cooked,
    tier,
    basis: !real ? 'reference' : others.length < SOLID_PLAYERS ? 'early' : 'players',
    players: others.length,
    rank,
    medianScore: q(0.5),
    top10: q(lower ? 0.1 : 0.9),
    nextTier,
    bins: real ? binsFromSample(others, lo, hi, lower) : binsFromCurve(curve, lo, hi, lower),
    bestEnd: lower ? lo : hi,
    worstEnd: lower ? hi : lo,
    position,
    who: `${INPUT_NAMES[input]} players`,
  };
}
