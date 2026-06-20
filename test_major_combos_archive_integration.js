const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, buildPortableBackupPayload, normalizeMajorCombos, majorCombosTotal, buildSessionMajorCombosSummary, computeAnalytics, buildPdfDocumentModel, buildPdfDocumentSections,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(), style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {}, hidden: false,
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, blur(){}, focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1024, clientHeight: 768 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){ if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } }; return makeEl(tag); },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
  querySelectorAll(){ return []; },
};
const windowObj = {
  document, navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } }, location: { hash: '', href: 'https://example.test/' },
  URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(){}, removeEventListener(){}, matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
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
const chip = (base.chips || [])[0] || { id: 'chip_white', name: 'Blanca', value: 1, color: '#fff' };
const storeWithClosedCombos = Object.assign({}, base, {
  players: [
    { id: 'p1', name: 'Ana Rivera', nick: 'Ana', active: true, stats: {}, createdAt: 1, updatedAt: 1 },
    { id: 'p2', name: 'Beto Solís', nick: 'Beto', active: true, stats: {}, createdAt: 2, updatedAt: 2 },
  ],
  sessions: [{
    id: 's-combos', status: 'closed', date: '2026-06-20', createdAt: 100, updatedAt: 110, closedAt: 120,
    playerIds: ['p1', 'p2'],
    playersSnapshot: [
      { id: 'p1', name: 'Ana Rivera', nick: 'Ana', display: 'Ana' },
      { id: 'p2', name: 'Beto Solís', nick: 'Beto', display: 'Beto' },
    ],
    chipsSnapshot: [chip],
    game: { players: [
      { id: 'p1', buyIn: '100', rebuys: [], counts: { [chip.id]: '200' }, majorCombos: { royal_flush: 1, straight_flush: 0, four_kind: 2, full_house: 0 } },
      { id: 'p2', buyIn: '100', rebuys: [], counts: { [chip.id]: '250' }, majorCombos: { royal_flush: 0, straight_flush: 1, four_kind: 0, full_house: 3 } },
    ] },
    results: [
      { id: 'p1', name: 'Ana Rivera', nick: 'Ana', display: 'Ana', buyIn: 100, rebuysTotal: 0, invested: 100, final: 200, net: 100, majorCombos: { royal_flush: 1, straight_flush: 0, four_kind: 2, full_house: 0 }, majorCombosTotal: 3 },
      { id: 'p2', name: 'Beto Solís', nick: 'Beto', display: 'Beto', buyIn: 100, rebuysTotal: 0, invested: 100, final: 250, net: 150, majorCombos: { royal_flush: 0, straight_flush: 1, four_kind: 0, full_house: 3 }, majorCombosTotal: 4 },
    ],
  }],
  draftSessionId: null,
});

const normalized = hooks.setStore(storeWithClosedCombos);
const session = normalized.sessions[0];
const summary = hooks.buildSessionMajorCombosSummary(session);
if (!summary.hasData) throw new Error('major combos summary should detect data');
if (summary.totalRegistradas !== 7) throw new Error('summary total should be 7');
if (!String(summary.topComboLabel).includes('Full house')) throw new Error('top combo should be Full house');
if (!String(summary.featuredPlayerLabel).includes('Beto')) throw new Error('featured player should be Beto');
if (summary.rows.length !== 2 || summary.rows[0].id !== 'p2') throw new Error('summary rows should rank Beto first');
console.log('test-major-combos-session-summary=ok');

const analytics = hooks.computeAnalytics();
if (!Array.isArray(analytics.majorCombosRanking) || analytics.majorCombosRanking.length !== 2) throw new Error('major combos ranking missing');
if (analytics.majorCombosRanking[0].id !== 'p2' || analytics.majorCombosRanking[0].majorCombosTotal !== 4) throw new Error('major combos ranking should put Beto first');
const ana = analytics.byPlayer && analytics.byPlayer.get('p1');
if (!ana || ana.majorCombos.four_kind !== 2 || ana.majorCombosTotal !== 3) throw new Error('profile analytics should accumulate Ana combos');
console.log('test-major-combos-profile-ranking-analytics=ok');

const pdfModel = hooks.buildPdfDocumentModel(session);
const pdfText = hooks.buildPdfDocumentSections(pdfModel);
['Combinaciones Mayores', 'Total registradas', 'Combinación más repetida', 'Jugador destacado', 'Escalera real', 'Escalera de color', 'Póker', 'Full house', 'Total sesión', 'Ranking de Combinaciones Mayores'].forEach(txt => {
  if (!pdfText.includes(txt)) throw new Error('PDF output missing ' + txt);
});
console.log('test-major-combos-pdf-block=ok');

const payload = hooks.buildPortableBackupPayload(clone(normalized), 'auto');
const exported = payload.data.source.store.sessions[0].game.players[1].majorCombos;
if (!exported || exported.full_house !== 3) throw new Error('export should preserve majorCombos after archive integration');
console.log('test-major-combos-json-export=ok');

const legacy = clone(normalized);
delete legacy.sessions[0].game.players[0].majorCombos;
delete legacy.sessions[0].game.players[1].majorCombos;
delete legacy.sessions[0].results[0].majorCombos;
delete legacy.sessions[0].results[1].majorCombos;
hooks.setStore(legacy);
const legacyAnalytics = hooks.computeAnalytics();
if ((legacyAnalytics.majorCombosRanking || []).length !== 0) throw new Error('legacy session without majorCombos should not create fake ranking');
const legacySummary = hooks.buildSessionMajorCombosSummary(hooks.getStore().sessions[0]);
if (legacySummary.hasData || legacySummary.totalRegistradas !== 0) throw new Error('legacy sessions without majorCombos should stay at zero');
const legacyPdfText = hooks.buildPdfDocumentSections(hooks.buildPdfDocumentModel(hooks.getStore().sessions[0]));
if (legacyPdfText.includes('Total registradas')) throw new Error('legacy PDF should not render populated Combinaciones Mayores block');
console.log('test-major-combos-legacy-safe=ok');
