const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, buildPortableBackupPayload, buildMergedStoreNonDestructive, normalizeMajorCombos, majorCombosHtml, majorCombosSummary,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(), style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {},
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
const storeWithCombos = Object.assign({}, base, {
  players: [{ id: 'p1', name: 'Jugador Uno', nick: 'Uno', active: true, stats: {}, createdAt: 1, updatedAt: 1 }],
  sessions: [{
    id: 's1', status: 'draft', date: '2026-06-20', createdAt: 10, updatedAt: 11,
    playerIds: ['p1'],
    playersSnapshot: [{ id: 'p1', name: 'Jugador Uno', nick: 'Uno', display: 'Uno' }],
    chipsSnapshot: [chip],
    game: { players: [{ id: 'p1', buyIn: '100', rebuys: ['50'], counts: { [chip.id]: '3' }, majorCombos: { royal_flush: '1', straight_flush: null, four_kind: 2 } }] },
  }],
  draftSessionId: 's1',
});
const normalized = hooks.setStore(storeWithCombos);
const playerState = normalized.sessions[0].game.players[0];
if (!playerState.majorCombos) throw new Error('majorCombos missing after normalize');
if (playerState.majorCombos.royal_flush !== 1) throw new Error('royal_flush should normalize to 1');
if (playerState.majorCombos.straight_flush !== 0) throw new Error('straight_flush should default to 0');
if (playerState.majorCombos.four_kind !== 2) throw new Error('four_kind should normalize to 2');
if (playerState.majorCombos.full_house !== 0) throw new Error('full_house should default to 0');

const html = hooks.majorCombosHtml(playerState.majorCombos, true);
['Combinaciones Mayores', 'Escalera real', 'Escalera de color', 'Póker', 'Full house', 'comboAccept'].forEach(txt => {
  if (!String(html).includes(txt)) throw new Error('major combo UI missing ' + txt);
});
if (!hooks.majorCombosSummary(playerState.majorCombos).includes('Escalera real: 1')) throw new Error('summary should include royal flush count');

const payload = hooks.buildPortableBackupPayload(clone(normalized), 'auto');
const exportedState = payload.data.source.store.sessions[0].game.players[0];
if (!exportedState.majorCombos || exportedState.majorCombos.four_kind !== 2) throw new Error('export should preserve majorCombos');

const oldStore = clone(normalized);
delete oldStore.sessions[0].game.players[0].majorCombos;
const oldNormalized = hooks.normalizeStoreObject(oldStore).store;
const oldState = oldNormalized.sessions[0].game.players[0];
if (!oldState.majorCombos || oldState.majorCombos.full_house !== 0) throw new Error('old sessions without majorCombos should be backfilled safely');

console.log('test-major-combos-normalize=ok');
console.log('test-major-combos-ui-markup=ok');
console.log('test-major-combos-json-preserve=ok');
console.log('test-major-combos-old-json-safe=ok');
