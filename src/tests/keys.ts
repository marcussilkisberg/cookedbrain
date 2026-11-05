import type { CookedTest } from '../core/types';
import { Rng } from '../core/rng';
import { Aborted } from '../core/stage';

const DURATION = 30000;
const WORDS =
  'the of and to in is you that it he was for on are as with his they at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part over new sound take only little work know place year live me back give most very after thing our just name good sentence man think say great where help through much before line right too mean old any same tell boy follow came want show also around form three small set put end does another well large must big even such because turn here why ask went men read need land different home us move try kind hand picture again change off play spell air away animal house point page letter mother answer found study still learn should world'.split(
    ' ',
  );

interface Content {
  words: string[];
}
interface Trial {
  word: string;
  typed: string;
  partial?: boolean;
}

export const keys: CookedTest<Content, Trial> = {
  id: 'keys',
  version: 1,
  name: 'Keys',
  searchTerm: 'Typing speed test',
  family: 'Language',
  howTo: 'Type the words for 30 seconds. The clock starts on your first key.',
  unit: 'wpm',
  lowerIsBetter: false,
  length: '30 s',

  generate(seed) {
    const r = new Rng(seed);
    const words: string[] = [];
    while (words.length < 260) {
      const w = r.pick(WORDS);
      if (w !== words[words.length - 1]) words.push(w);
    }
    return { words };
  },

  async run(content, stage) {
    stage.html(
      `<div class="ky"><div class="ky-box"><div class="ky-words">${content.words
        .map((w, i) => `<span data-i="${i}">${w}</span>`)
        .join(' ')}</div></div><p class="ky-hint">Start typing</p><input class="ky-in" id="ky-in" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Type the words here"></div>`,
    );
    const input = stage.el.querySelector('.ky-in') as HTMLInputElement;
    const strip = stage.el.querySelector('.ky-words') as HTMLElement;
    const hint = stage.el.querySelector('.ky-hint') as HTMLElement;
    const spans = [...strip.querySelectorAll<HTMLElement>('span')];
    const trials: Trial[] = [];
    let index = 0;
    let rowTop = 0;

    if (matchMedia('(pointer: coarse)').matches) {
      stage.forceInput('touch');
      hint.textContent = 'Tap to bring up the keyboard';
    }
    input.focus();
    const offFocus = stage.listen((p) => {
      if (!p.key) input.focus();
    });

    const markCurrent = (typed: string) => {
      const span = spans[index]!;
      const word = content.words[index]!;
      span.className = 'cur' + (word.startsWith(typed) ? '' : ' err');
      span.innerHTML = `<b>${typed.slice(0, word.length)}</b>${word.slice(typed.length)}`;
    };

    const follow = () => {
      const top = spans[index]!.offsetTop;
      if (top !== rowTop) {
        rowTop = top;
        strip.style.transform = `translateY(${-top}px)`;
      }
    };

    markCurrent('');
    let onFirst: () => void = () => {};
    const begun = new Promise<void>((resolve, reject) => {
      onFirst = resolve;
      stage.signal.addEventListener('abort', () => reject(new Aborted()), { once: true });
    });

    input.addEventListener(
      'input',
      () => {
        onFirst();
        hint.textContent = ' ';
        const v = input.value;
        if (v.endsWith(' ')) {
          const typed = v.trim();
          input.value = '';
          if (!typed) return;
          const word = content.words[index]!;
          const ok = typed === word;
          trials.push({ word, typed });
          spans[index]!.className = ok ? 'ok' : 'bad';
          spans[index]!.textContent = word;
          if (ok) stage.sound.tick();
          else stage.sound.bad();
          index++;
          follow();
          markCurrent('');
        } else {
          markCurrent(v);
        }
      },
      { signal: stage.signal },
    );

    await begun;
    await stage.clock(DURATION, (left) => {
      stage.status(`${Math.ceil(left / 1000)} s`);
    });
    offFocus();
    if (input.value) trials.push({ word: content.words[index]!, typed: input.value, partial: true });
    input.blur();
    return trials;
  },

  score(trials) {
    let chars = 0;
    let right = 0;
    let wrong = 0;
    for (const t of trials) {
      if (t.partial) {
        let n = 0;
        while (n < t.typed.length && t.typed[n] === t.word[n]) n++;
        chars += n;
      } else if (t.typed === t.word) {
        chars += t.word.length + 1;
        right++;
      } else wrong++;
    }
    const total = right + wrong || 1;
    return {
      score: Math.round(chars / 5 / (DURATION / 60000)),
      valid: trials.length >= 3 && chars / 5 / (DURATION / 60000) <= 300,
      detail: [
        { label: 'Accuracy', value: `${Math.round((right / total) * 100)}%` },
        { label: 'Words right', value: String(right) },
        { label: 'Words wrong', value: String(wrong) },
      ],
    };
  },

  format: (s) => String(s),
};
