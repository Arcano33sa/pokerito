const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, createDraftSession, ensureSessionRosterIntegrity, ensurePlayerState,\n  registerSessionPlayerMajorCombo, getSessionPlayerMajorComboCounts,\n  adjustSessionPlayerMajorCombo, setSessionPlayerMajorComboCount,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
const anaId = players[0].id;

let result = hooks.registerSessionPlayerMajorCombo(session, anaId, 'royal_flush');
if (!result.ok) throw new Error('royal_flush should register');
result = hooks.adjustSessionPlayerMajorCombo(session, anaId, 'royal_flush', 2);
if (!result.ok) throw new Error('royal_flush should increment by delta');
result = hooks.adjustSessionPlayerMajorCombo(session, anaId, 'royal_flush', -1);
if (!result.ok) throw new Error('royal_flush should decrement by delta');
result = hooks.adjustSessionPlayerMajorCombo(session, anaId, 'royal_flush', -99);
if (!result.ok) throw new Error('royal_flush should clamp to zero on large decrement');

let counts = hooks.getSessionPlayerMajorComboCounts(hooks.ensurePlayerState(session, anaId));
if (counts.royal_flush !== 0) throw new Error(`expected royal_flush=0 after clamp, got ${counts.royal_flush}`);

result = hooks.setSessionPlayerMajorComboCount(session, anaId, 'full_house', 7.9);
if (!result.ok) throw new Error('full_house should accept explicit set');
result = hooks.setSessionPlayerMajorComboCount(session, anaId, 'four_kind', -4);
if (!result.ok) throw new Error('four_kind should accept explicit set and clamp');
counts = hooks.getSessionPlayerMajorComboCounts(hooks.ensurePlayerState(session, anaId));
if (counts.full_house !== 7) throw new Error(`expected full_house=7 after floor, got ${counts.full_house}`);
if (counts.four_kind !== 0) throw new Error(`expected four_kind=0 after negative clamp, got ${counts.four_kind}`);

const invalidAdjust = hooks.adjustSessionPlayerMajorCombo(session, anaId, 'carta alta', 1);
if (invalidAdjust.ok) throw new Error('invalid adjust should fail');
const invalidSet = hooks.setSessionPlayerMajorComboCount(session, anaId, 'carta alta', 3);
if (invalidSet.ok) throw new Error('invalid set should fail');

console.log('test-session-major-combos-edit-delta=ok');
console.log('test-session-major-combos-edit-floor-clamp=ok');
console.log('test-session-major-combos-edit-invalid-rejected=ok');
