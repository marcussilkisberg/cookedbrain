import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const DURATION = 30000;
const INKS = [
  { name: 'Red', key: 'r', css: 'var(--ink-red)' },
  { name: 'Blue', key: 'b', css: 'var(--ink-blue)' },
  { name: 'Green', key: 'g', css: 'var(--ink-green)' },
  { name: 'Yellow', key: 'y', css: 'var(--ink-yellow)' },
] as const;

interface Content {
  prompts: { word: number; ink: number }[];
}
interface Trial {
  ok: boolean;
  ms: number;
}

const inkFromKey = (key: string) => {
  const k = key.toLowerCase();
  const byLetter = INKS.findIndex((i) => i.key === k);
  if (byLetter >= 0) return byLetter;
  return /^[1-4]$/.test(k) ? Number(k) - 1 : -1;
};

export const liar: CookedTest<Content, Trial> = {
  id: 'liar',
  version: 1,
  name: 'Liar',
  searchTerm: 'Stroop test',
  family: 'Attention',
  howTo: 'Pick the colour of the ink. Ignore what the word says.',
  unit: 'correct',
  lowerIsBetter: false,
  length: '30 s',
  countIn: true,

  generate(seed) {
    const r = new Rng(seed);
    const prompts: Content['prompts'] = [];
    let prev = -1;
    while (prompts.length < 200) {
      const ink = r.int(0, 3);
      if (ink === prev) continue;
      prev = ink;
      // A quarter of the words tell the truth, which keeps you honest.
      let word = ink;
      if (r.next() > 0.25) while (word === ink) word = r.int(0, 3);
      prompts.push({ word, ink });
    }
    return { prompts };
  },

  async run(content, stage) {
    stage.html(
      `<div class="lr"><div class="lr-word"></div><div class="lr-opts">${INKS.map(
        (i, n) => `<button class="opt" data-i="${n}"><i style="background:${i.css}"></i>${i.name}</button>`,
      ).join('')}</div></div>`,
    );
    const word = stage.el.querySelector('.lr-word') as HTMLElement;
    const trials: Trial[] = [];
    let index = 0;
    let shownAt = performance.now();
    let right = 0;

    const show = () => {
      const q = content.prompts[index % content.prompts.length]!;
      word.textContent = INKS[q.word]!.name;
      word.style.color = INKS[q.ink]!.css;
    };
    show();

    const off = stage.listen((p) => {
      let pick = -1;
      if (p.key) pick = inkFromKey(p.key);
      else {
        const el = (p.target as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null;
        if (el) pick = Number(el.dataset['i']);
      }
      if (pick < 0) return;
      const q = content.prompts[index % content.prompts.length]!;
      const ok = pick === q.ink;
      trials.push({ ok, ms: p.t - shownAt });
      if (ok) {
        right++;
        stage.sound.tick();
      } else {
        stage.sound.bad();
        word.classList.remove('flub');
        void word.offsetWidth;
        word.classList.add('flub');
      }
      index++;
      shownAt = p.t;
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
    const avg = right ? trials.filter((t) => t.ok).reduce((s, t) => s + t.ms, 0) / right : 0;
    return {
      score: Math.max(0, right - wrong),
      valid: trials.length >= 3 && trials.reduce((s, t) => s + t.ms, 0) / trials.length >= 150,
      detail: [
        { label: 'Right', value: String(right) },
        { label: 'Wrong', value: String(wrong) },
        { label: 'Average answer', value: `${Math.round(avg)} ms` },
      ],
    };
  },

  format: (s) => String(s),
};
