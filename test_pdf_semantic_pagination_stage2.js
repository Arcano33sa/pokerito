const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

for (const snippet of [
  "const PDF_RESULTS_ROWS_PER_SECTION = 6;",
  "const PDF_IMPACT_CARDS_PER_SECTION = 1;",
  "const PDF_RANK_CARDS_PER_SECTION = 1;",
  "const PDF_PRINT_INNER_WIDTH_MM = 337;",
  "const PDF_PRINT_INNER_HEIGHT_MM = 198;",
  "async function prepareSemanticPdfPagination(root, signal){",
  "setPrintStatus(root, 'Ordenando cortes editoriales…', 'loading');",
  "await prepareSemanticPdfPagination(root, signal);",
]) {
  if (!app.includes(snippet)) throw new Error(`missing semantic pagination snippet: ${snippet}`);
}

for (const regex of [
  /clearSemanticPdfPagination\(target\);/,
  /markSemanticPdfBreak\(anchor, entry\.reason \|\| 'section-unit'\)/,
  /markSemanticPdfBreak\(unit, 'section'\)/,
  /\.pdf-break-before-semantic/,
  /Etapa 2\/2 — paginación semántica\/editorial/,
]) {
  if (!regex.test(app + '\n' + css)) throw new Error(`missing stage2 semantic pagination marker: ${regex}`);
}

console.log('test-pdf-semantic-pagination-stage2=ok');
