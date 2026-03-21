const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

for (const snippet of [
  /const APP_BUILD = '(?:pdf-page-budget-stage2|pdf-continuity-stage3-4|pdf-route2-final-stage4)';/,
  /const APP_CACHE_NAME = 'pokerito-v0\.1\.51-(?:pdf-page-budget-stage2|pdf-continuity-stage3-4|pdf-route2-final-stage4)';/,
  /const SW_URL = '\.\/sw\.js\?v=0\.1\.51-(?:pdf-page-budget-stage2|pdf-continuity-stage3-4|pdf-route2-final-stage4)';/,
  'function createPdfBlockWrapper(className, sourceNodes, meta){',
  'function getPdfSectionBlockGroups(section){',
  'function collectPdfPageBlocksFromFlow(flowRoot){',
  'function buildPdfPageBudget(measureBody){',
  'function canFitPdfBlockOnPage(pageBucket, block, budget){',
  "setPrintStatus(root, 'Midiendo bloques editoriales…', 'loading');",
  /setPrintStatus\(root, '(?:Repartiendo bloques por presupuesto real de página…|Tejiendo continuidades editoriales entre páginas DOM…)'.*loading'\);/,
  /root\.dataset\.pdfPagingEngine = '(?:page-budget-stage2|continuity-stage3-4|route2-final-stage4)';/,
]) {
  if (snippet instanceof RegExp){ if (!snippet.test(app) && !snippet.test(sw)) throw new Error(`missing page-budget stage2 snippet: ${snippet}`); continue; }
  if (!app.includes(snippet) && !sw.includes(snippet)) throw new Error(`missing page-budget stage2 snippet: ${snippet}`);
}

for (const snippet of [
  '.pdf-page-block-section{',
  '.print-section--paged-continuation .print-section-head{',
  'Etapa 2/4 — motor de presupuesto de página',
]) {
  if (!css.includes(snippet)) throw new Error(`missing page-budget css: ${snippet}`);
}

console.log('test-pdf-page-budget-stage2-4=ok');
