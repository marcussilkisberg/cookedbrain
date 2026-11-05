import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const DURATION = 60000;
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
type Shape = (typeof SHAPES)[number];

interface Cell {
  shape: Shape;
  count: number;
  filled: boolean;
  turn: number;
}
interface Puzzle {
  cells: Cell[];
  options: Cell[];
  answer: number;
}
interface Content {
  puzzles: Puzzle[];
}
interface Trial {
  ok: boolean;
  ms: number;
}

/**
 * Each puzzle stacks one to three rules across a 3x3 matrix: a shape that
 * cycles along rows, a count that climbs along columns, a fill that flips, a
 * turn that rotates. Difficulty is the number of rules stacked.
 */
function makePuzzle(r: Rng, rules: number): Puzzle {
  const base: Cell = { shape: r.pick(SHAPES), count: r.int(1, 2), filled: r.next() < 0.5, turn: 0 };
  const active = r.shuffle(['shape', 'count', 'fill', 'turn'] as const).slice(0, rules);
  const shapeOrder = r.shuffle(SHAPES);
  const cell = (row: number, col: number): Cell => {
    const c = { ...base };
    if (active.includes('shape')) c.shape = shapeOrder[(row + col) % 3]!;
    if (active.includes('count')) c.count = 1 + ((base.count + col) % 3);
    if (active.includes('fill')) c.filled = (row + col) % 2 === 0;
    if (active.includes('turn')) c.turn = (row * 45 + col * 45) % 180;
    return c;
  };
  const cells = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) cells.push(cell(row, col));
  const right = cells[8]!;
  const same = (a: Cell, b: Cell) => a.shape === b.shape && a.count === b.count && a.filled === b.filled && a.turn === b.turn;
  const options: Cell[] = [right];
  let guard = 0;
  while (options.length < 4 && guard++ < 200) {
    const d = { ...right };
    const k = r.int(0, 3);
    if (k === 0) d.shape = r.pick(SHAPES.filter((s) => s !== right.shape));
    else if (k === 1) d.count = r.pick([1, 2, 3].filter((n) => n !== right.count));
    else if (k === 2) d.filled = !right.filled;
    else d.turn = (right.turn + r.pick([45, 90, 135])) % 180;
    if (!options.some((o) => same(o, d))) options.push(d);
  }
  const shuffled = r.shuffle(options);
  return { cells, options: shuffled, answer: shuffled.findIndex((o) => same(o, right)) };
}

function glyph(shape: Shape, filled: boolean, turn: number) {
  const f = filled ? 'currentColor' : 'none';
  const s = `stroke="currentColor" stroke-width="2.4" fill="${f}"`;
  const t = `transform="rotate(${turn} 12 12)"`;
  if (shape === 'circle') return `<circle cx="12" cy="12" r="8" ${s} ${t}/>`;
  if (shape === 'square') return `<rect x="4.5" y="4.5" width="15" height="15" rx="1.5" ${s} ${t}/>`;
  if (shape === 'diamond') return `<path d="M12 3.5 20.5 12 12 20.5 3.5 12z" ${s} ${t}/>`;
  return `<path d="M12 4 20.5 19.5 3.5 19.5z" ${s} ${t}/>`;
}

export function cellSvg(c: Cell | null) {
  if (!c) return `<svg viewBox="0 0 24 24" class="ps-missing"><text x="12" y="16" text-anchor="middle" font-size="12">?</text></svg>`;
  const xs = c.count === 1 ? [12] : c.count === 2 ? [7, 17] : [5, 12, 19];
  const scale = c.count === 1 ? 1 : c.count === 2 ? 0.55 : 0.42;
  return `<svg viewBox="0 0 24 24">${xs.map((x) => `<g transform="translate(${x} 12) scale(${scale}) translate(-12 -12)">${glyph(c.shape, c.filled, c.turn)}</g>`).join('')}</svg>`;
}

export const pattern: CookedTest<Content, Trial> = {
  id: 'pattern',
  version: 1,
  name: 'Pattern Sprint',
  searchTerm: 'Pattern reasoning test',
  family: 'Logic',
  howTo: 'Find the rule, fill the missing cell. Puzzles get harder as you go.',
  unit: 'solved',
  lowerIsBetter: false,
  length: '60 s',
  countIn: true,

  generate(seed) {
    const r = new Rng(seed);
    return { puzzles: Array.from({ length: 60 }, (_, i) => makePuzzle(r, i < 3 ? 1 : i < 10 ? 2 : 3)) };
  },

  async run(content, stage) {
    stage.html(`<div class="ps"><div class="ps-grid"></div><div class="ps-opts"></div></div>`);
    const grid = stage.el.querySelector('.ps-grid') as HTMLElement;
    const opts = stage.el.querySelector('.ps-opts') as HTMLElement;
    const trials: Trial[] = [];
    let index = 0;
    let right = 0;
    let shownAt = performance.now();

    const show = () => {
      const p = content.puzzles[index % content.puzzles.length]!;
      grid.innerHTML = p.cells.map((c, i) => `<div class="ps-cell">${cellSvg(i === 8 ? null : c)}</div>`).join('');
      opts.innerHTML = p.options.map((o, i) => `<button class="ps-cell opt" data-i="${i}"><kbd>${i + 1}</kbd>${cellSvg(o)}</button>`).join('');
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
      const p = content.puzzles[index % content.puzzles.length]!;
      const ok = pick === p.answer;
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
      stage.status(`${Math.ceil(left / 1000)} s  ·  ${right} solved`);
    });
    off();
    return trials;
  },

  score(trials) {
    const right = trials.filter((t) => t.ok).length;
    const wrong = trials.length - right;
    return {
      score: Math.max(0, right - wrong),
      valid: trials.length >= 2,
      detail: [
        { label: 'Solved', value: String(right) },
        { label: 'Wrong', value: String(wrong) },
      ],
    };
  },

  format: (s) => String(s),
};
