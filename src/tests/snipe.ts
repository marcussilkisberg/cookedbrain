import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const TARGETS = 16;
const RADIUS = 34;

interface Content {
  spots: [number, number][];
}
interface Trial {
  ms: number;
  misses: number;
}

export const snipe: CookedTest<Content, Trial> = {
  id: 'snipe',
  version: 1,
  name: 'Snipe',
  searchTerm: 'Aim trainer',
  family: 'Reflex',
  howTo: 'Hit every target as it appears. Fifteen timed hits.',
  unit: 'ms per target',
  lowerIsBetter: true,
  length: '15 s',

  generate(seed) {
    const r = new Rng(seed);
    const spots: [number, number][] = [];
    let last: [number, number] = [0.5, 0.5];
    while (spots.length < TARGETS) {
      const next: [number, number] = [r.next(), r.next()];
      // Keep each jump far enough to need a real move.
      if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 0.28) continue;
      spots.push(next);
      last = next;
    }
    return { spots };
  },

  async run(content, stage) {
    stage.html(`<div class="sn"><div class="sn-target" aria-label="Target"><i></i></div><p class="sn-hint">First hit starts the clock</p></div>`);
    const dot = stage.el.querySelector('.sn-target') as HTMLElement;
    const hint = stage.el.querySelector('.sn-hint') as HTMLElement;
    const trials: Trial[] = [];
    const pad = RADIUS + 12;
    let misses = 0;
    let prev = 0;

    for (let i = 0; i < TARGETS; i++) {
      const [fx, fy] = content.spots[i]!;
      const x = pad + fx * (stage.width - pad * 2);
      const y = pad + fy * (stage.height - pad * 2);
      dot.style.transform = `translate(${x - RADIUS}px, ${y - RADIUS}px)`;
      stage.status(i === 0 ? 'Ready' : `${i} of ${TARGETS - 1}`);

      for (;;) {
        const p = await stage.press((q) => q.source !== 'keyboard');
        // Fingers are less exact than cursors, so touch gets a little slack.
        const reach = RADIUS + (p.source === 'touch' ? 10 : 0);
        if (Math.hypot(p.x - x, p.y - y) <= reach) {
          if (i > 0) trials.push({ ms: p.t - prev, misses });
          else hint.remove();
          prev = p.t;
          misses = 0;
          stage.sound.tick();
          stage.setBar(i / (TARGETS - 1));
          break;
        }
        misses++;
        stage.sound.bad();
      }
    }
    return trials;
  },

  score(trials) {
    const total = trials.reduce((s, t) => s + t.ms, 0);
    const misses = trials.reduce((s, t) => s + t.misses, 0);
    const n = trials.length || 1;
    return {
      score: Math.round(total / n),
      valid: trials.length === TARGETS - 1,
      detail: [
        { label: 'Total time', value: `${(total / 1000).toFixed(2)} s` },
        { label: 'Misses', value: String(misses) },
        { label: 'Fastest hit', value: `${Math.round(Math.min(...trials.map((t) => t.ms)))} ms` },
      ],
    };
  },

  format: (s) => String(Math.round(s)),
};
