const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, computeAnalytics, buildPdfRankingSections, buildPdfRecordsSections, recalcAndPersistStats,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(),
    style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {},
    classList: { toggle(){}, add(){}, remove(){} },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, blur(){}, focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1024, clientHeight: 768 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){ if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } }; return makeEl(tag); },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
};
const windowObj = {
  document,
  navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } },
  location: { hash: '', href: 'https://example.test/' },
  URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(){}, removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
  open(){ return null; }, scrollTo(){}, print(){},
};
const context = {
  window: windowObj, document, navigator: windowObj.navigator, location: windowObj.location,
  localStorage: { getItem(k){ return storage.has(k) ? storage.get(k) : null; }, setItem(k,v){ storage.set(k, String(v)); }, removeItem(k){ storage.delete(k); }, key(i){ return Array.from(storage.keys())[i] || null; }, get length(){ return storage.size; } },
  console, URLSearchParams, Blob, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
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
const countsForValue = (amount) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === 'chip_black' ? Math.floor(amount / chipBlack.value) : 0]));

const players = [
  { id: 'p_a', name: 'Ana', nick: 'A', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_b', name: 'Beto', nick: 'B', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_c', name: 'Cora', nick: 'C', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_d', name: 'Dani', nick: 'D', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
];

function mkSession(id, date, ts, payoutsById){
  const playerIds = players.map(p => p.id);
  return {
    id,
    status: 'closed',
    date,
    createdAt: ts,
    updatedAt: ts,
    closedAt: ts,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: {
      players: playerIds.map(pid => ({ id: pid, buyIn: 100, rebuys: [], counts: countsForValue(payoutsById[pid] || 0) }))
    },
  };
}

const sessions = [
  mkSession('s1', '2026-03-01', 1000, { p_a: 220, p_b: 100, p_c: 80, p_d: 0 }),
  mkSession('s2', '2026-03-08', 2000, { p_a: 80, p_b: 260, p_c: 60, p_d: 0 }),
  mkSession('s3', '2026-03-15', 3000, { p_a: 180, p_b: 60, p_c: 160, p_d: 0 }),
  mkSession('s4', '2026-03-18', 4000, { p_a: 50, p_b: 70, p_c: 280, p_d: 0 }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const analytics = hooks.computeAnalytics();

const rankingHtml = String(hooks.buildPdfRankingSections(analytics.ranking || []));
const recordsHtml = String(hooks.buildPdfRecordsSections(analytics.records || {}));

if (!rankingHtml.includes('Podio histórico actual')) throw new Error('ranking should include top historical podium overview');
if (!rankingHtml.includes('Archivo global')) throw new Error('ranking should include archive banner');
if (!rankingHtml.includes('print-rank-trail')) throw new Error('ranking cards should include historical trail rows');
if (!rankingHtml.includes('Puesto individual consolidado') && !rankingHtml.includes('Puesto compartido')) throw new Error('ranking cards should explain official placement state');

for (const subtitle of ['Golpes de una sola noche', 'Palmarés competitivo', 'Movimiento e inversión histórica', 'Rentabilidad global', 'Rachas registradas']) {
  if (!recordsHtml.includes(subtitle)) throw new Error(`records section missing subgroup subtitle: ${subtitle}`);
}
if (!recordsHtml.includes('Cierre histórico del documento')) throw new Error('records should finish with archive closing seal');
if (!recordsHtml.includes('Mejor ROI global')) throw new Error('records should retain ROI record data');
if (!recordsHtml.includes('Más victorias históricas')) throw new Error('records should retain wins record data');

console.log('test-pdf-ranking-overview-stage5=ok');
console.log('test-pdf-records-groups-stage5=ok');
