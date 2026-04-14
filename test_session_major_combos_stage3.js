const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, createDraftSession, ensureSessionRosterIntegrity, ensurePlayerState,\n  registerSessionPlayerMajorCombo, getSessionPlayerMajorComboCounts,\n  adjustSessionPlayerMajorCombo, setSessionPlayerMajorComboCount,\n  saveSession, getSessionById, closeSession, getSessionMajorCombosSummary,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1024, clientHeight: 768 },
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
  innerWidth: 1024,
  innerHeight: 768,
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

function clone(x){ return JSON.parse(JSON.stringify(x)); }

const base = clone(hooks.getStore());
const players = [
  { id: 'p_1', name: 'Ana', nick: 'Ace', active: true, stats: {}, createdAt: 1, updatedAt: 1 },
  { id: 'p_2', name: 'Beto', nick: 'Toro', active: true, stats: {}, createdAt: 1, updatedAt: 1 },
];
hooks.setStore({ ...base, players: clone(players), sessions: [], draftSessionId: '' });

const session = hooks.createDraftSession({ date: '2026-04-14', playerIds: players.map(p => p.id) });
hooks.registerSessionPlayerMajorCombo(session, players[0].id, 'royal_flush');
hooks.registerSessionPlayerMajorCombo(session, players[0].id, 'full_house');
hooks.registerSessionPlayerMajorCombo(session, players[1].id, 'full_house');
hooks.registerSessionPlayerMajorCombo(session, players[1].id, 'full_house');
hooks.saveSession(session);

let persistedDraft = hooks.getSessionById(session.id);
if (!persistedDraft) throw new Error('draft session should persist');
if (!persistedDraft.majorCombosSummary) throw new Error('draft session should persist majorCombosSummary');
if (persistedDraft.majorCombosSummary.totalHits !== 4) throw new Error(`expected totalHits=4, got ${persistedDraft.majorCombosSummary.totalHits}`);
if ((persistedDraft.majorCombosSummary.byCombo || {}).royal_flush !== 1) throw new Error('expected royal_flush total=1 in draft summary');
if ((persistedDraft.majorCombosSummary.byCombo || {}).full_house !== 3) throw new Error('expected full_house total=3 in draft summary');
if (!Array.isArray(persistedDraft.majorCombosSummary.byPlayer) || persistedDraft.majorCombosSummary.byPlayer.length !== 2) throw new Error('expected 2 players in draft combo summary');

const reloadedStore = hooks.normalizeStoreObject(clone(hooks.getStore())).store;
hooks.setStore(reloadedStore);
let reopenedDraft = hooks.getSessionById(session.id);
if (!reopenedDraft || !reopenedDraft.majorCombosSummary) throw new Error('reopened draft should preserve major combo summary');
if (reopenedDraft.majorCombosSummary.totalHits !== 4) throw new Error('reopened draft should preserve totalHits=4');

hooks.closeSession(session.id);
const closed = hooks.getSessionById(session.id);
if (!closed || closed.status !== 'closed') throw new Error('session should close normally');
if (!closed.majorCombosSummary) throw new Error('closed session should keep major combo summary');
if (closed.majorCombosSummary.totalHits !== 4) throw new Error('closed session should keep totalHits=4');

const statsGlobal = hooks.getStore().statsGlobal || {};
const byPlayer = Array.isArray(statsGlobal.byPlayer) ? statsGlobal.byPlayer : [];
const ana = byPlayer.find(row => row.id === players[0].id);
const beto = byPlayer.find(row => row.id === players[1].id);
if (!ana || !beto) throw new Error('statsGlobal.byPlayer should contain both players after close');
if (ana.majorCombosTotal !== 2) throw new Error(`expected Ana majorCombosTotal=2, got ${ana.majorCombosTotal}`);
if ((ana.majorCombos || {}).royal_flush !== 1 || (ana.majorCombos || {}).full_house !== 1) throw new Error('Ana combo breakdown should persist into statsGlobal');
if (ana.majorComboSessions !== 1) throw new Error(`expected Ana majorComboSessions=1, got ${ana.majorComboSessions}`);
if (beto.majorCombosTotal !== 2) throw new Error(`expected Beto majorCombosTotal=2, got ${beto.majorCombosTotal}`);
if ((beto.majorCombos || {}).full_house !== 2) throw new Error('Beto combo breakdown should persist into statsGlobal');

const summaryRows = Array.isArray(statsGlobal.summaryRows) ? statsGlobal.summaryRows : [];
if (!summaryRows.length) throw new Error('statsGlobal.summaryRows should exist after close');
if (summaryRows[0].majorCombosTotal !== 4) throw new Error(`expected summaryRows[0].majorCombosTotal=4, got ${summaryRows[0].majorCombosTotal}`);
if ((summaryRows[0].majorCombosByType || {}).full_house !== 3) throw new Error('summaryRows should retain full_house aggregate');

hooks.setStore({
  ...base,
  players: clone(players),
  sessions: [{
    id: 'legacy_sess',
    status: 'closed',
    date: '2025-12-01',
    createdAt: 10,
    updatedAt: 20,
    closedAt: 20,
    playerIds: [players[0].id],
    playersSnapshot: [{ id: players[0].id, name: 'Ana', nick: 'Ace', display: 'Ace' }],
    chipsSnapshot: [],
    game: { players: [{ id: players[0].id, buyIn: 100, rebuys: [], counts: {} }] },
  }],
  draftSessionId: '',
});
const legacy = hooks.getSessionById('legacy_sess');
if (!legacy) throw new Error('legacy session should remain readable');
if (legacy.majorCombosSummary) throw new Error('legacy session without combo data should not invent majorCombosSummary');
const legacyState = hooks.ensurePlayerState(legacy, players[0].id);
const legacyCounts = hooks.getSessionPlayerMajorComboCounts(legacyState);
if (legacyCounts.royal_flush !== 0 || legacyCounts.full_house !== 0 || legacyCounts.straight_flush !== 0 || legacyCounts.four_kind !== 0) {
  throw new Error('legacy session should remain compatible and zero-safe for missing combo data');
}

console.log('test-session-major-combos-stage3-persistence=ok');
console.log('test-session-major-combos-stage3-close-consolidation=ok');
console.log('test-session-major-combos-stage3-legacy-compat=ok');
