import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const DURATION = 30000;
const PENALTY = 2000;

interface Content {
  rounds: { hue: number; sat: number; light: number; dir: number; spot: number }[];
}
interface Trial {
  level: number;
  ok: boolean;
}

const sizeFor = (level: number) => Math.min(7, 2 + Math.floor(level / 3));
/** Lightness gap in percentage points. It closes as you climb. */
const gapFor = (level: number) => Math.max(1.3, 15 * Math.pow(0.915, level));

export const offcolour: CookedTest<Content, Trial> = {
  id: 'offcolour',
  version: 1,
  name: 'Off Colour',
  searchTerm: 'Colour vision test',
  family: 'Attention',
  howTo: 'Find the one tile that is different. A wrong pick costs two seconds.',
  unit: 'level',
  lowerIsBetter: false,
  length: '30 s',
  countIn: true,

  generate(seed) {
    const r = new Rng(seed);
    return {
      rounds: Array.from({ length: 80 }, () => ({
        hue: r.int(0, 359),
        sat: r.int(45, 70),
        light: r.int(40, 58),
        dir: r.next() < 0.5 ? -1 : 1,
        spot: r.next(),
      })),
    };
  },

  async run(content, stage) {
    const trials: Trial[] = [];
    const penalty = { penalty: 0 };
    let level = 1;

    const draw = () => {
      const n = sizeFor(level);
      const cells = n * n;
      const q = content.rounds[(level - 1) % content.rounds.length]!;
      const odd = Math.floor(q.spot * cells);
      const base = `hsl(${q.hue} ${q.sat}% ${q.light}%)`;
      const other = `hsl(${q.hue} ${q.sat}% ${q.light + q.dir * gapFor(level)}%)`;
      stage.html(
        `<div class="grid oc" style="--n:${n}">${Array.from(
          { length: cells },
          (_, i) => `<button class="tile" data-i="${i}" style="background:${i === odd ? other : base}" aria-label="Tile ${i + 1}"></button>`,
        ).join('')}</div>`,
      );
      return odd;
    };

    let odd = draw();
    const off = stage.listen((p) => {
      const el = (p.target as HTMLElement | null)?.closest?.('.tile') as HTMLElement | null;
      if (!el) return;
      const ok = Number(el.dataset['i']) === odd;
      trials.push({ level, ok });
      if (ok) {
        level++;
        stage.sound.tick();
        odd = draw();
      } else {
        penalty.penalty += PENALTY;
        stage.sound.bad();
        el.style.visibility = 'hidden';
      }
    });

    await stage.clock(
      DURATION,
      (left) => {
        stage.status(`${Math.ceil(left / 1000)} s  ·  Level ${level}`);
      },
      penalty,
    );
    off();
    return trials;
  },

  score(trials) {
    const cleared = trials.filter((t) => t.ok).length;
    return {
      score: cleared,
      valid: trials.length > 0 && trials.length <= 120,
      detail: [
        { label: 'Levels cleared', value: String(cleared) },
        { label: 'Wrong picks', value: String(trials.length - cleared) },
      ],
    };
  },

  format: (s) => String(s),
};
