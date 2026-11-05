import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const DURATION = 30000;
const CELLS = 7;
const SPAN = 5;

type Cell = [number, number];
interface Prompt {
  cells: Cell[];
  mirrored: boolean;
  turnA: number;
  turnB: number;
}
interface Content {
  prompts: Prompt[];
}
interface Trial {
  ok: boolean;
  ms: number;
}

const canon = (cells: Cell[]) => {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => `${x - minX},${y - minY}`)
    .sort()
    .join(' ');
};
const rot = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-y, x]);
const flip = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-x, y]);

/** True when no rotation turns the shape into its mirror image. */
function isChiral(cells: Cell[]) {
  const target = canon(flip(cells));
  let c = cells;
  for (let i = 0; i < 4; i++) {
    if (canon(c) === target) return false;
    c = rot(c);
  }
  return true;
}

function growShape(r: Rng): Cell[] {
  for (;;) {
    const cells: Cell[] = [[2, 2]];
    const has = (x: number, y: number) => cells.some((c) => c[0] === x && c[1] === y);
    let guard = 0;
    while (cells.length < CELLS && guard++ < 80) {
      const [x, y] = r.pick(cells);
      const [dx, dy] = r.pick([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const);
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < SPAN && ny < SPAN && !has(nx, ny)) cells.push([nx, ny]);
    }
    if (cells.length === CELLS && isChiral(cells)) return cells;
  }
}

function shapeSvg(cells: Cell[], turn: number, flipped: boolean) {
  const rects = cells.map(([x, y]) => `<rect x="${x * 20 + 1}" y="${y * 20 + 1}" width="18" height="18" rx="2.5"/>`).join('');
  const t = `rotate(${turn} 50 50)${flipped ? ' translate(100 0) scale(-1 1)' : ''}`;
  return `<svg viewBox="-20 -20 140 140" role="img" aria-label="Shape"><g transform="${t}">${rects}</g></svg>`;
}

export const spin: CookedTest<Content, Trial> = {
  id: 'spin',
  version: 1,
  name: 'Spin',
  searchTerm: 'Mental rotation test',
  family: 'Spatial',
  howTo: 'Is the right shape the left one turned, or its mirror image?',
  unit: 'correct',
  lowerIsBetter: false,
  length: '30 s',
  countIn: true,

  generate(seed) {
    const r = new Rng(seed);
    const prompts: Prompt[] = Array.from({ length: 120 }, () => ({
      cells: growShape(r),
      mirrored: r.next() < 0.5,
      turnA: r.int(0, 7) * 45,
      turnB: r.int(0, 7) * 45,
    }));
    return { prompts };
  },

  async run(content, stage) {
    stage.html(
      `<div class="sp"><div class="sp-pair"><div class="sp-a"></div><div class="sp-b"></div></div><div class="lr-opts two"><button class="opt" data-v="0">Same<kbd>F</kbd></button><button class="opt" data-v="1">Mirror<kbd>J</kbd></button></div></div>`,
    );
    const a = stage.el.querySelector('.sp-a') as HTMLElement;
    const b = stage.el.querySelector('.sp-b') as HTMLElement;
    const trials: Trial[] = [];
    let index = 0;
    let right = 0;
    let shownAt = performance.now();

    const show = () => {
      const q = content.prompts[index % content.prompts.length]!;
      a.innerHTML = shapeSvg(q.cells, q.turnA, false);
      b.innerHTML = shapeSvg(q.cells, q.turnB, q.mirrored);
    };
    show();

    const off = stage.listen((p) => {
      let v = -1;
      if (p.key) {
        const k = p.key.toLowerCase();
        if (k === 'f' || k === 'arrowleft') v = 0;
        if (k === 'j' || k === 'arrowright') v = 1;
      } else {
        const el = (p.target as HTMLElement | null)?.closest?.('[data-v]') as HTMLElement | null;
        if (el) v = Number(el.dataset['v']);
      }
      if (v < 0) return;
      const q = content.prompts[index % content.prompts.length]!;
      const ok = (v === 1) === q.mirrored;
      trials.push({ ok, ms: p.t - shownAt });
      if (ok) {
        right++;
        stage.sound.tick();
      } else stage.sound.bad();
      shownAt = p.t;
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
      valid: trials.length >= 3,
      detail: [
        { label: 'Right', value: String(right) },
        { label: 'Wrong', value: String(wrong) },
      ],
    };
  },

  format: (s) => String(s),
};
