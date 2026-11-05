import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const ROUNDS = 40;
const SHOW_MS = 650;
const GAP_MS = 350;

interface Content {
  /** true means go, false means hold back. About a fifth are no-go. */
  go: boolean[];
}
interface Trial {
  go: boolean;
  pressed: boolean;
  rt: number | null;
}

export const dont: CookedTest<Content, Trial> = {
  id: 'dont',
  version: 1,
  name: "Don't",
  searchTerm: 'Impulse control test',
  family: 'Logic',
  howTo: 'Press on every circle. Do not press on a square. It is harder than it sounds.',
  unit: 'score',
  lowerIsBetter: false,
  length: '40 s',

  generate(seed) {
    const r = new Rng(seed);
    const go: boolean[] = [];
    for (let i = 0; i < ROUNDS; i++) go.push(i < 3 ? true : r.next() >= 0.22);
    return { go };
  },

  async run(content, stage) {
    stage.html(`<div class="dn"><div class="dn-shape"></div></div>`);
    const shape = stage.el.querySelector('.dn-shape') as HTMLElement;
    const trials: Trial[] = [];

    for (let i = 0; i < ROUNDS; i++) {
      const go = content.go[i]!;
      stage.status(`${i + 1} of ${ROUNDS}`);
      stage.setBar(i / ROUNDS);
      shape.className = 'dn-shape';
      await stage.wait(GAP_MS);
      let pressedAt: number | null = null;
      const off = stage.listen((p) => {
        pressedAt ??= p.t;
      });
      const onset = await stage.frame();
      shape.className = `dn-shape on ${go ? 'go' : 'nogo'}`;
      await stage.wait(SHOW_MS);
      off();
      const pressed = pressedAt != null;
      trials.push({ go, pressed, rt: pressed ? pressedAt! - onset : null });
      if (go === pressed) stage.sound.tick();
      else {
        stage.sound.bad();
        shape.classList.add('miss');
        await stage.wait(200);
      }
    }
    return trials;
  },

  score(trials) {
    const hits = trials.filter((t) => t.go && t.pressed);
    const slips = trials.filter((t) => !t.go && t.pressed).length;
    const missed = trials.filter((t) => t.go && !t.pressed).length;
    const avg = hits.length ? hits.reduce((s, t) => s + (t.rt ?? 0), 0) / hits.length : 0;
    // A fast, clean run scores best: speed bonus for hits, a flat cost per slip.
    const score = Math.max(0, Math.round(hits.length * 2 - slips * 6 - missed * 2 + Math.max(0, 40 - avg / 10)));
    return {
      score,
      valid: trials.length === ROUNDS && hits.every((t) => (t.rt ?? 0) >= 100),
      detail: [
        { label: 'Pressed on a square', value: String(slips) },
        { label: 'Missed circles', value: String(missed) },
        { label: 'Average press', value: `${Math.round(avg)} ms` },
      ],
    };
  },

  format: (s) => String(s),
};
