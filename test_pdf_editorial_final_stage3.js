const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

for (const snippet of [
  /const APP_BUILD = '(?:pdf-page-budget-stage2|pdf-continuity-stage3-4|pdf-route2-final-stage4)';/,
  /const APP_CACHE_NAME = 'pokerito-v0\.1\.51-(?:pdf-page-budget-stage2|pdf-continuity-stage3-4|pdf-route2-final-stage4)';/,
  /const SW_URL = '\.\/sw\.js\?v=0\.1\.51-(?:pdf-page-budget-stage2|pdf-continuity-stage3-4|pdf-route2-final-stage4)';/,
  "const pageBuffer = Math.max(10, Math.round(pageHeight * 0.028));",
  "maxAtomicHeight: pageHeight * 0.93",
  "function buildPdfContinuationLabel(parts, currentIndex, total){",
  "print-section--continuation",
]) {
  if (snippet instanceof RegExp){ if (!snippet.test(code) && !snippet.test(css) && !snippet.test(sw)) throw new Error(`missing stage3 final snippet: ${snippet}`); continue; }
  if (!code.includes(snippet) && !css.includes(snippet) && !sw.includes(snippet)) throw new Error(`missing stage3 final snippet: ${snippet}`);
}
for (const snippet of [
  'Etapa 3/3 — cierre editorial final del PDF oficial',
  '.print-section--continuation{',
]) {
  if (!css.includes(snippet)) throw new Error(`missing stage3 final css: ${snippet}`);
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
const players = Array.from({ length: 9 }, (_, i) => ({ id: `p${i+1}`, name: `Jugador ${i+1}`, nick: `J${i+1}`, active: true, stats: {}, createdAt: 1000 + i, updatedAt: 1000 + i }));
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
    id, status: 'closed', date, createdAt: extra.createdAt || (ts - 3600000), updatedAt: extra.updatedAt || ts, closedAt: extra.closedAt == null ? ts : extra.closedAt, pdfSeq: Number(id.replace(/\D+/g, '')) || 0,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    historicalImpact: extra.historicalImpact || null,
    game: { players: playerIds.map(pid => ({ id: pid, buyIn: 100, rebuys: pid === 'p1' || pid === 'p2' ? [50] : [], counts: countsForValue(payouts[pid] || 0) })) },
  };
}
const sessions = [
  mkSession('s_legacy', '', 900, { p1: 40, p2: 210, p3: 60, p4: 20, p5: 90, p6: 80, p7: 70, p8: 40, p9: 40 }, { createdAt: 400, updatedAt: 950, closedAt: 0 }),
  mkSession('s_import_old', '2026-03-01', 1200, { p1: 280, p2: 40, p3: 120, p4: 10, p5: 80, p6: 70, p7: 50, p8: 30, p9: 20 }, { createdAt: 1200, updatedAt: 1200 }),
  mkSession('s_short', '2026-03-12', 2200, { p1: 100, p2: 160, p3: 140, p4: 90, p5: 80, p6: 70, p7: 60, p8: 55, p9: 45 }),
  mkSession('s_mid', '2026-03-16', 3200, { p1: 50, p2: 250, p3: 80, p4: 20, p5: 150, p6: 100, p7: 90, p8: 70, p9: 40 }),
  mkSession('s_long', '2026-03-20', 4200, { p1: 45, p2: 80, p3: 290, p4: 15, p5: 135, p6: 125, p7: 95, p8: 80, p9: 35 }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const target = hooks.getStore().sessions[hooks.getStore().sessions.length - 1];
const model = hooks.buildPdfDocumentModel(target);
const html = String(hooks.buildPdfDocumentSections(model));

for (const token of [
  'Sesión · Resultados · 2/2',
  'Impacto histórico · 2/9',
  'Archivo global · Ranking · 2/9',
  'Archivo global · Récords · 2/5',
  'print-section--continuation',
  'Mismo orden oficial, mismo criterio histórico',
]) {
  if (!html.includes(token)) throw new Error(`missing stage3 final html token: ${token}`);
}
if (!html.includes('data-pdf-group="historical-impact"')) throw new Error('historical impact group missing in final stage3 html');
if (!html.includes('data-pdf-group="global-archive"')) throw new Error('global archive group missing in final stage3 html');

console.log('test-pdf-editorial-final-stage3-build=ok');
console.log('test-pdf-editorial-final-stage3-continuations=ok');
console.log('test-pdf-editorial-final-stage3-regressions=ok');
