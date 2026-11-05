import type { CookedTest, InputClass, TestResult } from '../core/types';
import { newSeed } from '../core/rng';
import { Aborted, Stage } from '../core/stage';
import { sound } from '../core/audio';
import { place } from '../core/stats';
import { store, validName } from '../core/store';
import { TESTS, testById } from '../tests';
import { $, readPref, writePref } from './dom';
import { Burner } from './heat';
import { embers } from './embers';
import { resultsHtml, shareText, usualPlacement, type Outcome } from './results';
import { boardHtml, claimHtml, homeHtml, introHtml, joinHtml, testsHtml, youHtml, type BoardState } from './views';

const view = $('#view');
const roundEl = $('#round');
const arena = $('#arena');
const hudName = $('#hud-name');
const hudStatus = $('#hud-status');
const hudBar = $('#hud-bar');
const sparks = $<HTMLCanvasElement>('#sparks');
const soundBtn = $('#snd');
const navYou = $('#nav-you');
const navJoin = $('#nav-join');
const navBoard = $('#nav-board');

let stage: Stage | null = null;
let burner: Burner | null = null;
/** The test whose results are on screen, for the keyboard shortcuts. */
let showing: CookedTest | null = null;
let shownAt = 0;
let snoozed = false;

const SOUND_KEY = 'cookedbrain.sound';
sound.on = readPref(SOUND_KEY) !== 'off';

const board: BoardState = {
  test: 'flinch',
  input: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
};

function setSoundLabel() {
  soundBtn.textContent = sound.on ? 'Sound on' : 'Sound off';
  soundBtn.setAttribute('aria-pressed', String(sound.on));
}

function setNav(route: string) {
  navYou.textContent = store.doc.name ?? 'Guest';
  navJoin.hidden = !!store.doc.name;
  // The board only makes sense once scores are shared between players.
  navBoard.hidden = !store.shared;
  document.querySelectorAll<HTMLAnchorElement>('.top nav a').forEach((a) => {
    a.classList.toggle('on', a.getAttribute('href') === `#${route}`);
  });
}

function stopHeat() {
  burner?.stop();
  burner = null;
}

function currentRoute() {
  return decodeURIComponent(location.hash.replace(/^#/, ''));
}

function route() {
  if (stage) quit();
  showing = null;
  stopHeat();
  const r = currentRoute();
  setNav(r);
  scrollTo(0, 0);

  const test = testById(r);
  if (test) {
    view.innerHTML = introHtml(test);
    $('#start').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      void play(test);
    });
    $('#start').addEventListener('click', () => void play(test));
    return;
  }
  if (r === 'tests') view.innerHTML = testsHtml();
  else if (r === 'board') void showBoard();
  else if (r === 'you') view.innerHTML = youHtml(claimHtml('you'));
  else if (r === 'join') view.innerHTML = joinHtml(claimHtml('you'));
  else {
    view.innerHTML = homeHtml();
    const c = $<HTMLCanvasElement>('#burner');
    burner = new Burner(c);
    if (burner.works) burner.start();
    else c.classList.add('no-gl');
    const flinch = testById('flinch')!;
    $('#hero-go').addEventListener('click', () => void play(flinch));
  }
}

async function showBoard() {
  const html = await boardHtml(board);
  if (currentRoute() === 'board') view.innerHTML = html;
}

function quit() {
  const s = stage;
  stage = null;
  s?.dispose();
  roundEl.hidden = true;
  arena.innerHTML = '';
  arena.className = '';
}

async function countIn(s: Stage) {
  for (const n of ['3', '2', '1']) {
    s.html(`<div class="count">${n}</div>`);
    s.sound.tick();
    await s.wait(550);
  }
  s.html(`<div class="count go">Go</div>`);
  s.sound.good();
  await s.wait(350);
}

/** A challenge in progress: the seed to replay and the score to beat. */
let challenge: { test: CookedTest; seed: string; score: number; name: string | null; input: InputClass } | null = null;

