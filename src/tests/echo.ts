import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';

const START = 3;
const TILES = 9;

interface Content {
  sequence: number[];
}
interface Trial {
  length: number;
  ok: boolean;
}

export const echo: CookedTest<Content, Trial> = {
  id: 'echo',
  version: 1,
  name: 'Echo',
  searchTerm: 'Sequence memory test',
  family: 'Memory',
  howTo: 'Watch the burners light, then repeat the order. One mistake ends it.',
  unit: 'in sequence',
  lowerIsBetter: false,
  length: 'Until you fail',

  generate(seed) {
    const r = new Rng(seed);
    const sequence: number[] = [];
    while (sequence.length < 40) {
      const n = r.int(0, TILES - 1);
      if (n !== sequence[sequence.length - 1]) sequence.push(n);
    }
    return { sequence };
  },

  async run(content, stage) {
    stage.html(`<div class="grid g3 ec">${Array.from({ length: TILES }, (_, i) => `<button class="tile" data-i="${i}" aria-label="Burner ${i + 1}"></button>`).join('')}</div><p class="under"></p>`);
    const tiles = [...stage.el.querySelectorAll<HTMLElement>('.tile')];
    const under = stage.el.querySelector('.under') as HTMLElement;
    const trials: Trial[] = [];

    for (let len = START; len <= content.sequence.length; len++) {
      stage.status(`Length ${len}`);
      under.textContent = 'Watch';
      stage.el.classList.add('locked');
      await stage.wait(420);

      for (let i = 0; i < len; i++) {
        const t = tiles[content.sequence[i]!]!;
        t.classList.add('lit');
        await stage.wait(360);
        t.classList.remove('lit');
        await stage.wait(160);
      }

      stage.el.classList.remove('locked');
      under.textContent = 'Your turn';
      for (let i = 0; i < len; i++) {
        const p = await stage.press((q) => !!(q.target as HTMLElement | null)?.closest?.('.tile'));
        const el = (p.target as HTMLElement).closest('.tile') as HTMLElement;
        const pick = Number(el.dataset['i']);
        if (pick !== content.sequence[i]) {
          el.classList.add('wrong');
          tiles[content.sequence[i]!]!.classList.add('lit');
          stage.sound.bad();
          trials.push({ length: len, ok: false });
          under.textContent = `Lost it at ${len}`;
          await stage.wait(800);
          return trials;
        }
        stage.sound.tick();
        el.classList.add('press');
        setTimeout(() => el.classList.remove('press'), 130);
      }
      stage.sound.good();
      trials.push({ length: len, ok: true });
      under.textContent = 'Clean';
      await stage.wait(320);
    }
    return trials;
  },

  score(trials) {
    const held = trials.filter((t) => t.ok).reduce((m, t) => Math.max(m, t.length), START - 1);
    return {
      score: held,
      valid: trials.length > 0 && trials.every((t, i) => t.length === START + i),
      detail: [
        { label: 'Longest held', value: String(held) },
        { label: 'Levels cleared', value: String(trials.filter((t) => t.ok).length) },
      ],
    };
  },

  format: (s) => String(s),
};
