import { FAMILIES, type CookedTest, type InputClass } from '../core/types';
import { median, place, tierFor, TIERS, type Tier } from '../core/stats';
import { keyFor, store, type TestRow } from '../core/store';
import { TESTS, testById } from '../tests';
import { esc, meltStyle } from './dom';
import { fmt, pct } from './results';

const INPUTS: InputClass[] = ['mouse', 'touch', 'keyboard'];
const INPUT_LABEL: Record<InputClass, string> = { mouse: 'Mouse', touch: 'Touch', keyboard: 'Keyboard' };

/** The device class a player has used most on a test. */
function mainRow(t: CookedTest): { input: InputClass; row: TestRow } | null {
  let top: { input: InputClass; row: TestRow } | null = null;
  for (const input of INPUTS) {
    const row = store.doc.tests[keyFor(t.id, input)];
    if (row && (!top || row.rounds > top.row.rounds)) top = { input, row };
  }
  return top;
}

function standing(t: CookedTest): { cooked: number; tier: Tier; best: number; rounds: number; input: InputClass } | null {
  const m = mainRow(t);
  if (!m) return null;
  const p = place(t, m.input, median(m.row.recent), store.others(keyFor(t.id, m.input)));
  return { cooked: p.cooked, tier: p.tier, best: m.row.best, rounds: m.row.rounds, input: m.input };
}

const chip = (tier: Tier) => `<span class="tier-chip" style="--tier:var(--t-${tier.id})">${esc(tier.name)}</span>`;

/** Each card shows its own stimulus, drawn in one stroke weight. */
const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICONS: Record<string, string> = {
  flinch: `<circle cx="12" cy="12" r="8" ${S}/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>`,
  snipe: `<circle cx="12" cy="12" r="8" ${S}/><circle cx="12" cy="12" r="3.5" ${S}/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" ${S}/>`,
  deadstop: `<circle cx="12" cy="13" r="8" ${S}/><path d="M12 13V8M12 13l3 2M10 2h4" ${S}/>`,
  echo: `${[4, 12, 20].flatMap((y) => [4, 12, 20].map((x) => `<circle cx="${x}" cy="${y}" r="2.4" ${x === 12 && y === 12 ? 'fill="currentColor"' : S}/>`)).join('')}`,
  digits: `<text x="12" y="17" text-anchor="middle" font-size="13" font-weight="700" font-family="inherit" fill="currentColor">7 4</text><path d="M4 21h16" ${S} stroke-dasharray="2 2"/>`,
  flashgrid: `${[3, 9.5, 16].flatMap((y) => [3, 9.5, 16].map((x) => `<rect x="${x}" y="${y}" width="5" height="5" rx="1" ${(x + y) % 13 === 0 || (x === 16 && y === 3) ? 'fill="currentColor"' : S}/>`)).join('')}`,
  chimp: `<rect x="2" y="2" width="9" height="9" rx="1.5" ${S}/><rect x="13" y="13" width="9" height="9" rx="1.5" fill="currentColor"/><text x="6.5" y="9.3" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">1</text>`,
  liar: `<text x="12" y="16" text-anchor="middle" font-size="10" font-weight="800" fill="var(--ink-blue)">RED</text>`,
  offcolour: `${[3, 9.5, 16].flatMap((y) => [3, 9.5, 16].map((x) => `<rect x="${x}" y="${y}" width="5" height="5" rx="1" fill="currentColor" opacity="${x === 9.5 && y === 9.5 ? 0.55 : 0.85}"/>`)).join('')}`,
  sums: `<text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">7×8</text>`,
  spin: `<path d="M3 3h5v5h5v5H3z" fill="currentColor"/><path d="M21 21h-5v-5h-5v-5h10z" ${S}/>`,
  pattern: `${[3, 9.5, 16].flatMap((y) => [3, 9.5, 16].map((x) => (x === 16 && y === 16 ? '' : `<rect x="${x}" y="${y}" width="5" height="5" rx="1" ${S}/>`))).join('')}<text x="18.5" y="21" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">?</text>`,
  oddone: `<circle cx="6" cy="7" r="3" ${S}/><circle cx="18" cy="7" r="3" ${S}/><circle cx="6" cy="18" r="3" ${S}/><rect x="15" y="15" width="6" height="6" rx="1" fill="currentColor"/>`,
  dont: `<circle cx="8" cy="12" r="5" ${S}/><rect x="15" y="7" width="7" height="10" rx="1.5" fill="var(--t-raw)"/>`,
  keys: `<rect x="2" y="7" width="20" height="11" rx="2" ${S}/><path d="M6 11h1M10 11h1M14 11h1M18 11h1M7 15h10" ${S}/>`,
};
export const testIcon = (id: string) => `<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] ?? ''}</svg>`;

