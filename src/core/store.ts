import { median } from './stats';
import type { CookedTest, InputClass, TestResult } from './types';

/**
 * Scores live in two places. The browser always keeps its own copy, so play
 * never waits on the network and a guest loses nothing offline. When the API is
 * reachable, every round is also sent as raw trials and scored on the server,
 * which is the copy that counts for placement, boards and challenges.
 */
export interface TestRow {
  best: number;
  /** Last 10 valid scores, newest last. */
  recent: number[];
  rounds: number;
}

export interface PlayerDoc {
  name: string | null;
  /** Masked on the server, shown only as "you are signed in". */
  email?: string | null;
  /** Keyed by `test:input`, so populations never mix devices. */
  tests: Record<string, TestRow>;
  updated: number;
}

export interface PopulationRow {
  id: string;
  name: string | null;
  row: TestRow;
}

export interface Recorded {
  before: TestRow | null;
  row: TestRow;
  isBest: boolean;
  result: TestResult;
  others: number[];
  /** The public seed to share, or null when the round was not accepted. */
  challenge: string | null;
  /** True when the server scored this round. */
  verified: boolean;
  rejected?: string;
}

export type StoreMode = 'device' | 'shared';

const KEY = 'cookedbrain.v1';

export const keyFor = (testId: string, input: InputClass) => `${testId}:${input}`;

const NAME_RULE = /^[A-Za-z0-9_-]{3,16}$/;
export const validName = (n: string) => NAME_RULE.test(n);

function emptyDoc(): PlayerDoc {
  return { name: null, tests: {}, updated: 0 };
}

function readLocal(): PlayerDoc {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as PlayerDoc;
      if (d && typeof d === 'object' && d.tests) return d;
    }
  } catch {
    /* storage can be blocked; memory still works */
  }
  return emptyDoc();
}

function writeLocal(d: PlayerDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* same */
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data;
}

export class Store {
  doc: PlayerDoc = readLocal();
  mode: StoreMode = 'device';
  private subs = new Set<() => void>();
  private popCache = new Map<string, { at: number; others: number[] }>();

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private changed() {
    for (const s of this.subs) s();
  }

  /** Reaches the API if there is one. Never blocks play. */
  async connect() {
    if (location.protocol === 'file:') return;
    try {
      const me = await call<PlayerDoc & { id: string }>('/me');
      this.mode = 'shared';
      this.mergeRemote(me);
      this.changed();
    } catch {
      this.mode = 'device';
    }
  }

  /** The server's copy wins on name and email; rows merge by round count. */
  private mergeRemote(remote: PlayerDoc) {
    const merged: PlayerDoc = { ...this.doc, name: remote.name ?? this.doc.name, email: remote.email ?? null };
    for (const [k, r] of Object.entries(remote.tests ?? {})) {
      const l = merged.tests[k];
      if (!l || r.rounds >= l.rounds) merged.tests[k] = r;
    }
    this.doc = merged;
    writeLocal(merged);
  }

  /** A signed seed for a ranked round, or a local one when offline. */
  async seed(test: CookedTest, local: () => string): Promise<string> {
    if (!this.shared) return local();
    try {
      return (await call<{ seed: string }>('/seed', { test: test.id })).seed;
    } catch {
      return local();
    }
  }

  private recordLocal(key: string, score: number, lowerIsBetter: boolean) {
    const before = this.doc.tests[key] ? { ...this.doc.tests[key]! } : null;
    const row: TestRow = this.doc.tests[key] ?? { best: score, recent: [], rounds: 0 };
    const isBest = !before || (lowerIsBetter ? score < before.best : score > before.best);
    row.rounds += 1;
    row.recent = [...row.recent, score].slice(-10);
    if (isBest) row.best = score;
    this.doc.tests[key] = row;
    this.doc.updated = Date.now();
    writeLocal(this.doc);
    return { before, row, isBest };
  }

  /**
   * Saves a round. Online, the server scores the raw trials and its answer is
   * the one shown; offline, the browser's score stands and is marked as such.
   */
  async record(test: CookedTest, input: InputClass, seed: string, trials: unknown[], local: TestResult, hidden: boolean): Promise<Recorded> {
    const key = keyFor(test.id, input);
    if (this.shared) {
      try {
        const r = await call<{ result: TestResult; row: TestRow; before: TestRow | null; isBest: boolean; others: number[]; challenge: string }>('/round', {
          test: test.id,
          version: test.version,
          input,
          seed,
          trials,
          hidden,
        });
        this.doc.tests[key] = r.row;
        this.doc.updated = Date.now();
        writeLocal(this.doc);
        this.popCache.set(key, { at: Date.now(), others: r.others });
        return { ...r, verified: true };
      } catch (e) {
        const msg = (e as Error).message;
        // A rejected round is not saved anywhere; a network failure falls back to the device.
        if (/seed|hidden|valid|version|scored/.test(msg)) {
          return { before: this.doc.tests[key] ?? null, row: this.doc.tests[key] ?? { best: local.score, recent: [], rounds: 0 }, isBest: false, result: local, others: [], challenge: null, verified: false, rejected: msg };
        }
      }
    }
    const { before, row, isBest } = this.recordLocal(key, local.score, test.lowerIsBetter);
    return { before, row, isBest, result: local, others: this.popCache.get(key)?.others ?? [], challenge: null, verified: false };
  }

  /** Other players' rolling medians for a test and input class. */
  async others(test: CookedTest, input: InputClass): Promise<number[]> {
    const key = keyFor(test.id, input);
    const c = this.popCache.get(key);
    if (c && Date.now() - c.at < 30_000) return c.others;
    if (!this.shared) return [];
    try {
      const r = await call<{ others: number[] }>(`/population?test=${test.id}&input=${input}`);
      this.popCache.set(key, { at: Date.now(), others: r.others });
      return r.others;
    } catch {
      return c?.others ?? [];
    }
  }

  othersCached(test: CookedTest, input: InputClass): number[] {
    return this.popCache.get(keyFor(test.id, input))?.others ?? [];
  }

  async claim(name: string): Promise<string | null> {
    if (this.shared) {
      try {
        await call('/name', { name });
      } catch (e) {
        return (e as Error).message;
      }
    }
    this.doc.name = name;
    this.doc.updated = Date.now();
    writeLocal(this.doc);
    this.changed();
    return null;
  }

  async startSignIn(email: string): Promise<string | null> {
    try {
      await call('/auth/start', { email });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  async signOut() {
    try {
      await call('/auth/out', {});
    } catch {
      /* cookie may already be gone */
    }
    this.doc = emptyDoc();
    writeLocal(this.doc);
    this.changed();
  }

  async board(test: CookedTest, input: InputClass): Promise<{ named: PopulationRow[]; guests: number; others: number[] }> {
    if (!this.shared) return { named: [], guests: 0, others: [] };
    try {
      return await call(`/board?test=${test.id}&input=${input}`);
    } catch {
      return { named: [], guests: 0, others: [] };
    }
  }

  async challenge(pub: string): Promise<{ test: string; score: number; input: InputClass; name: string | null; seed: string } | null> {
    try {
      return await call(`/challenge/${encodeURIComponent(pub)}`);
    } catch {
      return null;
    }
  }

  get shared() {
    return this.mode === 'shared';
  }

  get signedIn() {
    return !!this.doc.email;
  }
}

export const store = new Store();
export { median };
