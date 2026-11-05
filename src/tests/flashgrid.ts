import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const LIVES = 3;
const MISSES_PER_BOARD = 3;

interface Content {
  seed: string;
}
interface Trial {
  level: number;
  ok: boolean;
  misses: number;
}

const boardSize = (level: number) => (level <= 2 ? 3 : level <= 5 ? 4 : level <= 9 ? 5 : level <= 14 ? 6 : 7);
const lit = (level: number) => level + 2;

export const flashgrid: CookedTest<Content, Trial> = {
  id: 'flashgrid',
  version: 1,
  name: 'Flash Grid',
  searchTerm: 'Visual memory test',
  family: 'Memory',
  howTo: 'Memorise the lit squares, then pick them out. Three lives.',
  unit: 'level',
  lowerIsBetter: false,
  length: 'Until you fail',

  generate(seed) {
    return { seed };
  },

  async run(content, stage) {
    const trials: Trial[] = [];
    let lives = LIVES;
    let level = 1;
    let tries = 0;

    while (lives > 0 && level <= 25) {
      const r = new Rng(`${content.seed}:${level}:${tries++}`);
      const n = boardSize(level);
      const cells = n * n;
      const picks = new Set(r.shuffle(Array.from({ length: cells }, (_, i) => i)).slice(0, lit(level)));

      stage.status(`Level ${level}  ·  ${'●'.repeat(lives)}${'○'.repeat(LIVES - lives)}`);
      stage.html(
        `<div class="grid fg" style="--n:${n}">${Array.from({ length: cells }, (_, i) => `<button class="tile" data-i="${i}" aria-label="Square ${i + 1}"></button>`).join('')}</div>`,
      );
      const tiles = [...stage.el.querySelectorAll<HTMLElement>('.tile')];

      stage.el.classList.add('locked');
      await stage.wait(320);
      for (const i of picks) tiles[i]!.classList.add('lit');
      await stage.wait(1000 + level * 60);
      for (const i of picks) tiles[i]!.classList.remove('lit');
      stage.el.classList.remove('locked');

      const left = new Set(picks);
      const tapped = new Set<number>();
      let misses = 0;

      while (left.size && misses < MISSES_PER_BOARD) {
        const p = await stage.press((q) => !!(q.target as HTMLElement | null)?.closest?.('.tile'));
        const el = (p.target as HTMLElement).closest('.tile') as HTMLElement;
        const i = Number(el.dataset['i']);
        if (tapped.has(i)) continue;
        tapped.add(i);
        if (left.delete(i)) {
          el.classList.add('held');
          stage.sound.tick();
        } else {
          el.classList.add('wrong');
          misses++;
          stage.sound.bad();
        }
      }

      const ok = left.size === 0;
      trials.push({ level, ok, misses });
      if (ok) {
        stage.sound.good();
        level++;
      } else {
        lives--;
        for (const i of left) tiles[i]!.classList.add('lit');
      }
      await stage.wait(ok ? 260 : 800);
    }
    return trials;
  },

  score(trials) {
    const reached = trials.filter((t) => t.ok).reduce((m, t) => Math.max(m, t.level), 0);
    return {
      score: reached,
      valid: trials.length > 0 && trials.length <= 40 && trials.filter((t) => !t.ok).length <= LIVES,
      detail: [
        { label: 'Boards cleared', value: String(trials.filter((t) => t.ok).length) },
        { label: 'Wrong squares', value: String(trials.reduce((s, t) => s + t.misses, 0)) },
      ],
    };
  },

  format: (s) => String(s),
};
