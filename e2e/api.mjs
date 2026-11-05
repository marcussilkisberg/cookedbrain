// Plays through the live API with a browser: seeds, server scoring, names, board, challenge, cheats.
import { createRequire } from 'node:module';
let chromium; try { ({ chromium } = createRequire('/usr/lib/node_modules/')('playwright')); } catch { ({ chromium } = await import('playwright')); }
const BASE = 'http://localhost:8787';
const browser = await chromium.launch();
const errs = [];
const N = Date.now().toString(36).slice(-4);
const A_NAME = 'Marcus' + N, B_NAME = 'Nora' + N;

async function flinchRound(page, delay) {
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.fl.go', { timeout: 10000 });
    await page.waitForTimeout(delay + i * 7);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForSelector('.fl.hit', { timeout: 3000 });
  }
  await page.waitForSelector('.res', { timeout: 15000 });
  await page.waitForTimeout(450);
  return page.evaluate(() => ({
    num: document.querySelector('.res-num').childNodes[0].textContent,
    cooked: document.querySelector('.res-cooked').innerText.replace(/\n/g, ' '),
    basis: document.querySelector('.basis').textContent,
    line: document.querySelector('.res-line').textContent,
    share: !!document.querySelector('#share'),
  }));
}

// Player A: two rounds, claims a name, copies a challenge link.
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const a = await ctxA.newPage();
a.on('pageerror', (e) => errs.push('A ' + e));
await a.goto(BASE + '/#flinch'); await a.waitForSelector('#start'); await a.keyboard.press('Space');
console.log('A round 1', JSON.stringify(await flinchRound(a, 180)));
await a.keyboard.press('Space');
console.log('A round 2', JSON.stringify(await flinchRound(a, 230)));
await a.fill('#claim-name', A_NAME); await a.evaluate(() => document.querySelector('#claim-form').requestSubmit());
await a.waitForSelector('.claim.claimed');
const link = await a.evaluate(() => `${location.origin}/c/${document.querySelector('#share') ? '' : ''}`);
const pub = await a.evaluate(async () => { const r = await fetch('/api/me'); return (await r.json()).name; });
console.log('A name on server:', pub);
// Get A's challenge seed from the results share button text by clicking it with clipboard denied -> falls back to text
await a.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('no')); });
await a.click('#share');
const challengeUrl = await a.textContent('#share');
console.log('challenge url:', challengeUrl);

// Player B: opens the challenge link, plays the same seed, slower.
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const b = await ctxB.newPage();
b.on('pageerror', (e) => errs.push('B ' + e));
await b.goto(challengeUrl);
await b.waitForSelector('#start');
console.log('B sees:', (await b.textContent('.intro-how')).slice(0, 90));
const og = await b.evaluate(() => document.querySelector('meta[property="og:title"]').content);
console.log('B og:title:', og);
await b.evaluate(() => document.querySelector('#start').click());
for (let i = 0; i < 5; i++) {
  await b.waitForSelector('.fl.go', { timeout: 10000 }); await b.waitForTimeout(300); await b.touchscreen.tap(195, 420); await b.waitForSelector('.fl.hit');
}
await b.waitForSelector('.res'); await b.waitForTimeout(200);
console.log('B result line:', await b.textContent('.res-line'), '|', await b.textContent('.res-beat'));

// Name collision: B tries Marcus.
await b.fill('#claim-name', A_NAME.toLowerCase()); await b.evaluate(() => document.querySelector('#claim-form').requestSubmit());
await b.waitForTimeout(400);
console.log('B claim collision:', await b.textContent('#claim-err'));
await b.fill('#claim-name', B_NAME); await b.evaluate(() => document.querySelector('#claim-form').requestSubmit());
await b.waitForSelector('.claim.claimed');

// Board shows both, per device class.
await a.evaluate(() => { location.hash = 'board'; }); await a.waitForTimeout(600);
console.log('board mouse rows:', await a.evaluate(() => [...document.querySelectorAll('.board tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).join(' | ')));
await a.evaluate(() => document.querySelector('[data-input="touch"]').click()); await a.waitForTimeout(600);
console.log('board touch rows:', await a.evaluate(() => [...document.querySelectorAll('.board tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).join(' | ')));

// Cheating: a forged score, a reused seed, an impossible reaction.
const cheat = await a.evaluate(async () => {
  const out = {};
  const seed = (await (await fetch('/api/seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: 'flinch' }) })).json()).seed;
  const post = (body) => fetch('/api/round', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => `${r.status} ${(await r.json()).error ?? 'ok'}`);
  out.forgedScore = await post({ test: 'flinch', version: 1, input: 'mouse', seed, trials: [{ rt: 1 }, { rt: 1 }, { rt: 1 }, { rt: 1 }, { rt: 1 }], score: 1 });
  const seed2 = (await (await fetch('/api/seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: 'flinch' }) })).json()).seed;
  out.first = await post({ test: 'flinch', version: 1, input: 'mouse', seed: seed2, trials: [{ rt: 200 }, { rt: 210 }, { rt: 220 }, { rt: 230 }, { rt: 240 }] });
  out.reused = await post({ test: 'flinch', version: 1, input: 'mouse', seed: seed2, trials: [{ rt: 200 }, { rt: 210 }, { rt: 220 }, { rt: 230 }, { rt: 240 }] });
  out.badSig = await post({ test: 'flinch', version: 1, input: 'mouse', seed: seed2.slice(0, -4) + 'xxxx', trials: [{ rt: 200 }, { rt: 210 }, { rt: 220 }, { rt: 230 }, { rt: 240 }] });
  out.localSeed = await post({ test: 'flinch', version: 1, input: 'mouse', seed: 'abc123', trials: [{ rt: 200 }, { rt: 210 }, { rt: 220 }, { rt: 230 }, { rt: 240 }] });
  return out;
});
console.log('cheats:', JSON.stringify(cheat));

// Magic link without Resend configured
console.log('email without key:', await a.evaluate(async () => (await (await fetch('/api/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'm@example.com' }) })).json()).error));
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
