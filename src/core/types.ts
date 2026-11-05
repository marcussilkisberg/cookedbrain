import type { Stage } from './stage';

/** How a player answered. Scores are only ever compared within one class. */
export type InputClass = 'mouse' | 'touch' | 'keyboard';

export type Family = 'Reflex' | 'Memory' | 'Attention' | 'Numbers' | 'Spatial' | 'Logic' | 'Language';

export const FAMILIES: Family[] = ['Reflex', 'Memory', 'Attention', 'Numbers', 'Spatial', 'Logic', 'Language'];

/** One press from any device, on the event's own clock. */
export interface Press {
  x: number;
  y: number;
  /** event.timeStamp: same clock as performance.now() and rAF timestamps. */
  t: number;
  source: InputClass;
  key?: string;
  target?: EventTarget | null;
}

export interface TestResult {
  /** The one primary number. */
  score: number;
  valid: boolean;
  /** Secondary numbers, shown but never compared. */
  detail: { label: string; value: string }[];
  /** Per-trial values for the small bars on the results screen. */
  series?: { value: number; label: string; bad?: boolean }[];
}

/**
 * The contract every test implements. `generate` and `score` are pure, so the
 * same code can run in the browser for an instant result and on the server to
 * re-score ranked runs.
 */
export interface CookedTest<Content = any, Trial = any> {
  id: string;
  version: number;
  name: string;
  /** The plain phrase people search for. */
  searchTerm: string;
  family: Family;
  /** One line a new player can read in three seconds. */
  howTo: string;
  /** Unit shown after the number. */
  unit: string;
  lowerIsBetter: boolean;
  /** Rough length of a round, for the test list. */
  length: string;
  /** A timed round gets a short count-in, so the clock starts fair. */
  countIn?: boolean;
  generate(seed: string): Content;
  run(content: Content, stage: Stage): Promise<Trial[]>;
  score(trials: Trial[]): TestResult;
  format(score: number): string;
}
