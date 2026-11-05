import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';
import { cellSvg } from './pattern';

const DURATION = 45000;
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;

type Cell = Parameters<typeof cellSvg>[0] & object;
interface Round {
  cells: Cell[];
  odd: number;
}
interface Content {
  rounds: Round[];
}
interface Trial {
  ok: boolean;
  ms: number;
}

/** Four cells share a rule on every property but one. The odd one breaks exactly that. */
function makeRound(r: Rng, level: number): Round {
  const base: Cell = { shape: r.pick(SHAPES), count: r.int(1, 3), filled: r.next() < 0.5, turn: r.pick([0, 45, 90]) };
  const free = r.shuffle(['shape', 'count', 'fill', 'turn'] as const).slice(0, Math.min(3, 1 + Math.floor(level / 4)));
  const broken = r.pick((['shape', 'count', 'fill', 'turn'] as const).filter((k) => !free.includes(k)));
  const cells: Cell[] = Array.from({ length: 4 }, () => {
    const c = { ...base };
    // Free properties vary so the eye cannot just match everything.
    if (free.includes('shape')) c.shape = r.pick(SHAPES);
    if (free.includes('count')) c.count = r.int(1, 3);
    if (free.includes('fill')) c.filled = r.next() < 0.5;
    if (free.includes('turn')) c.turn = r.pick([0, 45, 90]);
    return c;
  });
  const odd = r.int(0, 3);
  const o = cells[odd]!;
  if (broken === 'shape') o.shape = r.pick(SHAPES.filter((s) => s !== base.shape));
  if (broken === 'count') o.count = r.pick([1, 2, 3].filter((n) => n !== base.count));
  if (broken === 'fill') o.filled = !base.filled;
  if (broken === 'turn') o.turn = r.pick([0, 45, 90].filter((t) => t !== base.turn));
  return { cells, odd };
}

export const oddone: CookedTest<Content, Trial> = {
  id: 'oddone',
  version: 1,
  name: 'Odd One Out',
  searchTerm: 'Logic puzzle test',
  family: 'Logic',
  howTo: 'Three follow a rule. One breaks it. Tap the one that breaks it.',
  unit: 'correct',
  lowerIsBetter: false,
  length: '45 s',
  countIn: true,

  generate(seed) {
    const r = new Rng(seed);
    return { rounds: Array.from({ length: 80 }, (_, i) => makeRound(r, i)) };
  },

  async run(content, stage) {
    stage.html(`<div class="ps"><div class="ps-opts four"></div></div>`);
    const opts = stage.el.querySelector('.ps-opts') as HTMLElement;
    const trials: Trial[] = [];
    let index = 0;
    let right = 0;
    let shownAt = performance.now();

    const show = () => {
      const p = content.rounds[index % content.rounds.length]!;
      opts.innerHTML = p.cells.map((c, i) => `<button class="ps-cell opt" data-i="${i}"><kbd>${i + 1}</kbd>${cellSvg(c)}</button>`).join('');
    };
    show();

    const off = stage.listen((q) => {
      let pick = -1;
      if (q.key) pick = /^[1-4]$/.test(q.key) ? Number(q.key) - 1 : -1;
      else {
        const el = (q.target as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null;
        if (el) pick = Number(el.dataset['i']);
      }
      if (pick < 0) return;
      const p = content.rounds[index % content.rounds.length]!;
      const ok = pick === p.odd;
      trials.push({ ok, ms: q.t - shownAt });
      if (ok) {
        right++;
        stage.sound.tick();
      } else stage.sound.bad();
      shownAt = q.t;
      index++;
      show();
    });

    await stage.clock(DURATION, (left) => {
      stage.status(`${Math.ceil(left / 1000)} s  ·  ${right} right`);
    });
    off();
    return trials;
  },

  score(trials) {
    const right = trials.filter((t) => t.ok).length;
    const wrong = trials.length - right;
    return {
      score: Math.max(0, right - wrong),
      valid: trials.length >= 2 && trials.reduce((s, t) => s + t.ms, 0) / trials.length >= 150,
      detail: [
        { label: 'Right', value: String(right) },
        { label: 'Wrong', value: String(wrong) },
      ],
    };
  },

  format: (s) => String(s),
};
