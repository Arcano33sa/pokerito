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
  'function getPdfSectionFamilyMeta(section, options){',
  'function canMergePdfBlockWithPageEntry(entry, block){',
  'function addPdfBlockToPage(pageBucket, block, budget){',
  'function buildPdfMergedSectionEntryNode(entry){',
  "setPrintStatus(root, 'Tejiendo continuidades editoriales entre páginas DOM…', 'loading');",
  "root.dataset.pdfPagingEngine = 'route2-final-stage4';",
]) {
  if (snippet instanceof RegExp){
    if (!snippet.test(code) && !snippet.test(sw)) throw new Error(`missing continuity stage3/4 snippet: ${snippet}`);
    continue;
  }
  if (!code.includes(snippet) && !sw.includes(snippet)) throw new Error(`missing continuity stage3/4 snippet: ${snippet}`);
}
for (const snippet of [
  'Etapa 4/4 — cierre final de la Ruta 2',
  '.pdf-page-block-section--merged{',
]) {
  if (!css.includes(snippet)) throw new Error(`missing continuity stage3/4 css: ${snippet}`);
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
const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i+1}`, name: `Jugador ${i+1}`, nick: `J${i+1}`, active: true, stats: {}, createdAt: 1000 + i, updatedAt: 1000 + i }));
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
function mkSession(id, date, ts, payouts){
  return {
    id, status: 'closed', date, createdAt: ts - 3600000, updatedAt: ts, closedAt: ts, pdfSeq: Number(id.replace(/\D+/g, '')) || 0,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: { players: playerIds.map(pid => ({ id: pid, buyIn: 100, rebuys: pid === 'p1' || pid === 'p2' ? [50, 50] : [], counts: countsForValue(payouts[pid] || 0) })) },
  };
}
const sessions = [
  mkSession('s1', '2026-03-01', 1000, { p1: 320, p2: 180, p3: 40, p4: 0, p5: 120, p6: 70, p7: 40, p8: 30, p9: 20, p10: 10 }),
  mkSession('s2', '2026-03-08', 2000, { p1: 60, p2: 250, p3: 210, p4: 20, p5: 80, p6: 90, p7: 50, p8: 40, p9: 30, p10: 20 }),
  mkSession('s3', '2026-03-15', 3000, { p1: 50, p2: 70, p3: 290, p4: 10, p5: 110, p6: 90, p7: 60, p8: 20, p9: 80, p10: 40 }),
  mkSession('s4', '2026-03-20', 4000, { p1: 40, p2: 80, p3: 260, p4: 0, p5: 150, p6: 120, p7: 70, p8: 80, p9: 90, p10: 60 }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const target = hooks.getStore().sessions[hooks.getStore().sessions.length - 1];
const model = hooks.buildPdfDocumentModel(target);
const html = String(hooks.buildPdfDocumentSections(model));

for (const token of [
  'data-pdf-family-key="session-results"',
  'data-pdf-family-key="historical-impact-cards"',
  'data-pdf-family-key="global-ranking"',
  'Ficha 2 de',
  'sin sentirse cortado ni reiniciado',
  'sin parecer un bloque nuevo accidental',
]) {
  if (!html.includes(token)) throw new Error(`missing continuity html token: ${token}`);
}

console.log('test-pdf-route2-final-stage4-build=ok');
