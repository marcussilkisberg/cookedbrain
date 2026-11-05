import { median } from './stats';
import type { InputClass } from './types';

/**
 * Scores live in two places. The browser always keeps its own copy, so a guest
 * loses nothing and play never waits on the network. When the host offers a
 * shared store, each player also holds one document there. Those documents are
 * the population that placement statistics read from.
 *
 * On cookedbrain.com the shared half becomes an API behind the same interface.
 */
export interface TestRow {
  best: number;
  /** Last 10 valid scores, newest last. */
  recent: number[];
  rounds: number;
}

export interface PlayerDoc {
  name: string | null;
  /** Keyed by `test:input`, so populations never mix devices. */
  tests: Record<string, TestRow>;
  updated: number;
}

export interface PopulationRow {
  id: string;
  name: string | null;
  row: TestRow;
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

interface DbLike {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(d: Record<string, unknown>): Promise<void>;
  };
  collection(path: string): {
    limit(n: number): {
      onSnapshot(
        next: (s: { docs: { id: string; data(): Record<string, unknown> | undefined }[] }) => void,
        err?: (e: { code: string }) => void,
      ): () => void;
    };
  };
}

interface HostClaude {
  use(name: string): Promise<any>;
}

export class Store {
  doc: PlayerDoc = readLocal();
  mode: StoreMode = 'device';
  private db: DbLike | null = null;
  private uid: string | null = null;
  private players = new Map<string, PlayerDoc>();
  private canWrite = false;
  private writing = false;
  private dirty = false;
  private subs = new Set<() => void>();

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private changed() {
    for (const s of this.subs) s();
  }

  /** Lights up shared scores if the host offers them. Never blocks play. */
  async connect() {
    const host = (window as unknown as { claude?: HostClaude }).claude;
    if (!host?.use) return;
    try {
      const [db, user] = await Promise.all([host.use('db'), host.use('user')]);
      if (!db || !user) return;
      const uid: string | null = await user.id();
      if (!uid) return;
      this.db = db as DbLike;
      this.uid = uid;
      const can: boolean | null = await user.can('data.write');
      this.canWrite = can !== false;

      const mine = await this.db.doc(`players/${uid}`).get();
      const data = mine.exists ? (mine.data() as unknown as PlayerDoc) : null;
      if (data?.name) this.mergeRemote(data);

      this.db
        .collection('players')
        .limit(1000)
        .onSnapshot(
          (snap) => {
            this.players.clear();
            for (const d of snap.docs) {
              if (d.id !== this.uid) this.players.set(d.id, d.data() as unknown as PlayerDoc);
            }
            this.mode = 'shared';
            this.changed();
          },
          () => {
            this.mode = 'device';
            this.changed();
          },
        );
      if (this.canWrite && Object.keys(this.doc.tests).length) this.push();
    } catch {
      /* stay on this device */
    }
  }

  /** A claimed name restores that player's scores on any device. */
  private mergeRemote(remote: PlayerDoc) {
    const merged: PlayerDoc = { ...this.doc, name: remote.name };
    for (const [k, r] of Object.entries(remote.tests ?? {})) {
      const l = merged.tests[k];
      if (!l || r.rounds > l.rounds) merged.tests[k] = r;
    }
    this.doc = merged;
    writeLocal(merged);
  }

  private push() {
    if (!this.db || !this.uid || !this.canWrite) return;
    if (this.writing) {
      this.dirty = true;
      return;
    }
    this.writing = true;
    const body = JSON.parse(JSON.stringify(this.doc)) as Record<string, unknown>;
    this.db
      .doc(`players/${this.uid}`)
      .set(body)
      .catch((e: { code?: string }) => {
        if (e?.code === 'invalid_argument') this.canWrite = false;
      })
      .finally(() => {
        this.writing = false;
        if (this.dirty) {
          this.dirty = false;
          this.push();
        }
      });
  }

  /** Saves a round. Returns the row before and after, for the results screen. */
  record(key: string, score: number, lowerIsBetter: boolean) {
    const before = this.doc.tests[key] ? { ...this.doc.tests[key]! } : null;
    const row: TestRow = this.doc.tests[key] ?? { best: score, recent: [], rounds: 0 };
    const isBest = !before || (lowerIsBetter ? score < before.best : score > before.best);
    row.rounds += 1;
    row.recent = [...row.recent, score].slice(-10);
    if (isBest) row.best = score;
    this.doc.tests[key] = row;
    this.doc.updated = Date.now();
    writeLocal(this.doc);
    this.push();
    return { before, row, isBest };
  }

  claim(name: string) {
    this.doc.name = name;
    this.doc.updated = Date.now();
    writeLocal(this.doc);
    this.push();
    this.changed();
  }

  /** Other players on this test and device class, one row each. */
  population(key: string): PopulationRow[] {
    const out: PopulationRow[] = [];
    for (const [id, d] of this.players) {
      const row = d?.tests?.[key];
      if (row && row.recent?.length) out.push({ id, name: d.name ?? null, row });
    }
    return out;
  }

  others(key: string): number[] {
    return this.population(key).map((p) => median(p.row.recent));
  }

  /** Everyone on a test, for the board, including you. */
  board(key: string, lowerIsBetter: boolean) {
    const rows = this.population(key);
    const mine = this.doc.tests[key];
    if (mine) rows.push({ id: 'me', name: this.doc.name, row: mine });
    const named = rows.filter((r) => r.name);
    named.sort((a, b) => (lowerIsBetter ? a.row.best - b.row.best : b.row.best - a.row.best));
    return { named, guests: rows.length - named.length };
  }

  get shared() {
    return this.mode === 'shared';
  }

  get playerCount() {
    return this.players.size + (Object.keys(this.doc.tests).length ? 1 : 0);
  }
}

export const store = new Store();
