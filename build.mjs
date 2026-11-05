import { build, transform } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const font = (name, file, weight) => {
  const b64 = readFileSync(`fonts/${file}.woff2`).toString('base64');
  return `@font-face{font-family:'${name}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};font-display:swap}`;
};

const js = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2021',
  write: false,
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const css = await transform(readFileSync('src/styles.css', 'utf8'), { loader: 'css', minify: true });
const fonts = font('Climate', 'climate', '400') + font('Doto', 'doto', '100 900') + font('Schibsted', 'schibsted', '400 900');

const body = readFileSync('src/index.template.html', 'utf8')
  .replace('/*__CSS__*/', () => fonts + css.code)
  .replace('/*__JS__*/', () => script)
  .replace(/^<title>.*<\/title>\n<meta name="claude:viewport-fit-sides" content="cover">\n/, '');

const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>CookedBrain</title>
<meta name="description" content="How cooked is your brain? Fifteen free tests of reflex, memory, attention, logic and more. See how you place against other players after every round.">
<link rel="canonical" href="https://cookedbrain.com/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#161412">
<meta property="og:title" content="CookedBrain">
<meta property="og:description" content="How cooked is your brain? Fifteen free tests. No sign-up.">
<meta property="og:image" content="https://cookedbrain.com/og.png">
<meta property="og:url" content="https://cookedbrain.com/">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', head + body + '\n</body>\n</html>\n');
// The artifact version keeps the host's skeleton.
writeFileSync('dist/artifact.html', readFileSync('src/index.template.html', 'utf8').replace('/*__CSS__*/', () => fonts + css.code).replace('/*__JS__*/', () => script));
for (const f of ['favicon.svg', 'robots.txt', 'sitemap.xml', '_headers', '_redirects', '404.html']) writeFileSync(`dist/${f}`, readFileSync(`public/${f}`));
for (const f of ['og.png', 'apple-touch-icon.png']) { try { writeFileSync(`dist/${f}`, readFileSync(`public/${f}`)); } catch {} }

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`js ${kb(script.length)}, gzip ${kb(gzipSync(script).length)}`);
console.log(`css ${kb(css.code.length)}, gzip ${kb(gzipSync(css.code).length)}`);
console.log(`page ${kb(body.length)}, gzip ${kb(gzipSync(body).length)}`);