export function testCards() {
  const ordered = FAMILIES.flatMap((f) => TESTS.filter((t) => t.family === f));
  return `<div class="cards">${ordered
    .map((t) => {
      const s = standing(t);
      return `<a class="card" href="#${t.id}">
        <span class="card-top"><span class="card-fam">${esc(t.family)}</span>${testIcon(t.id)}</span>
        <span class="card-name" style="${meltStyle(s?.cooked ?? 0)}">${esc(t.name)}</span>
        <span class="card-term">${esc(t.searchTerm)}</span>
        <span class="card-foot">${
          s ? `<span class="card-best">${esc(fmt(t, s.best))}</span>${chip(s.tier)}` : `<span class="card-len">${esc(t.length)}</span>`
        }</span>
      </a>`;
    })
    .join('')}</div>`;
}

export const FOOT = `<footer class="foot wrap"><p>Free and unlimited. Entertainment only, not an IQ test or a medical test.</p><p>Prototype. Placement uses modelled reference curves until a test has 30 real players on the same kind of device.</p></footer>`;

/** One deadpan line under the burner. Seeded by the day, so everyone sees the same one. */
const LINES = [
  'Time to crank the old rusty engine.',
  'You have outsourced your memory to a chatbot. Let us see what is left.',
  'No calculator. We cannot stop you, but we will know.',
  'Your brain, medium rare. Probably.',
  'Everyone is a genius until the screen goes bright.',
];
const lineOfTheDay = () => LINES[Math.floor(Date.now() / 864e5) % LINES.length]!;

export function homeHtml() {
  const played = Object.keys(store.doc.tests).length;
  const card = brainCard();
  const back = played
    ? `<p class="home-back">Welcome back${store.doc.name ? `, ${esc(store.doc.name)}` : ''}. ${played} of ${TESTS.length} tests played${
        card.overall != null && store.doc.name ? `, <b>${esc(pct(card.overall))} cooked</b> overall` : ''
      }.</p>`
    : '';
  return `
  <section class="hero">
    <canvas id="burner" aria-hidden="true"></canvas>
    <button class="hero-go" id="hero-go" aria-label="Start the reaction time test">
      <span class="hero-line">Has AI cooked<br>your brain?</span>
      <span class="hero-sub">Every answer is one prompt away. Memory, maths, attention: use them or lose them. Fifteen tests measure what is left.</span>
      <span class="hero-cta">Press anywhere to find out<kbd>Space</kbd></span>
    </button>
  </section>
  <section class="wrap home-intro">
    ${back}
    <p class="home-hook">Every round ends with one number: the share of players who beat you. That is how cooked you are.</p>
    <div class="ladder" aria-label="The doneness scale">${TIERS.map((t) => `<span style="--tier:var(--t-${t.id})">${esc(t.name)}</span>`).join('')}</div>
    <p class="home-line">${esc(lineOfTheDay())}</p>
  </section>
  <div class="wrap">${testCards()}</div>${FOOT}`;
}

export function testsHtml() {
  return `<div class="wrap page"><h1 class="page-h">Every test</h1><p class="page-sub">Play as often as you like. Every round ends with how you place against other players.</p>${testCards()}</div>${FOOT}`;
}

export function introHtml(t: CookedTest) {
  const s = standing(t);
  return `
  <section class="intro wrap">
    <p class="eyebrow">${testIcon(t.id)} ${esc(t.family)} · ${esc(t.searchTerm)}</p>
    <h1 class="intro-name" style="${meltStyle(s?.cooked ?? 0)}">${esc(t.name)}</h1>
    <p class="intro-how">${esc(t.howTo)}</p>
    <button class="btn primary big" id="start">Start<kbd>Space</kbd></button>
    ${
      s
        ? `<dl class="detail"><div><dt>Your best</dt><dd>${esc(fmt(t, s.best))}</dd></div><div><dt>Standing</dt><dd>${esc(pct(s.cooked))} cooked</dd></div><div><dt>Rounds</dt><dd>${s.rounds}</dd></div></dl>`
        : `<p class="intro-len">${esc(t.length)}. You see how you place the moment it ends.</p>`
    }
  </section>`;
}

