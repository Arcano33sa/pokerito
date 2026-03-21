const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

if (!/@page\s*\{\s*size:\s*356mm 216mm;\s*margin:\s*7\.5mm 9\.5mm 10\.5mm;\s*\}/.test(css)) {
  throw new Error('print page should force Legal landscape dimensions with tightened margins');
}
if (!/Etapa 1\/2 — reajuste físico del PDF oficial/.test(css)) {
  throw new Error('print layout block should be documented for maintainability');
}
for (const snippet of [
  '.print-mode-panel{ margin: 0 0 10px; }',
  '.print-opening{ padding: 13px 15px 15px; gap: 11px; border-radius: 22px; }',
  '.print-table thead th{ padding: 10px 10px; font-size: 11px; }',
  '.print-rank-card,\n  .print-impact-card{ padding: 10px 12px; gap: 8px; }',
]) {
  if (!css.includes(snippet)) throw new Error(`missing expected print compaction override: ${snippet}`);
}
if (!/const APP_VERSION = '0\.1\.51';/.test(app)) throw new Error('app version should bump to 0.1.51');
if (!/const APP_BUILD = 'pdf-editorial-(?:fragmentation-stage2|final-stage3)';/.test(app)) throw new Error('app build should describe the dedicated PDF render stage');
if (!/const CACHE_NAME = 'pokerito-v0\.1\.51-pdf-editorial-(?:fragmentation-stage2|final-stage3)';/.test(sw)) throw new Error('service worker cache name should bump with the new PDF stage');

console.log('test-pdf-physical-layout-stage2=ok');