async function play(test: CookedTest) {
  if (stage) return;
  sound.unlock();
  showing = null;
  stopHeat();
  const ch = challenge && challenge.test === test ? challenge : null;
  challenge = null;

  hudName.textContent = test.name;
  hudStatus.textContent = '';
  arena.innerHTML = '';
  arena.className = '';
  roundEl.hidden = false;
  document.body.classList.add('in-round');

  const s = new Stage(arena, roundEl, hudStatus, hudBar);
  stage = s;
  const seed = ch ? ch.seed : await store.seed(test, newSeed);
  if (stage !== s) return;
  const content = test.generate(seed);

  let result: TestResult | null = null;
  let trials: unknown[] = [];
  let input: InputClass = 'mouse';
  let hidden = false;
  try {
    if (test.countIn) await countIn(s);
    trials = await test.run(content, s);
    result = test.score(trials);
    input = s.inputClass;
    hidden = s.wasHidden;
  } catch (e) {
    if (!(e instanceof Aborted)) throw e;
  }

  document.body.classList.remove('in-round');
  if (stage !== s) return; // Left mid-round: the route has already been drawn.
  quit();

  if (!result) {
    route();
    return;
  }
  await showResults(test, result, input, hidden, seed, trials, ch);
}

function notScored(test: CookedTest, reason: string) {
  showing = test;
  shownAt = performance.now();
  view.innerHTML = `<section class="wrap page"><h1 class="page-h">Not scored</h1><p class="page-sub">${reason}</p><p><button class="btn primary" id="again">Again<kbd>Space</kbd></button></p></section>`;
  $('#again').addEventListener('click', () => void play(test));
}

async function showResults(
  test: CookedTest,
  local: TestResult,
  input: InputClass,
  hidden: boolean,
  seed: string,
  trials: unknown[],
  ch: typeof challenge,
) {
  scrollTo(0, 0);
  if (hidden) return notScored(test, 'The tab was hidden during that round, so its timing cannot be trusted.');
  if (!local.valid) return notScored(test, 'There were too few answers to score that round.');

  view.innerHTML = `<section class="wrap page"><p class="page-sub">Scoring…</p></section>`;
  const rec = await store.record(test, input, seed, trials, local, hidden);
  if (rec.rejected) return notScored(test, `That round was not accepted: ${rec.rejected}.`);
  const { before, row, isBest, result, others } = rec;
  const placement = place(test, input, result.score, others);
  const orderNo = Object.values(store.doc.tests).reduce((n, r) => n + r.rounds, 0);

  const outcome: Outcome = {
    test,
    result,
    input,
    placement,
    before,
    row,
    isBest,
    usual: usualPlacement(test, input, row, others),
    orderNo,
    when: new Date(),
    verified: rec.verified,
    challenge: rec.challenge,
    versus: ch ? { score: ch.score, name: ch.name } : null,
  };
  renderResults(outcome);

  const firstBest = isBest && !!before;
  if (firstBest) {
    sound.bell();
    embers(sparks, 90);
  } else if (placement.tier.id === 'raw' || placement.tier.id === 'rare') {
    embers(sparks, 40);
  } else if (placement.tier.id === 'burnt') {
    sound.sizzle();
  }
}

function renderResults(o: Outcome) {
  showing = o.test;
  shownAt = performance.now();
  view.innerHTML = resultsHtml(o, snoozed ? '' : claimHtml('result', o.placement.beaten));
  $('#again').addEventListener('click', () => void play(o.test));
  $('#next').addEventListener('click', () => nextTest(o.test));
  $('#copy').addEventListener('click', () => void copyResult(o));
  $('#share')?.addEventListener('click', () => void copyLink(o));
}

async function copyLink(o: Outcome) {
  const btn = $('#share');
  const url = `${location.origin}/c/${o.challenge}`;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Link copied';
  } catch {
    btn.textContent = url;
    btn.classList.add('as-text');
  }
}

async function copyResult(o: Outcome) {
  const btn = $('#copy');
  try {
    await navigator.clipboard.writeText(shareText(o));
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = shareText(o);
    btn.classList.add('as-text');
  }
}

function nextTest(t: CookedTest) {
  const i = TESTS.indexOf(t);
  location.hash = `#${TESTS[(i + 1) % TESTS.length]!.id}`;
}

/* Delegated, so re-rendered views need no rewiring. */
view.addEventListener('click', (e) => {
  const el = e.target as HTMLElement;
  const f = el.closest<HTMLElement>('[data-test],[data-input]');
  if (f) {
    if (f.dataset['test']) board.test = f.dataset['test'];
    if (f.dataset['input']) board.input = f.dataset['input'] as InputClass;
    void showBoard();
  }
});

