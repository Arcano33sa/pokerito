const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

for (const snippet of [
  'function buildScreenEditorialGroup(opts){',
  'function buildPdfPrintDocumentSections(model){',
  'function buildScreenReportSections(model){',
  "buildPdfDocumentSections(model, 'pdf')",
  "buildPdfDocumentSections(model, 'screen')",
  'class="pdf-document-shell print-screen"',
  'class="pdf-document-content print-content"',
  'class="report-reader-content print-content"',
]) {
  if (!app.includes(snippet)) throw new Error(`missing dedicated render snippet: ${snippet}`);
}

for (const snippet of [
  '.pdf-document-shell{',
  '.pdf-document-sheet{',
  '.pdf-document-group{',
  '.pdf-document-shell .print-opening-grid{',
  '.pdf-document-shell .print-opening-stats{',
  'Etapa 1/3 — contenedor PDF dedicado',
]) {
  if (!css.includes(snippet)) throw new Error(`missing dedicated PDF css snippet: ${snippet}`);
}

console.log('test-pdf-dedicated-container-stage1=ok');