/** The overall score: each family's average, averaged, so no family dominates. */
export function brainCard() {
  const families = FAMILIES.map((f) => {
    const scores = TESTS.filter((t) => t.family === f).flatMap((t) => {
      const s = standing(t);
      return s ? [s.cooked] : [];
    });
    return { family: f, cooked: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
  });
  const done = families.filter((f) => f.cooked != null);
  const overall = done.length === FAMILIES.length ? done.reduce((a, f) => a + f.cooked!, 0) / done.length : null;
  return { families, done: done.length, overall };
}

function dots(left: string, right: string) {
  return `<div class="tk-l"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;
}

export function youHtml(claim: string) {
  const name = store.doc.name;
  const card = brainCard();
  const unlocked = !!name && card.overall != null;
  const played = TESTS.flatMap((t) => {
    const s = standing(t);
    return s ? [{ t, s }] : [];
  });

  const ticket = `
    <div class="ticket" id="brain-card">
      ${dots('BRAIN CARD', name ? name.toUpperCase() : 'GUEST')}
      <div class="tk-rule"></div>
      ${card.families.map((f) => dots(f.family.toUpperCase(), f.cooked == null ? '--' : pct(f.cooked))).join('')}
      <div class="tk-rule"></div>
      ${dots('OVERALL', unlocked ? `${pct(card.overall!)} COOKED` : 'LOCKED')}
      ${unlocked ? dots('', tierFor(card.overall!).name.toUpperCase()) : ''}
    </div>`;

  const needs: string[] = [];
  if (card.done < FAMILIES.length) needs.push(`play ${FAMILIES.length - card.done} more ${FAMILIES.length - card.done === 1 ? 'family' : 'families'}`);
  if (!name) needs.push('claim a name');

  return `
  <div class="wrap page you">
    <div class="you-side">
      <h1 class="page-h">${name ? esc(name) : 'Guest'}</h1>
      <p class="page-sub">${
        name
          ? store.shared
            ? 'Your stats follow you to any device.'
            : 'Your name is saved on this device.'
          : 'You can play everything as a guest. Your stats stay in this browser.'
      }</p>
      ${ticket}
      ${needs.length ? `<p class="you-need">To unlock your overall score and your <a href="#join">Certificate of Doneness</a>, ${esc(needs.join(' and '))}.</p>` : `<p class="you-need"><a href="#join">Your Certificate of Doneness</a> is signed.</p>`}
    </div>
    <div class="you-main">
      ${claim}
      ${
        played.length
          ? `<table class="stat tall"><thead><tr><th scope="col">Test</th><th scope="col">Best</th><th scope="col">Standing</th><th scope="col">Rounds</th></tr></thead><tbody>${played
              .map(
                ({ t, s }) =>
                  `<tr><th scope="row"><a href="#${t.id}">${esc(t.name)}</a></th><td class="v">${esc(fmt(t, s.best))}</td><td>${chip(s.tier)} <span class="pct">${esc(pct(s.cooked))}</span></td><td class="v">${s.rounds}</td></tr>`,
              )
              .join('')}</tbody></table>`
          : `<div class="empty"><p>No rounds yet.</p><a class="btn primary" href="#flinch">Play your first test</a></div>`
      }
    </div>
  </div>${FOOT}`;
}

export interface BoardState {
  test: string;
  input: InputClass;
}

export function boardHtml(state: BoardState) {
  const t = testById(state.test) ?? TESTS[0]!;
  const key = keyFor(t.id, state.input);
  const { named, guests } = store.board(key, t.lowerIsBetter);
  const others = store.others(key);

  const rows = named
    .map((r, i) => {
      const p = place(t, state.input, r.row.best, others);
      const me = r.id === 'me';
      return `<tr class="${me ? 'me' : ''}"><td class="v">${i + 1}</td><th scope="row">${esc(r.name ?? '')}${me ? ' <small>you</small>' : ''}</th><td class="v">${esc(fmt(t, r.row.best))}</td><td>${chip(p.tier)}</td></tr>`;
    })
    .join('');

  const note = store.shared
    ? `${guests ? `${guests} ${guests === 1 ? 'guest has' : 'guests have'} played this on ${state.input === 'touch' ? 'a touchscreen' : `a ${state.input}`} without a name.` : ''}`
    : 'Scores from other players appear here when the shared board is connected.';

  return `
  <div class="wrap page">
    <h1 class="page-h">The board</h1>
    <p class="page-sub">Best score per named player, on the same kind of device. Guests count towards placement but need a name to appear here.</p>
    <div class="chips" role="group" aria-label="Test">${TESTS.map(
      (x) => `<button class="f-chip${x.id === t.id ? ' on' : ''}" data-test="${x.id}">${esc(x.name)}</button>`,
    ).join('')}</div>
    <div class="chips" role="group" aria-label="Device">${INPUTS.map(
      (i) => `<button class="f-chip${i === state.input ? ' on' : ''}" data-input="${i}">${INPUT_LABEL[i]}</button>`,
    ).join('')}</div>
    ${
      rows
        ? `<table class="stat tall board"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Best</th><th scope="col">Tier</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="empty"><p>No named players on ${esc(t.name)} with this device yet.</p><a class="btn primary" href="#${t.id}">Play ${esc(t.name)}</a></div>`
    }
    <p class="basis">${esc(note)}</p>
  </div>${FOOT}`;
}

export function claimHtml(context: 'result' | 'you', beaten?: number) {
  const name = store.doc.name;
  if (name) return '';
  const hook =
    context === 'result' && beaten != null && beaten >= 50
      ? `You beat ${pct(beaten)} of players. Put your name on it.`
      : 'Keep your stats. Pick a name.';
  return `
  <aside class="panel claim">
    <h2>${esc(hook)}</h2>
    <p>You are playing as a guest, and that is fine. A name adds:</p>
    <ul>
      <li>Your place on the board for every test</li>
      <li>Your stats on any device</li>
      <li>Your Brain Card, overall score and a Certificate of Doneness</li>
    </ul>
    <form id="claim-form" novalidate>
      <label for="claim-name">Pick a name</label>
      <div class="claim-row">
        <input id="claim-name" name="name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="3 to 16 letters or numbers" aria-describedby="claim-err">
        <button class="btn primary" type="submit">Claim it</button>
      </div>
      <p class="claim-err" id="claim-err" role="alert"></p>
    </form>
    <p class="claim-fine">No email or password yet. Your name is the whole sign-up.${context === 'result' ? ' <a href="#join">See the certificate</a>' : ''}</p>
  </aside>`;
}

const CERT_LINES: Record<string, string> = {
  raw: 'has a brain that nothing has touched. Not even the internet.',
  rare: 'is still pink in the middle. The chef is impressed.',
  mrare: 'is cooked exactly the way the chef likes it.',
  medium: 'is neither raw nor ruined. A perfectly ordinary brain, and proud of it.',
  well: 'has been on the heat a while. Firm. A little dry. Still serviceable.',
  cooked: 'has been thoroughly cooked by the internet and is hereby excused from mental arithmetic.',
  burnt: 'has been left on the stove. We have called the fire brigade.',
};

/** The Certificate of Doneness: the one piece of paper on the site. */
export function certificateHtml(name: string | null, overall: number | null, done: number) {
  const unlocked = !!name && overall != null;
  const tier = unlocked ? tierFor(overall!) : null;
  const holder = name ? name.toUpperCase() : 'A GUEST';
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = tier
    ? `${esc(holder)} ${esc(CERT_LINES[tier.id]!)}`
    : `${esc(holder)} has not yet been fully assessed. ${!name ? 'A name' : `${FAMILIES.length - done} more ${FAMILIES.length - done === 1 ? 'family' : 'families'}`} required before the chef will sign.`;
  return `
  <div class="cert ${unlocked ? '' : 'locked'}" id="cert" style="--tier:var(--t-${tier?.id ?? 'burnt'})">
    <p class="cert-top">CookedBrain · Department of Doneness</p>
    <h2 class="cert-h">Certificate<br>of Doneness</h2>
    <p class="cert-body">This certifies that<br><b>${body}</b></p>
    <p class="cert-grade">${tier ? `${esc(pct(overall!))} cooked · ${esc(tier.name)}` : 'Grade pending'}</p>
    <div class="cert-foot"><span>${esc(day)}</span><span class="cert-sign">The Chef</span></div>
    <span class="cert-stamp">${tier ? esc(tier.name) : 'Unsigned'}</span>
  </div>`;
}

export function joinHtml(claim: string) {
  const name = store.doc.name;
  const card = brainCard();
  return `
  <div class="wrap page you">
    <div class="you-side">
      <h1 class="page-h">${name ? 'Signed up' : 'Sign up'}</h1>
      <p class="page-sub">${
        name
          ? `You are ${esc(name)}. That is the whole account for now: no password, no email, nothing to forget.`
          : 'Play everything as a guest. When you want your stats to stick, pick a name. It takes four seconds and no email.'
      }</p>
      ${certificateHtml(name, card.overall, card.done)}
      <p class="you-need">The certificate is signed once you have played every family and claimed a name. It is not legally binding, medically meaningful or in any way a measure of intelligence. It is a piece of paper from a kitchen.</p>
    </div>
    <div class="you-main">
      ${claim || `<div class="panel"><h2>Welcome back, ${esc(name!)}.</h2><p>Your scores, board place and certificate are tied to this name. Real accounts with a password arrive with cookedbrain.com.</p><div class="res-actions"><a class="btn primary" href="#you">Your stats</a><a class="btn" href="#board">The board</a></div></div>`}
    </div>
  </div>${FOOT}`;
}
