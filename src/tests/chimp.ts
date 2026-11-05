import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const START = 4;
const STRIKES = 3;
const LONG = 8;
const SHORT = 5;

interface Content {
  seed: string;
}
interface Trial {
  count: number;
  ok: boolean;
}

export const chimp: CookedTest<Content, Trial> = {
  id: 'chimp',
  version: 1,
  name: 'Chimp',
  searchTerm: 'Chimp test',
  family: 'Memory',
  howTo: 'Tap the numbers in order. After the first tap they all go blank.',
  unit: 'numbers',
  lowerIsBetter: false,
  length: 'Until you fail',

  generate(seed) {
    return { seed };
  },

  async run(content, stage) {
    const trials: Trial[] = [];
    const wide = stage.width >= stage.height;
    const cols = wide ? LONG : SHORT;
    const rows = wide ? SHORT : LONG;
    const cells = cols * rows;
    let strikes = 0;
    let count = START;
    let tries = 0;

    while (strikes < STRIKES && count <= 30) {
      const r = new Rng(`${content.seed}:${count}:${tries++}`);
      const spots = r.shuffle(Array.from({ length: cells }, (_, i) => i)).slice(0, count);
      stage.status(`${count} numbers  ·  ${'●'.repeat(STRIKES - strikes)}${'○'.repeat(strikes)}`);

      const at = new Map(spots.map((cell, i) => [cell, i + 1]));
      stage.html(
        `<div class="grid ch" style="--c:${cols};--r:${rows}">${Array.from({ length: cells }, (_, i) => {
          const n = at.get(i);
          return n ? `<button class="tile num" data-n="${n}">${n}</button>` : `<span class="void"></span>`;
        }).join('')}</div>`,
      );

      let next = 1;
      let ok = true;
      while (next <= count) {
        const p = await stage.press((q) => !!(q.target as HTMLElement | null)?.closest?.('.num'));
        const el = (p.target as HTMLElement).closest('.num') as HTMLElement;
        const n = Number(el.dataset['n']);
        if (el.classList.contains('gone')) continue;
        if (n !== next) {
          ok = false;
          el.classList.add('wrong');
          stage.el.querySelectorAll('.num').forEach((t) => t.classList.remove('hide'));
          stage.sound.bad();
          break;
        }
        el.classList.add('gone');
        if (next === 1) stage.el.querySelectorAll('.num').forEach((t) => t.classList.add('hide'));
        stage.sound.tick();
        next++;
      }

      trials.push({ count, ok });
      if (ok) {
        stage.sound.good();
        count++;
        await stage.wait(220);
      } else {
        strikes++;
        await stage.wait(900);
      }
    }
    return trials;
  },

  score(trials) {
    const held = trials.filter((t) => t.ok).reduce((m, t) => Math.max(m, t.count), START - 1);
    return {
      score: held,
      valid: trials.length > 0 && trials.length <= 40 && trials.every((t) => t.count >= START && t.count <= 30),
      detail: [{ label: 'Boards cleared', value: String(trials.filter((t) => t.ok).length) }],
    };
  },

  format: (s) => String(s),
};
