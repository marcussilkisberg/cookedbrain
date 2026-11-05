import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';
import { keypadHtml, padKey } from './keypad';

const START = 3;
const MAX = 24;

interface Content {
  numbers: string[];
}
interface Trial {
  length: number;
  ok: boolean;
  entered: string;
  shown: string;
}

export const digits: CookedTest<Content, Trial> = {
  id: 'digits',
  version: 1,
  name: 'Digits',
  searchTerm: 'Number memory test',
  family: 'Memory',
  howTo: 'Hold the number after it vanishes. It grows by one each time.',
  unit: 'digits',
  lowerIsBetter: false,
  length: 'Until you fail',

  generate(seed) {
    const r = new Rng(seed);
    const numbers: string[] = [];
    for (let n = START; n <= MAX; n++) {
      let s = String(r.int(1, 9));
      while (s.length < n) s += String(r.int(0, 9));
      numbers.push(s);
    }
    return { numbers };
  },

  async run(content, stage) {
    const trials: Trial[] = [];

    for (const shown of content.numbers) {
      const len = shown.length;
      stage.status(`${len} digits`);
      stage.setBar(0);
      stage.html(`<div class="dg"><div class="dg-num">${shown}</div></div>`);
      const showFor = 900 + len * 430;
      await stage.clock(showFor);
      stage.setBar(0);

      stage.html(`<div class="dg"><div class="dg-num entry" aria-live="polite"><span class="caret"></span></div>${keypadHtml()}</div>`);
      const out = stage.el.querySelector('.dg-num') as HTMLElement;
      let entered = '';

      for (;;) {
        const k = padKey(await stage.press());
        if (k == null) continue;
        if (k === 'del') entered = entered.slice(0, -1);
        else if (k === 'ok') {
          if (entered.length) break;
        } else if (entered.length < len) {
          entered += k;
          stage.sound.tick();
        }
        out.innerHTML = `${entered}<span class="caret"></span>`;
        if (entered.length === len) break;
      }

      const ok = entered === shown;
      trials.push({ length: len, ok, entered, shown });
      if (!ok) {
        stage.sound.bad();
        out.innerHTML = `<s>${entered}</s><br><em>${shown}</em>`;
        out.classList.add('miss');
        await stage.wait(1200);
        return trials;
      }
      stage.sound.good();
      out.classList.add('clean');
      await stage.wait(320);
    }
    return trials;
  },

  score(trials) {
    const held = trials.filter((t) => t.ok).reduce((m, t) => Math.max(m, t.length), START - 1);
    return {
      score: held,
      valid: trials.length > 0,
      detail: [{ label: 'Longest held', value: `${held} digits` }],
    };
  },

  format: (s) => String(s),
};
