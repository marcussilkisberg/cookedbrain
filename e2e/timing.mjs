// Fires input at a known delay after the stimulus and compares what the engine reports.
import { createRequire } from 'node:module';
const require = createRequire('/usr/lib/node_modules/');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(`file://${process.cwd()}/dist/local.html#flinch`);
await page.waitForSelector('#start');
for (const delay of [150, 250, 400]) {
  await page.evaluate((h) => { location.hash = h; }, 'tests');
  await page.waitForSelector('.cards');
  await page.evaluate((h) => { location.hash = h; }, 'flinch');
  await page.waitForSelector('#start');
  await page.keyboard.press('Space');
  await page.evaluate((d) => {
    const seen = new WeakSet();
    window.__obs?.disconnect();
    window.__obs = new MutationObserver(() => {
      const el = document.querySelector('.fl.go');
      if (el && !seen.has(el)) {
        seen.add(el);
        const t0 = performance.now();
        const fire = () => { if (performance.now() - t0 < d) return setTimeout(fire, 0); document.querySelector('#arena').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); };
        setTimeout(fire, Math.max(0, d - 4));
      }
    });
    window.__obs.observe(document.querySelector('#arena'), { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  }, delay);
  await page.waitForSelector('.res', { timeout: 30000 });
  const got = await page.evaluate(() => +document.querySelector('.res-num').childNodes[0].textContent);
  console.log(`asked ${delay} ms, engine reported ${got} ms, difference ${got - delay} ms`);
}
await browser.close();
