const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, computeAnalytics, buildPdfDocumentModel, buildPdfDocumentSections, recalcAndPersistStats,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(),
    style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {}, hidden: false,
    classList: { toggle(){}, add(){}, remove(){} },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; },
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

const players = [
  { id: 'p1', name: 'Ana', nick: 'Ana', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p2', name: 'Beto', nick: 'Beto', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p3', name: 'Cora', nick: 'Cora', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p4', name: 'Dani', nick: 'Dani', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p5', name: 'Eli', nick: 'Eli', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p6', name: 'Fede', nick: 'Fede', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
];
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

function mkSession(id, date, ts, payouts, rebuys={}){
  return {
    id,
    status: 'closed',
    date,
    createdAt: ts - 3600000,
    updatedAt: ts,
    closedAt: ts,
    pdfSeq: Number(id.replace(/\D+/g, '')) || 0,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: {
      players: playerIds.map(pid => ({
        id: pid,
        buyIn: 100,
        rebuys: Array.from({ length: rebuys[pid] || 0 }, () => 50),
        counts: countsForValue(payouts[pid] || 0),
      })),
    },
  };
}

const sessions = [
  mkSession('s1', '2026-03-01', 1000, { p1: 240, p2: 70, p3: 90, p4: 80, p5: 60, p6: 60 }, { p1: 1 }),
  mkSession('s2', '2026-03-08', 2000, { p1: 60, p2: 250, p3: 90, p4: 70, p5: 70, p6: 60 }, { p2: 1 }),
  mkSession('s3', '2026-03-15', 3000, { p1: 80, p2: 70, p3: 260, p4: 60, p5: 70, p6: 60 }, { p3: 1 }),
  mkSession('s4', '2026-03-18', 4000, { p1: 70, p2: 65, p3: 90, p4: 255, p5: 70, p6: 50 }, { p4: 1 }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const target = hooks.getStore().sessions[hooks.getStore().sessions.length - 1];
const model = hooks.buildPdfDocumentModel(target);
const html = String(hooks.buildPdfDocumentSections(model));

const groupKeys = (model.editorialGroups || []).map(g => g.key);
const expected = ['opening-premium', 'session', 'historical-impact', 'global-archive'];
if (JSON.stringify(groupKeys) !== JSON.stringify(expected)) throw new Error(`editorial order mismatch: ${groupKeys.join(', ')}`);

const impactGroup = model.editorialGroups.find(g => g.key === 'historical-impact');
const archiveGroup = model.editorialGroups.find(g => g.key === 'global-archive');
if (!impactGroup || impactGroup.breakBefore !== true) throw new Error('impact editorial group should request page break before');
if (!archiveGroup || archiveGroup.breakBefore !== true) throw new Error('archive editorial group should request page break before');

const editorialHeadCount = (html.match(/print-editorial-head/g) || []).length;
if (editorialHeadCount !== 3) throw new Error(`expected 3 editorial heads, got ${editorialHeadCount}`);
if (!html.includes('data-pdf-group="historical-impact"')) throw new Error('impact editorial group missing from document html');
if (!html.includes('data-pdf-group="global-archive"')) throw new Error('archive editorial group missing from document html');
if (!/print-editorial-group[^\"]* pdf-break-before[\s\S]*data-pdf-group="historical-impact"/.test(html) && !/class="print-editorial-group pdf-break-before" data-pdf-group="historical-impact"/.test(html)) {
  throw new Error('impact editorial group should carry pdf-break-before class');
}
if (!html.includes('print-section--impact-major')) throw new Error('impact section should carry stage6 major class');
if (!html.includes('print-section--global-base')) throw new Error('global base section should carry stage6 class');
if (!html.includes('print-section--ranking-major')) throw new Error('ranking section should carry stage6 major class');
if (!html.includes('print-section--records-major')) throw new Error('records section should carry stage6 major class');
if (!html.includes('Bloque de sesión')) throw new Error('session editorial intro missing');
if (!html.includes('Lectura histórica')) throw new Error('impact editorial intro missing');
if (!html.includes('Cierre del documento')) throw new Error('archive editorial intro missing');

console.log('test-pdf-premium-editorial-flow-stage6=ok');
