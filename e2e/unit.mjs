// Checks the pure parts: seeds, scoring and placement maths.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const out = await build({ stdin: { contents: `
  export { place, tierFor, beatenInSample, median, TIERS } from './src/core/stats';
  export { Rng } from './src/core/rng';
  export { TESTS } from './src/tests';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', write: false, platform: 'neutral', target: 'es2021' });
const url = 'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64');
const { place, tierFor, beatenInSample, median, TIERS, Rng, TESTS } = await import(url);

let n = 0; const ok = (name, f) => { f(); n++; };

ok('same seed, same content', () => { for (const t of TESTS) assert.deepEqual(t.generate('abc'), t.generate('abc'), t.id); });
ok('different seed, different content', () => { for (const t of TESTS) if (t.id !== 'deadstop') assert.notDeepEqual(t.generate('abc'), t.generate('abd'), t.id); });
ok('rng stays in range', () => { const r = new Rng('x'); for (let i = 0; i < 5000; i++) { const v = r.int(2, 5); assert(v >= 2 && v <= 5); } });

ok('tiers match the ladder', () => {
  const cases = [[0, 'Raw'], [4.9, 'Raw'], [5, 'Rare'], [19.9, 'Rare'], [20, 'Medium Rare'], [40, 'Medium'], [60, 'Well Done'], [80, 'Cooked'], [95, 'Burnt'], [100, 'Burnt']];
  for (const [c, name] of cases) assert.equal(tierFor(c).name, name, String(c));
});
ok('cooked is 100 minus beaten', () => { for (const t of TESTS) { const p = place(t, 'mouse', t.lowerIsBetter ? 300 : 9); assert.ok(Math.abs(p.cooked + p.beaten - 100) < 1e-9); } });
ok('reaction curve centres on 273', () => { const f = TESTS[0]; const p = place(f, 'mouse', 273); assert.ok(Math.abs(p.beaten - 50) < 0.5, String(p.beaten)); assert.ok(Math.abs(p.medianScore - 273) < 0.5); });
ok('better scores always place higher', () => {
  for (const t of TESTS) {
    const xs = t.lowerIsBetter ? [150, 250, 350, 500, 900] : [1, 5, 10, 20, 40];
    const b = xs.map((x) => place(t, 'mouse', x).beaten);
    for (let i = 1; i < b.length; i++) t.lowerIsBetter ? assert.ok(b[i] <= b[i - 1], t.id) : assert.ok(b[i] >= b[i - 1], t.id);
  }
});
ok('ties split evenly', () => { assert.equal(beatenInSample(5, [5, 5, 5, 5], true), 50); assert.equal(beatenInSample(5, [1, 9], true), 50); assert.equal(beatenInSample(5, [1, 9], false), 50); });
ok('under 30 players uses the reference curve', () => { const p = place(TESTS[0], 'mouse', 250, Array(29).fill(300)); assert.equal(p.basis, 'reference'); assert.equal(p.rank, null); assert.equal(p.players, 29); });
ok('30 to 99 players is an early estimate', () => {
  const others = Array.from({ length: 40 }, (_, i) => 200 + i * 5);
  const p = place(TESTS[0], 'mouse', 300, others);
  assert.equal(p.basis, 'early'); assert.equal(p.rank, 21); assert.ok(Math.abs(p.beaten - 48.75) < 1e-9, String(p.beaten));
  assert.ok(Math.abs(p.bins.reduce((s, b) => s + b.share, 0) - 1) < 1e-9);
});
ok('100 or more is a real population', () => { const p = place(TESTS[0], 'mouse', 300, Array.from({ length: 120 }, (_, i) => 200 + i)); assert.equal(p.basis, 'players'); });
ok('higher-is-better ranks the right way', () => { const echo = TESTS.find((t) => t.id === 'echo'); const others = Array.from({ length: 40 }, (_, i) => 1 + (i % 12)); const p = place(echo, 'mouse', 12, others); assert.equal(p.rank, 1); assert.ok(p.beaten > 90); assert.ok(p.position(12) < 0.1); });
ok('next tier sits on the better side', () => {
  for (const t of TESTS) { const p = place(t, 'mouse', t.lowerIsBetter ? 800 : 1); if (p.nextTier) assert.ok(t.lowerIsBetter ? p.nextTier.score <= 800 : p.nextTier.score >= 1, t.id); }
  assert.equal(place(TESTS[0], 'mouse', 100).nextTier, null);
});
ok('flinch scores the median and counts false starts', () => {
  const f = TESTS[0]; const r = f.score([{ rt: 200 }, { rt: null }, { rt: 300 }, { rt: 250 }, { rt: 900 }, { rt: 240 }]);
  assert.equal(r.score, 250); assert.equal(r.valid, true); assert.equal(r.detail[2].value, '1');
});
ok('dead stop scores absolute error', () => { const d = TESTS.find((t) => t.id === 'deadstop'); assert.equal(d.score([{ error: 100 }, { error: -300 }, { error: 200 }]).score, 200); });
ok('keys counts only correct characters', () => { const k = TESTS.find((t) => t.id === 'keys'); const r = k.score([{ word: 'the', typed: 'the' }, { word: 'of', typed: 'if' }, { word: 'and', typed: 'and' }, { word: 'word', typed: 'wo', partial: true }]); assert.equal(r.score, Math.round((4 + 4 + 2) / 5 / 0.5)); });
ok('spin shapes are never symmetric', () => { const s = TESTS.find((t) => t.id === 'spin').generate('q'); assert.equal(s.prompts.length, 120); });
ok('median', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 2, 3]), 2.5); });
console.log(`${n} checks passed, ${TIERS.length} tiers, ${TESTS.length} tests`);