view.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (form.id === 'email-form') return void startSignIn(form);
  if (form.id !== 'claim-form') return;
  void (async () => {
    const input = $<HTMLInputElement>('#claim-name');
    const err = $('#claim-err');
    const name = input.value.trim();
    if (!validName(name)) {
      err.textContent = 'Use 3 to 16 letters, numbers, dashes or underscores.';
      input.focus();
      return;
    }
    const problem = await store.claim(name);
    if (problem) {
      err.textContent = problem;
      input.focus();
      return;
    }
    setNav(currentRoute());
    const box = $('.claim');
    if (box) {
      box.classList.add('claimed');
      box.innerHTML = `<h2>You are on the board, ${name}.</h2><p>${
        store.shared ? 'Your stats now follow you to any device once you add an email.' : 'Your name is saved on this device.'
      }</p><div class="res-actions"><a class="btn primary" href="#join">Your certificate</a><a class="btn" href="#board">See the board</a></div>`;
    }
  })();
});

async function startSignIn(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('input[type=email]')!;
  const err = form.querySelector<HTMLElement>('.claim-err')!;
  const email = input.value.trim();
  const problem = await store.startSignIn(email);
  if (problem) {
    err.textContent = problem;
    return;
  }
  form.innerHTML = `<p class="sent">Sent. Open the link in the email to ${email.replace(/</g, '')} and you are in. It works once and expires in 20 minutes.</p>`;
}

view.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id === 'signout') void store.signOut().then(() => route());
});

soundBtn.addEventListener('click', () => {
  sound.on = !sound.on;
  writePref(SOUND_KEY, sound.on ? 'on' : 'off');
  setSoundLabel();
});

$('#hud-quit').addEventListener('click', () => {
  document.body.classList.remove('in-round');
  quit();
  route();
});

window.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement;
  if (e.key === 'Escape' && stage) {
    e.preventDefault();
    document.body.classList.remove('in-round');
    quit();
    route();
    return;
  }
  if (stage || typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;

  const go = e.key === ' ' || e.key === 'Enter';
  if (showing) {
    // A short guard, so a late press from the round cannot start another.
    if (performance.now() - shownAt < 280) return;
    if (go) {
      e.preventDefault();
      void play(showing);
    } else if (e.key.toLowerCase() === 'n') nextTest(showing);
    return;
  }
  if (!go) return;
  const t = testById(currentRoute());
  if (t) {
    e.preventDefault();
    void play(t);
  } else if (currentRoute() === '' || currentRoute() === 'home') {
    e.preventDefault();
    void play(testById('flinch')!);
  }
});

window.addEventListener('hashchange', route);

store.subscribe(() => {
  if (stage) return;
  setNav(currentRoute());
  const r = currentRoute();
  const typing = document.activeElement instanceof HTMLInputElement;
  if (typing) return;
  if (r === 'board') void showBoard();
  else if (r === 'you') view.innerHTML = youHtml(claimHtml('you'));
  else if (r === 'join') view.innerHTML = joinHtml(claimHtml('you'));
});

/** /c/<seed> opens a challenge: same test, same seed, a score to beat. */
async function openChallenge(pub: string) {
  history.replaceState(null, '', '/');
  const c = await store.challenge(pub);
  const test = c && testById(c.test);
  if (!c || !test) {
    view.innerHTML = `<section class="wrap page"><h1 class="page-h">No such order</h1><p class="page-sub">That challenge link has gone cold.</p><p><a class="btn primary" href="#home">Back to the kitchen</a></p></section>`;
    return;
  }
  challenge = { test, seed: c.seed, score: c.score, name: c.name, input: c.input };
  view.innerHTML = `<section class="intro wrap">
    <p class="eyebrow">Challenge · ${test.name}</p>
    <h1 class="intro-name">Beat ${c.name ? c.name : 'them'}</h1>
    <p class="intro-how">${c.name ?? 'Someone'} scored <b>${test.format(c.score)} ${test.unit}</b> on ${test.name}. Same seed, same test. ${test.howTo}</p>
    <button class="btn primary big" id="start">Take it on<kbd>Space</kbd></button>
  </section>`;
  $('#start').addEventListener('click', () => void play(test));
}

export function boot() {
  setSoundLabel();
  const m = location.pathname.match(/^\/c\/([^/]+)/);
  void store.connect().then(() => {
    if (m) void openChallenge(decodeURIComponent(m[1]!));
  });
  if (!m) route();
}
