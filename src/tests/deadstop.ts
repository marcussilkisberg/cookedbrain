import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const TARGETS = [3000, 4000, 5000, 6000, 7000, 8000, 10000];
const VISIBLE_MS = 1000;
const ATTEMPTS = 3;

interface Content {
  targets: number[];
}
interface Trial {
  target: number;
  error: number;
}

export const deadstop: CookedTest<Content, Trial> = {
  id: 'deadstop',
  version: 1,
  name: 'Dead Stop',
  searchTerm: 'Time perception test',
  family: 'Reflex',
  howTo: 'The clock goes dark after one second. Stop it on the target. Three targets, all different.',
  unit: 'ms off',
  lowerIsBetter: true,
  length: '25 s',

  generate(seed) {
    const r = new Rng(seed);
    return { targets: r.shuffle(TARGETS).slice(0, ATTEMPTS) };
  },

  async run(content, stage) {
    const trials: Trial[] = [];

    for (let i = 0; i < ATTEMPTS; i++) {
      stage.status(`${i + 1} of ${ATTEMPTS}`);
      stage.setBar(i / ATTEMPTS);
      const target = content.targets[i]!;
      const shown = (target / 1000).toFixed(3);
      stage.html(`<div class="ds"><p class="ds-target">Target <b>${shown}</b></p><div class="ds-clock">0.000</div><p class="ds-msg">Press to start the clock</p></div>`);
      const clock = stage.el.querySelector('.ds-clock') as HTMLElement;
      const msg = stage.el.querySelector('.ds-msg') as HTMLElement;

      const start = await stage.press();
      stage.sound.tick();
      msg.textContent = `Press at ${shown}`;

      let stopped: number | null = null;
      const off = stage.listen((p) => {
        stopped = p.t;
      });
      for (;;) {
        const ts = await stage.frame();
        if (stopped != null) break;
        const elapsed = ts - start.t;
        if (elapsed < VISIBLE_MS) {
          clock.textContent = (Math.max(0, elapsed) / 1000).toFixed(3);
        } else if (!clock.classList.contains('dark')) {
          clock.classList.add('dark');
          clock.textContent = '?.???';
          msg.textContent = `The clock is off. Press at ${shown}`;
        }
        if (elapsed > target + 7000) {
          stopped = start.t + elapsed;
          break;
        }
      }
      off();

      const error = (stopped as unknown as number) - start.t - target;
      trials.push({ target, error });
      stage.sound.good();
      clock.classList.remove('dark');
      clock.textContent = ((target + error) / 1000).toFixed(3);
      msg.textContent = `${error >= 0 ? 'Late' : 'Early'} by ${Math.abs(Math.round(error))} ms`;
      stage.setBar((i + 1) / ATTEMPTS);
      await stage.wait(i === ATTEMPTS - 1 ? 700 : 1100);
    }
    return trials;
  },

  score(trials) {
    const abs = trials.map((t) => Math.abs(t.error));
    const mean = abs.reduce((a, b) => a + b, 0) / (abs.length || 1);
    return {
      score: Math.round(mean),
      valid: trials.length === ATTEMPTS && trials.every((t) => Number.isFinite(t.error) && TARGETS.includes(t.target)),
      detail: trials.map((t) => ({
        label: `${(t.target / 1000).toFixed(0)} s target`,
        value: `${t.error >= 0 ? '+' : '-'}${Math.abs(Math.round(t.error))} ms`,
      })),
    };
  },

  format: (s) => String(Math.round(s)),
};
