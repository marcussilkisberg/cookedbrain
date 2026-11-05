import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';
import { keypadHtml, padKey } from './keypad';

const DURATION = 30000;

interface Content {
  problems: { text: string; answer: string }[];
}
interface Trial {
  ms: number;
  slips: number;
}

export const sums: CookedTest<Content, Trial> = {
  id: 'sums',
  version: 1,
  name: 'Quick Sums',
  searchTerm: 'Mental maths test',
  family: 'Numbers',
  howTo: 'Answer as many sums as you can. The next appears when you are right.',
  unit: 'correct',
  lowerIsBetter: false,
  length: '30 s',
  countIn: true,

  generate(seed) {
    const r = new Rng(seed);
    const problems: Content['problems'] = [];
    for (let i = 0; i < 140; i++) {
      const hard = Math.min(1, i / 24);
      const kind = r.int(0, 2);
      if (kind === 0) {
        const a = r.int(4, 18 + Math.floor(hard * 70));
        const b = r.int(4, 18 + Math.floor(hard * 70));
        problems.push({ text: `${a} + ${b}`, answer: String(a + b) });
      } else if (kind === 1) {
        const a = r.int(12, 30 + Math.floor(hard * 80));
        const b = r.int(3, a - 1);
        problems.push({ text: `${a} – ${b}`, answer: String(a - b) });
      } else {
        const a = r.int(2, 6 + Math.floor(hard * 7));
        const b = r.int(2, 9 + Math.floor(hard * 3));
        problems.push({ text: `${a} × ${b}`, answer: String(a * b) });
      }
    }
    return { problems };
  },

  async run(content, stage) {
    stage.html(
      `<div class="dg sm"><div class="sm-q"></div><div class="dg-num entry" aria-live="polite"><span class="caret"></span></div>${keypadHtml()}</div>`,
    );
    const q = stage.el.querySelector('.sm-q') as HTMLElement;
    const out = stage.el.querySelector('.dg-num') as HTMLElement;
    const trials: Trial[] = [];
    let index = 0;
    let entry = '';
    let slips = 0;
    let shownAt = performance.now();

    const show = () => {
      q.textContent = content.problems[index % content.problems.length]!.text;
      entry = '';
      out.innerHTML = `<span class="caret"></span>`;
    };
    show();

    const off = stage.listen((p) => {
      const k = padKey(p);
      if (k == null || k === 'ok') return;
      if (k === 'del') entry = entry.slice(0, -1);
      else if (entry.length < 5) entry += k;
      const answer = content.problems[index % content.problems.length]!.answer;
      if (entry === answer) {
        trials.push({ ms: p.t - shownAt, slips });
        shownAt = p.t;
        slips = 0;
        index++;
        stage.sound.tick();
        show();
        return;
      }
      if (entry.length >= answer.length) {
        slips++;
        stage.sound.bad();
        entry = '';
      }
      out.innerHTML = `${entry}<span class="caret"></span>`;
    });

    await stage.clock(DURATION, (left) => {
      stage.status(`${Math.ceil(left / 1000)} s  ·  ${trials.length} right`);
    });
    off();
    return trials;
  },

  score(trials) {
    const slips = trials.reduce((s, t) => s + t.slips, 0);
    const avg = trials.length ? trials.reduce((s, t) => s + t.ms, 0) / trials.length : 0;
    return {
      score: trials.length,
      valid: trials.length === 0 || trials.reduce((s, t) => s + t.ms, 0) / trials.length >= 250,
      detail: [
        { label: 'Average answer', value: `${(avg / 1000).toFixed(2)} s` },
        { label: 'Slips', value: String(slips) },
      ],
    };
  },

  format: (s) => String(s),
};
