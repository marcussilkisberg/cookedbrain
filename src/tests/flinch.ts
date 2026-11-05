import type { CookedTest, Press } from '../core/types';
import { Rng } from '../core/rng';
import { median } from '../core/stats';

const ROUNDS = 5;
/** Anything faster than this is anticipation, not reaction. */
const FLOOR_MS = 100;

interface Content {
  delays: number[];
}
interface Trial {
  rt: number | null;
}

export const flinch: CookedTest<Content, Trial> = {
  id: 'flinch',
  version: 1,
  name: 'Flinch',
  searchTerm: 'Reaction time test',
  family: 'Reflex',
  howTo: 'Press the instant the screen goes bright. Five times.',
  unit: 'ms',
  lowerIsBetter: true,
  length: '20 s',

  generate(seed) {
    const r = new Rng(seed);
    return { delays: Array.from({ length: 24 }, () => r.int(1000, 3400)) };
  },

  async run(content, stage) {
    const trials: Trial[] = [];
    let slot = 0;
    let done = 0;

    while (done < ROUNDS) {
      stage.status(`${done + 1} of ${ROUNDS}`);
      stage.setBar(done / ROUNDS);
      stage.html(`<div class="fl"><div class="fl-ring"></div><p class="fl-msg">Wait for it</p></div>`);
      const box = stage.el.firstElementChild as HTMLElement;
      const msg = box.querySelector('.fl-msg') as HTMLElement;

      const target = performance.now() + content.delays[slot++ % content.delays.length]!;
      let early: Press | null = null;
      const off = stage.listen((p) => {
        early = p;
      });

      // The stimulus changes inside a frame, and that frame's timestamp is onset.
      // Whatever the display adds is left in: it is part of the real response.
      let onset = 0;
      for (;;) {
        const ts = await stage.frame();
        if (early) break;
        if (ts >= target) {
          box.classList.add('go');
          msg.textContent = 'Now';
          onset = ts;
          break;
        }
      }
      off();

      if (early) {
        trials.push({ rt: null });
        stage.sound.bad();
        box.classList.add('early');
        msg.textContent = 'Undercooked. Wait for it.';
        await stage.wait(800);
        continue;
      }

      const p = await stage.press();
      const rt = p.t - onset;
      if (rt < FLOOR_MS) {
        trials.push({ rt: null });
        stage.sound.bad();
        box.classList.remove('go');
        box.classList.add('early');
        msg.textContent = 'Too fast to be real. Wait for it.';
        await stage.wait(800);
        continue;
      }

      trials.push({ rt });
      done++;
      stage.sound.tick();
      box.classList.remove('go');
      box.classList.add('hit');
      msg.innerHTML = `<b>${Math.round(rt)}</b> ms`;
      stage.setBar(done / ROUNDS);
      await stage.wait(done === ROUNDS ? 200 : 520);
    }
    return trials;
  },

  score(trials) {
    const valid = trials.flatMap((t) => (t.rt == null || t.rt < FLOOR_MS || !Number.isFinite(t.rt) ? [] : [t.rt]));
    const early = trials.length - valid.length;
    return {
      score: Math.round(median(valid)),
      valid: valid.length >= ROUNDS && trials.length <= ROUNDS * 4,
      detail: [
        { label: 'Fastest', value: `${Math.round(Math.min(...valid))} ms` },
        { label: 'Slowest', value: `${Math.round(Math.max(...valid))} ms` },
        { label: 'False starts', value: String(early) },
      ],
      series: valid.map((v) => ({ value: v, label: `${Math.round(v)}` })),
    };
  },

  format: (s) => String(Math.round(s)),
};
