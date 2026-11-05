// Drives every test in a real browser with real input events.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/usr/lib/node_modules/');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const which = (process.argv[2] ?? 'short').split(',');
const OUT = process.argv[3] ?? 'e2e/out';
mkdirSync(OUT, { recursive: true });

const page_html = readFileSync('dist/index.html', 'utf8');
writeFileSync('dist/local.html', `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style></head><body>${page_html}</body></html>`);
const URL = `file://${process.cwd()}/dist/local.html`;

const click = async (page, x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); };
const clickEl = async (page, h) => { const b = await h.boundingBox(); await click(page, b.x + b.width / 2, b.y + b.height / 2); };

const drivers = {
  async flinch(page) {
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('.fl.go', { timeout: 8000 });
      await page.waitForTimeout(170 + i * 12);
      await page.mouse.down(); await page.mouse.up();
      await page.waitForSelector('.fl.hit', { timeout: 3000 });
    }
  },
  async snipe(page) {
    for (let i = 0; i < 16; i++) {
      const b = await page.locator('.sn-target').boundingBox();
      await click(page, b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(15);
    }
  },
  async deadstop(page) {
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('.ds-msg:has-text("Press to start")');
      await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.up();
      const tg = +(await page.textContent('.ds-target b')) * 1000; await page.waitForTimeout(tg - 120 + i * 60);
      await page.mouse.down(); await page.mouse.up();
      await page.waitForSelector('.ds-msg:has-text(" by ")');
    }
  },
  async echo(page) {
    await page.evaluate(() => {
      window.__seq = [];
      new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('lit') && !m.oldValue?.includes('lit')) window.__seq.push(+m.target.dataset.i); })
        .observe(document.querySelector('#arena'), { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
    for (let len = 3; len <= 5; len++) {
      await page.evaluate(() => (window.__seq = []));
      await page.waitForFunction((n) => window.__seq.length === n && document.querySelector('.under').textContent === 'Your turn', len, { timeout: 15000 });
      const seq = await page.evaluate(() => window.__seq);
      for (const i of seq) await clickEl(page, page.locator(`.tile[data-i="${i}"]`));
      await page.waitForFunction(() => document.querySelector('.under').textContent !== 'Your turn', null, { timeout: 3000 });
    }
    await page.evaluate(() => (window.__seq = []));
    await page.waitForFunction(() => document.querySelector('.under').textContent === 'Your turn', null, { timeout: 15000 });
    const seq = await page.evaluate(() => window.__seq);
    await clickEl(page, page.locator(`.tile[data-i="${(seq[0] + 1) % 9}"]`));
  },
  async digits(page) {
    for (let len = 3; len <= 5; len++) {
      await page.waitForFunction((n) => document.querySelector('.dg-num')?.textContent.length === n && !document.querySelector('.pad'), len);
      const n = await page.textContent('.dg-num');
      await page.waitForSelector('.pad', { timeout: 6000 });
      await page.keyboard.type(n);
      await page.waitForSelector('.dg-num.clean');
    }
    await page.waitForFunction(() => document.querySelector('.dg-num')?.textContent.length === 6 && !document.querySelector('.pad'));
    await page.waitForSelector('.pad', { timeout: 8000 });
    for (const d of '000000') { const k = page.locator(`.key[data-k="${d}"]`); await clickEl(page, k); }
    await page.waitForSelector('.dg-num.miss');
  },
  async flashgrid(page) {
    for (let lv = 1; lv <= 3; lv++) {
      await page.waitForSelector('.tile.lit', { timeout: 4000 });
      const idx = await page.$$eval('.tile.lit', (e) => e.map((x) => x.dataset.i));
      await page.waitForFunction(() => !document.querySelector('.tile.lit') && !document.querySelector('#arena.locked'), null, { timeout: 4000 });
      for (const i of idx) await clickEl(page, page.locator(`.tile[data-i="${i}"]`));
      await page.waitForTimeout(350);
    }
    for (let life = 0; life < 3; life++) {
      await page.waitForSelector('.tile.lit', { timeout: 4000 });
      const lit = await page.$$eval('.tile.lit', (e) => e.map((x) => +x.dataset.i));
      await page.waitForFunction(() => !document.querySelector('.tile.lit') && !document.querySelector('#arena.locked'), null, { timeout: 5000 });
      const n = await page.locator('.tile').count();
      const wrong = [...Array(n).keys()].filter((i) => !lit.includes(i)).slice(0, 3);
      for (const i of wrong) await clickEl(page, page.locator(`.tile[data-i="${i}"]`));
      await page.waitForTimeout(900);
    }
  },
  async chimp(page) {
    for (let count = 4; count <= 6; count++) {
      await page.waitForFunction((c) => document.querySelectorAll('.num').length === c, count);
      for (let n = 1; n <= count; n++) await clickEl(page, page.locator(`.num[data-n="${n}"]`));
      await page.waitForTimeout(260);
    }
    for (let s = 0; s < 3; s++) {
      await page.waitForFunction(() => document.querySelectorAll('.num').length >= 4);
      await clickEl(page, page.locator('.num[data-n="2"]'));
      await page.waitForTimeout(1000);
    }
  },
  async liar(page) {
    const inks = { 'rgb(238, 75, 63)': 'r', 'rgb(90, 140, 255)': 'b', 'rgb(60, 194, 110)': 'g', 'rgb(243, 200, 53)': 'y' };
    await page.waitForSelector('.lr-word');
    for (;;) {
      const c = await page.evaluate(() => { const w = document.querySelector('.lr-word'); return w ? getComputedStyle(w).color : null; });
      if (!c) break;
      await page.keyboard.press(inks[c]);
      await page.waitForTimeout(350);
    }
  },
  async offcolour(page) {
    await page.waitForSelector('.oc');
    let wrongDone = false;
    for (;;) {
      const r = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.oc .tile')].filter((x) => x.style.visibility !== 'hidden');
        if (!t.length) return null;
        const c = t.map((x) => x.style.background);
        const odd = t.find((x, i) => c.filter((v) => v === c[i]).length === 1);
        const other = t.find((x) => x !== odd);
        const b = (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
        return { odd: b(odd), other: b(other) };
      });
      if (!r) break;
      if (!wrongDone) { wrongDone = true; await click(page, ...r.other); await page.waitForTimeout(50); continue; }
      await click(page, ...r.odd);
      await page.waitForTimeout(280);
    }
  },
  async sums(page) {
    await page.waitForSelector('.sm-q');
    for (;;) {
      const q = await page.evaluate(() => document.querySelector('.sm-q')?.textContent ?? null);
      if (!q) break;
      const [a, op, b] = q.split(' ');
      const v = op === '+' ? +a + +b : op === '×' ? +a * +b : +a - +b;
      await page.keyboard.type(String(v), { delay: 20 });
      await page.waitForTimeout(450);
    }
  },
  async spin(page) {
    await page.waitForSelector('.sp-pair');
    let i = 0;
    for (;;) {
      if (!(await page.$('.sp-pair'))) break;
      await page.keyboard.press(i++ % 2 ? 'f' : 'j');
      await page.waitForTimeout(600);
    }
  },
  async keys(page) {
    await page.waitForSelector('.ky-words');
    for (;;) {
      const w = await page.evaluate(() => document.querySelector('.ky-words .cur')?.textContent ?? null);
      if (!w) break;
      await page.keyboard.type(w + ' ', { delay: 12 });
      await page.waitForTimeout(60);
    }
  },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForSelector('.hero-go');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/home.png` });

const list = which[0] === 'all' ? Object.keys(drivers) : which[0] === 'short' ? ['flinch', 'snipe', 'echo', 'digits', 'flashgrid', 'chimp'] : which;
for (const id of list) {
  await page.evaluate((h) => { location.hash = h; }, id);
  await page.waitForSelector('#start');
  if (id === list[0]) await page.screenshot({ path: `${OUT}/intro-${id}.png` });
  await page.keyboard.press('Space');
  await page.waitForSelector('#round:not([hidden])');
  const started = Date.now();
  try {
    await drivers[id](page);
    await page.waitForSelector('.res', { timeout: 40000 });
  } catch (e) {
    await page.screenshot({ path: `${OUT}/fail-${id}.png` });
    console.log('FAIL', id, String(e).slice(0, 200));
    await page.keyboard.press('Escape');
    continue;
  }
  await page.waitForTimeout(450);
  const r = await page.evaluate(() => ({
    num: document.querySelector('.res-num')?.childNodes[0]?.textContent,
    cooked: document.querySelector('.res-cooked')?.innerText.replace(/\n/g, ' '),
    beat: document.querySelector('.res-beat')?.textContent,
    line: document.querySelector('.res-line')?.textContent,
    basis: document.querySelector('.basis')?.textContent.slice(0, 60),
    rows: [...document.querySelectorAll('.stat tr')].map((t) => t.innerText.replace(/\s+/g, ' ')).join(' | '),
  }));
  console.log(id, `${((Date.now() - started) / 1000).toFixed(1)}s`, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/res-${id}.png`, fullPage: true });
}

// Retry speed: key press to a running round.
await page.evaluate((h) => { location.hash = h; }, 'flinch');
await page.waitForSelector('#start');
await page.keyboard.press('Space');
await drivers.flinch(page);
await page.waitForSelector('.res');
await page.waitForTimeout(400);
const retry = await page.evaluate(() => new Promise((res) => {
  let t0 = 0;
  addEventListener('keydown', () => { t0 = performance.now(); }, { capture: true, once: true });
  new MutationObserver((_, o) => { if (document.querySelector('.fl')) { o.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); } })
    .observe(document.querySelector('#arena'), { childList: true });
  setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })), 10);
}));
console.log('retry to painted round, ms:', Math.round(retry));
await page.keyboard.press('Escape');

for (const h of ['tests', 'board', 'you']) {
  await page.evaluate((x) => { location.hash = x; }, h);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${h}.png`, fullPage: true });
}
console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
