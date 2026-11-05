// Mid-round looks on desktop and phone, plus the shared-score path against a fake host.
import { createRequire } from 'node:module';
const require = createRequire('/usr/lib/node_modules/');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const URL = `file://${process.cwd()}/dist/local.html`;
const OUT = 'e2e/out';
const ids = ['flinch','snipe','deadstop','echo','digits','flashgrid','chimp','liar','offcolour','sums','spin','keys'];
const browser = await chromium.launch();

const fakeHost = `
  (() => {
    const docs = new Map();
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 44; i++) {
      docs.set('p' + i, { name: i % 3 ? null : 'Player' + i, updated: 1, tests: {
        'flinch:touch': { best: 215 + i * 2, recent: [rnd(240, 400), rnd(240, 400), rnd(240, 400)], rounds: 3 },
        'chimp:touch': { best: 6 + (i % 7), recent: [5 + (i % 8)], rounds: 1 },
      } });
    }
    const writes = [];
    window.__writes = writes;
    const ref = (path) => ({
      async get() { const d = docs.get(path.split('/')[1]); return { exists: !!d, data: () => d }; },
      async set(d) { writes.push(path); docs.set(path.split('/')[1], d); },
    });
    const db = {
      doc: ref,
      collection: () => ({ limit: () => ({ onSnapshot(next) {
        setTimeout(() => next({ docs: [...docs.entries()].map(([id, d]) => ({ id, data: () => d })) }), 30);
        return () => {};
      } }) }),
    };
    const user = { id: async () => 'me-123', can: async () => true };
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : null) };
  })();`;

for (const [label, opt] of [
  ['d', { viewport: { width: 1280, height: 800 } }],
  ['m', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
]) {
  const ctx = await browser.newContext(opt);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector('.hero-go');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${label}-home.png` });
  for (const id of ids) {
    await page.evaluate((h) => { location.hash = h; }, id);
    await page.waitForSelector('#start');
    if (id === 'flinch' || id === 'keys') await page.screenshot({ path: `${OUT}/${label}-intro-${id}.png` });
    await page.evaluate(() => document.querySelector('#start').click());
    await page.waitForSelector('#round:not([hidden])');
    await page.waitForTimeout(['liar','offcolour','sums','spin'].includes(id) ? 1500 : id === 'flashgrid' ? 700 : id === 'echo' ? 650 : 350);
    await page.screenshot({ path: `${OUT}/${label}-play-${id}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(40);
  }
  console.log(label, 'errors', errs.length ? errs : 'none');
  await ctx.close();
}

// Phone, touch, against a host with 44 other players.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript(fakeHost);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(URL);
await page.waitForSelector('.hero-go');
await page.waitForTimeout(300);
await page.touchscreen.tap(195, 300);
for (let i = 0; i < 5; i++) {
  await page.waitForSelector('.fl.go', { timeout: 8000 });
  await page.waitForTimeout(190 + i * 15);
  await page.touchscreen.tap(195, 420);
  await page.waitForSelector('.fl.hit', { timeout: 3000 });
}
await page.waitForSelector('.res');
await page.waitForTimeout(500);
const info = await page.evaluate(() => ({
  cooked: document.querySelector('.res-cooked').innerText.replace(/\n/g, ' '),
  beat: document.querySelector('.res-beat').textContent,
  basis: document.querySelector('.basis').textContent,
  rows: [...document.querySelectorAll('.stat tr')].map((t) => t.innerText.replace(/\s+/g, ' ')).join(' | '),
  overflow: document.documentElement.scrollWidth > innerWidth,
  writes: window.__writes.length,
}));
console.log(JSON.stringify(info, null, 1));
console.log('wider than screen:', await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('#round')).slice(0, 8).map((e) => e.tagName + '.' + (e.getAttribute('class') ?? '') + ' ' + Math.round(e.getBoundingClientRect().right))));
console.log('layout width', await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth, document.body.scrollWidth]));
await page.screenshot({ path: `${OUT}/m-res-flinch.png`, fullPage: true });
await page.fill('#claim-name', 'Marcus');
await page.evaluate(() => document.querySelector('#claim-form').requestSubmit());
await page.waitForSelector('.claim.claimed');
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/m-claimed.png`, fullPage: true });
await page.evaluate(() => { location.hash = 'board'; });
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('[data-input="touch"]').click());
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/m-board.png`, fullPage: true });
console.log('board rows', await page.locator('.board tbody tr').count(), 'nav', await page.textContent('#nav-you'), 'writes', await page.evaluate(() => window.__writes.length));
console.log('errors', errs.length ? errs : 'none');
await browser.close();
