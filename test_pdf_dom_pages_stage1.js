const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

for (const snippet of [
  /const APP_BUILD = '[-a-z0-9.]+';/,
  /const APP_CACHE_NAME = 'pokerito-v[0-9.]+-[-a-z0-9.]+';/,
  /const SW_URL = '\.\/sw\.js\?v=[0-9.]+-[-a-z0-9.]+';/,
  'function buildPdfDocumentHeadMarkup(meta){',
  'function buildPdfPageShell(meta, pageNumber, totalPages){',
  'function collectPdfPageBlocksFromFlow(flowRoot){',
  'function buildDomPagedPdf(root, model, signal){',
  'data-pdf-layout="dom-pages"',
  'id="pdfPageStage"',
  'id="pdfFlowMeasure"',
  'Documento listo en páginas DOM presupuestadas.',
]) {
  if (snippet instanceof RegExp){
    if (!snippet.test(app) && !snippet.test(sw)) throw new Error(`missing DOM pages stage1 snippet: ${snippet}`);
    continue;
  }
  if (!app.includes(snippet) && !sw.includes(snippet)) throw new Error(`missing DOM pages stage1 snippet: ${snippet}`);
}

for (const snippet of [
  '.pdf-page-stage{',
  '.pdf-document-flow-sandbox,',
  '.pdf-page{',
  '.pdf-page-frame{',
  '.pdf-page-header{',
  '.pdf-page-body{',
  '.pdf-page-footer{',
  '.pdf-page-unit{',
  'Etapa 2/4 — motor de presupuesto de página',
]) {
  if (!css.includes(snippet)) throw new Error(`missing DOM pages css: ${snippet}`);
}

console.log('test-pdf-dom-pages-stage1=ok');
