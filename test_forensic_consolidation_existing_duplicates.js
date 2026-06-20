const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, computeAnalytics, remapStoreCanonicalPlayerReferences, applyStartupForensicSelfHeal, rebuildStoreDerivedData,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
  createElement(tag){
    if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } };
    return makeEl(tag);
  },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
};
const windowObj = {
  document,
  navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } },
  location: { hash: '', href: 'https://example.test/' },
  URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(){}, removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
  open(){ return null; }, scrollTo(){}, print(){}, __dialogs: [], __confirmQueue: [],
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
const mkCounts = (targetId, qty) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === targetId ? qty : 0]));

const broken = Object.assign({}, base, {
  players: [
    { id: 'p_canon', name: 'José Mono', nick: 'Mono', active: true, stats: { games: 1 }, createdAt: 1000, updatedAt: 2000 },
    { id: 'p_dup', name: 'Jose Mono', nick: 'Mono', active: true, stats: { games: 1 }, createdAt: 3000, updatedAt: 4000 },
  ],
  sessions: [
    {
      id: 'sess_1', status: 'closed', date: '2026-03-01', createdAt: 2000, updatedAt: 3000, closedAt: 3000,
      playerIds: ['p_canon'],
      playersSnapshot: [{ id: 'p_canon', name: 'José Mono', nick: 'Mono', display: 'Mono' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_canon', buyIn: 100, rebuys: [], counts: mkCounts('chip_black', 1) }] }
    },
    {
      id: 'sess_2', status: 'closed', date: '2026-03-02', createdAt: 4000, updatedAt: 5000, closedAt: 5000,
      playerIds: ['p_dup'],
      playersSnapshot: [{ id: 'p_dup', name: 'Jose Mono', nick: 'Mono', display: 'Mono' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_dup', buyIn: 100, rebuys: [50], counts: mkCounts('chip_red', 2) }] }
    }
  ],
  draftSessionId: '',
});

hooks.setStore(broken);

const preview = hooks.remapStoreCanonicalPlayerReferences(clone(hooks.getStore()));
if (!preview || !preview.store) throw new Error('preview missing');
if (preview.summary.groups !== 1) throw new Error('expected one strong consolidation group');
if (preview.summary.playersCollapsed !== 1) throw new Error('expected one player card collapsed');
if ((preview.store.players || []).length !== 1) throw new Error('preview should collapse duplicate player cards');
const remappedSession = (preview.store.sessions || []).find(s => s.id === 'sess_2');
if (!remappedSession) throw new Error('remapped session missing');
if (String(remappedSession.playerIds[0]) !== 'p_canon') throw new Error('preview should remap duplicate session to canonical player');

const healed = hooks.applyStartupForensicSelfHeal(clone(broken));
if ((healed.players || []).length !== 2) throw new Error('startup safe heal must not delete/collapse player cards');
if ((healed.sessions || []).length !== 2) throw new Error('startup safe heal must not delete sessions');
if (healed.ui && healed.ui.startupForensicSelfHeal) throw new Error('startup safe heal should not apply destructive consolidation summary');

console.log('test-forensic-preview-can-still-detect-duplicates=ok');
console.log('test-startup-safe-heal-does-not-delete-data=ok');
