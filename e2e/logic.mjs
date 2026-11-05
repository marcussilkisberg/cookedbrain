import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/usr/lib/node_modules/');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const h = readFileSync('dist/index.html', 'utf8');
writeFileSync('dist/local.html', `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${h}</body></html>`);
const URL = `file://${process.cwd()}/dist/local.html`;
const browser = await chromium.launch();
const errs = [];
for (const [label, opt] of [['d', { viewport: { width: 1280, height: 800 } }], ['m', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext(opt); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(label + ' ' + e));
  await page.goto(URL + '#join'); await page.waitForSelector('.cert'); await page.waitForTimeout(300);
  await page.screenshot({ path: `e2e/out/${label}-join.png`, fullPage: true });
  for (const id of ['pattern', 'oddone', 'dont']) {
    await page.evaluate((x) => { location.hash = x; }, id); await page.waitForSelector('#start');
    await page.evaluate(() => document.querySelector('#start').click()); await page.waitForSelector('#round:not([hidden])');
    await page.waitForTimeout(id === 'dont' ? 500 : 1400);
    await page.screenshot({ path: `e2e/out/${label}-play-${id}.png` });
    await page.keyboard.press('Escape');
  }
  if (label === 'd') {
    // Play pattern by solving it from the DOM, then claim a name and view the certificate.
    await page.evaluate(() => { location.hash = 'pattern'; }); await page.waitForSelector('#start'); await page.keyboard.press('Space');
    await page.waitForSelector('.ps-grid'); 
    for (;;) {
      const r = await page.evaluate(() => {
        const g = document.querySelector('.ps-grid'); if (!g) return null;
        const cells = [...g.querySelectorAll('.ps-cell')].map((c) => c.innerHTML);
        // The answer is the option matching the hidden rule; brute force: pick the option whose svg equals what cell(2,2) would be = cell(2,0) shifted... just try answer by comparing with row pattern: option equal to the cell that repeats; fallback option 0.
        const opts = [...document.querySelectorAll('.ps-opts .opt')].map((o) => o.querySelector('svg').outerHTML);
        // Diagonal rule: in this generator cell(r,c) depends on r+c for shape/fill and c for count, so cell(2,2) shares shape/fill with (1,3)? not available; use (0,4)? Not; approximate with majority vote not possible. Press 1.
        return 0;
      });
      if (r == null) break;
      await page.keyboard.press('1'); await page.waitForTimeout(700);
    }
    await page.waitForSelector('.res'); await page.waitForTimeout(300);
    console.log('pattern result:', await page.evaluate(() => document.querySelector('.res-cooked').innerText.replace(/\n/g,' ')));
    await page.fill('#claim-name', 'Marcus'); await page.evaluate(() => document.querySelector('#claim-form').requestSubmit());
    await page.waitForSelector('.claim.claimed'); await page.screenshot({ path: 'e2e/out/d-claimed.png', fullPage: true });
    await page.evaluate(() => { location.hash = 'join'; }); await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/out/d-join-named.png', fullPage: true });
    console.log('nav:', await page.evaluate(() => [...document.querySelectorAll('.top nav a')].filter(a=>!a.hidden).map(a=>a.textContent).join('|')));
  }
  await ctx.close();
}
console.log('errors', errs.length ? errs : 'none');
await browser.close();
