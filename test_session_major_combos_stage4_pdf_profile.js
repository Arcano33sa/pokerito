const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, computeAnalytics, buildPdfDocumentModel, buildPdfDocumentSections, getArchiveProfileLiveModel, recalcAndPersistStats,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
const chipBlack = chips.find(c => c.id === 'chip_black');
if (!chipBlack) throw new Error('missing chip_black');
function countsForValue(amount){
  return Object.fromEntries(chipsSnap.map(c => [c.id, c.id === 'chip_black' ? Math.floor(Math.max(0, amount) / chipBlack.value) : 0]));
}

const players = [
  { id: 'p_a', name: 'Ana', nick: 'Ace', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_b', name: 'Beto', nick: 'Toro', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_c', name: 'Cora', nick: 'Cora', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
];
const playerIds = players.map(p => p.id);

function mkSession(id, date, ts, payoutsById, comboById){
  return {
    id,
    status: 'closed',
    date,
    createdAt: ts,
    updatedAt: ts,
    closedAt: ts,
    pdfSeq: Number(String(id).replace(/\D+/g, '')) || 0,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: {
      players: playerIds.map(pid => ({
        id: pid,
        buyIn: 100,
        rebuys: [],
        counts: countsForValue(payoutsById[pid] || 0),
        majorCombos: clone(comboById[pid] || {}),
      }))
    },
  };
}

const sessions = [
  mkSession('s_001', '2026-04-10', 1000, { p_a: 300, p_b: 0, p_c: 0 }, {
    p_a: { royal_flush: 1, full_house: 1 },
    p_b: { full_house: 2 },
    p_c: {},
  }),
  mkSession('s_002', '2026-04-11', 2000, { p_a: 0, p_b: 250, p_c: 50 }, {
    p_a: {}, p_b: {}, p_c: {},
  }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const store = hooks.getStore();

const comboPdf = String(hooks.buildPdfDocumentSections(hooks.buildPdfDocumentModel(store.sessions[0])));
if (!comboPdf.includes('Combinaciones Mayores')) throw new Error('pdf should include combo section title');
if (!comboPdf.includes('Jugador destacado')) throw new Error('pdf combo section should include highlighted player');
if (!comboPdf.includes('Escalera real')) throw new Error('pdf combo section should include combo headers');
if (!comboPdf.includes('Ace') || !comboPdf.includes('Toro')) throw new Error('pdf combo table should include player labels');
if (!comboPdf.includes('Total sesión')) throw new Error('pdf combo table should include totals row');

const emptyPdf = String(hooks.buildPdfDocumentSections(hooks.buildPdfDocumentModel(store.sessions[1])));
if (!emptyPdf.includes('Esta sesión cerró sin combinaciones mayores registradas.')) throw new Error('pdf should render empty combo note when no combos exist');

const analytics = hooks.computeAnalytics();
const ana = hooks.getArchiveProfileLiveModel(analytics, 'p_a');
const beto = hooks.getArchiveProfileLiveModel(analytics, 'p_b');
if (!ana || !beto) throw new Error('profiles should exist');
if (ana.majorCombosTotal !== 2) throw new Error(`expected Ana majorCombosTotal=2, got ${ana.majorCombosTotal}`);
if ((ana.majorCombos || {}).royal_flush !== 1 || (ana.majorCombos || {}).full_house !== 1) throw new Error('Ana profile should keep combo breakdown');
if (ana.majorComboSessions !== 1) throw new Error(`expected Ana majorComboSessions=1, got ${ana.majorComboSessions}`);
if (beto.majorCombosTotal !== 2 || (beto.majorCombos || {}).full_house !== 2) throw new Error('Beto profile should keep full house accumulation');

console.log('test-session-major-combos-stage4-pdf-section=ok');
console.log('test-session-major-combos-stage4-pdf-empty-state=ok');
console.log('test-session-major-combos-stage4-profile-breakdown=ok');
