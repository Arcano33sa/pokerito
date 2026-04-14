const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

for (const snippet of [
  /const APP_BUILD = '[-a-z0-9.]+';/,
  /const APP_CACHE_NAME = 'pokerito-v[0-9.]+-[-a-z0-9.]+';/,
  /const SW_URL = '\.\/sw\.js\?v=[0-9.]+-[-a-z0-9.]+';/,
  "rebalanceBottomReservePx",
  "function canMergePdfPageEntries(entry, incomingEntry){",
  "function getPdfPageEntryAddedHeight(pageBucket, entry, budget){",
  "function rebalancePdfPages(pages, budget){",
  "setPrintStatus(root, 'Ajustando densidad editorial y remates finales…', 'loading');",
  "root.dataset.pdfPagingEngine = 'route2-final-stage4';",
  "root.dataset.pdfRebalancedMoves = String(Math.max(0, Math.floor(numOrZero(rebalancedMoves))));",
]) {
  if (snippet instanceof RegExp){
    if (!snippet.test(code) && !snippet.test(sw)) throw new Error(`missing route2 final stage4 snippet: ${snippet}`);
    continue;
  }
  if (!code.includes(snippet) && !sw.includes(snippet)) throw new Error(`missing route2 final stage4 snippet: ${snippet}`);
}
for (const snippet of [
  'Etapa 4/4 — cierre final de la Ruta 2',
  '.pdf-page-unit[data-pdf-block-kind="section-family"] .print-note--continuation{',
]) {
  if (!css.includes(snippet)) throw new Error(`missing route2 final stage4 css: ${snippet}`);
}

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {
  normalizeStoreObject, computeAnalytics, buildPdfDocumentModel, buildPdfDocumentSections, recalcAndPersistStats,
  getStore: () => store,
  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },
};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(),
    style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {}, hidden: false,
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; }, hasAttribute(name){ return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, blur(){}, focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1280, clientHeight: 800 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){ if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } }; return makeEl(tag); },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
  querySelectorAll(){ return []; },
  contains(){ return true; },
  addEventListener(){},
};
const windowObj = {
  document,
  navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } },
  location: { hash: '', href: 'https://example.test/' },
  visualViewport: null,
  innerWidth: 1280,
  innerHeight: 800,
  URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(){}, removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
  requestAnimationFrame(cb){ return setTimeout(cb, 0); },
  open(){ return null; }, scrollTo(){}, print(){},
};
const context = {
  window: windowObj, document, navigator: windowObj.navigator, location: windowObj.location,
  localStorage: { getItem(k){ return storage.has(k) ? storage.get(k) : null; }, setItem(k,v){ storage.set(k, String(v)); }, removeItem(k){ storage.delete(k); }, key(i){ return Array.from(storage.keys())[i] || null; }, get length(){ return storage.size; } },
  console, URLSearchParams, Blob, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: windowObj.requestAnimationFrame,
};
vm.createContext(context);
vm.runInContext(code, context);
const hooks = context.window.__TEST_HOOKS;
const clone = (v) => JSON.parse(JSON.stringify(v));

const base = clone(hooks.getStore());
const chips = clone(base.chips);
const chipsSnap = chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const orderedChips = [...chipsSnap].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i+1}`, name: `Jugador ${i+1}`, nick: `J${i+1}`, active: true, stats: {}, createdAt: 1000 + i, updatedAt: 1000 + i }));
const playerIds = players.map(p => p.id);
function countsForValue(amount){
  let remaining = Math.max(0, Math.round(amount));
  const counts = {};
  for (const chip of orderedChips){
    const value = Math.max(1, Math.round(Number(chip.value || 1)));
    const qty = Math.floor(remaining / value);
    counts[chip.id] = qty;
    remaining -= qty * value;
  }
  for (const chip of chipsSnap){ if (!(chip.id in counts)) counts[chip.id] = 0; }
  return counts;
}
function mkSession(id, date, ts, payouts, extra={}){
  return {
    id,
    status: 'closed',
    date,
    createdAt: extra.createdAt || (ts - 3600000),
    updatedAt: extra.updatedAt || ts,
    closedAt: extra.closedAt == null ? ts : extra.closedAt,
    importedAt: extra.importedAt || 0,
    importedFrom: extra.importedFrom || '',
    pdfSeq: Number(String(id).replace(/\D+/g, '')) || 0,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    historicalImpact: extra.historicalImpact || null,
    game: { players: playerIds.map(pid => ({ id: pid, buyIn: 100, rebuys: pid === 'p1' || pid === 'p2' || pid === 'p3' ? [50] : [], counts: countsForValue(payouts[pid] || 0) })) },
  };
}
const sessions = [
  mkSession('legacy_001', '', 900, { p1: 40, p2: 210, p3: 60, p4: 20, p5: 90, p6: 80, p7: 70, p8: 40, p9: 40, p10: 20, p11: 10, p12: 20 }, { createdAt: 400, updatedAt: 950, closedAt: 0 }),
  mkSession('import_002', '2026-02-28', 1400, { p1: 280, p2: 40, p3: 120, p4: 10, p5: 80, p6: 70, p7: 50, p8: 30, p9: 20, p10: 10, p11: 5, p12: 5 }, { importedAt: 1500, importedFrom: 'legacy-backup' }),
  mkSession('short_003', '2026-03-10', 2200, { p1: 150, p2: 100, p3: 120, p4: 90, p5: 80, p6: 70, p7: 60, p8: 55, p9: 45, p10: 40, p11: 35, p12: 25 }),
  mkSession('mid_004', '2026-03-14', 3200, { p1: 60, p2: 250, p3: 85, p4: 20, p5: 160, p6: 100, p7: 90, p8: 70, p9: 45, p10: 35, p11: 30, p12: 20 }),
  mkSession('long_005', '2026-03-20', 4200, { p1: 45, p2: 80, p3: 320, p4: 15, p5: 135, p6: 125, p7: 95, p8: 80, p9: 75, p10: 65, p11: 55, p12: 35 }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const store = hooks.getStore();
const targets = [
  store.sessions[0],
  store.sessions[1],
  store.sessions[2],
  store.sessions[store.sessions.length - 1],
];

targets.forEach((target, idx) => {
  const model = hooks.buildPdfDocumentModel(target);
  const html = String(hooks.buildPdfDocumentSections(model));
  for (const token of [
    'data-pdf-group="opening-premium"',
    'data-pdf-group="session"',
    'data-pdf-group="historical-impact"',
    'data-pdf-group="global-archive"',
    'Podio por neto final',
    'Impacto de esta Sesión',
    'Ranking global',
    'Récords globales',
  ]) {
    if (!html.includes(token)) throw new Error(`missing token for target ${idx + 1}: ${token}`);
  }
});

const latestHtml = String(hooks.buildPdfDocumentSections(hooks.buildPdfDocumentModel(store.sessions[store.sessions.length - 1])));
for (const token of [
  'print-section--continuation',
  'Sesión · Resultados · 2/2',
  'Impacto histórico · 2/12',
  'Archivo global · Ranking · 2/12',
  'Archivo global · Récords · 2/5',
]) {
  if (!latestHtml.includes(token)) throw new Error(`missing latest route2 final token: ${token}`);
}

console.log('test-pdf-route2-final-stage4-build=ok');
console.log('test-pdf-route2-final-stage4-historical=ok');
console.log('test-pdf-route2-final-stage4-regressions=ok');
