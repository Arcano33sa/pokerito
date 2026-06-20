const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    window.__dialogs.push({ title: String(title || ''), body: String(body || '') });\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  importBackupJson, buildPortableBackupPayload, normalizeStoreObject, computeAnalytics, buildMergedStoreNonDestructive,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

function makeEl(tag='div'){
  return { tagName: tag.toUpperCase(), style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {}, classList: { toggle(){}, add(){}, remove(){} }, appendChild(c){ this.children.push(c); return c; }, removeChild(c){ this.children = this.children.filter(x => x !== c); }, remove(){}, setAttribute(n,v){ this.attributes[n]=String(v); }, getAttribute(n){ return this.attributes[n] || null; }, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, blur(){}, focus(){} };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1024, clientHeight: 768 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){ if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } }; return makeEl(tag); },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
};
const windowObj = { document, navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } }, location: { hash: '', href: 'https://example.test/' }, URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval, addEventListener(){}, removeEventListener(){}, matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; }, open(){ return null; }, scrollTo(){}, print(){}, __dialogs: [], __confirmQueue: [] };
const context = { window: windowObj, document, navigator: windowObj.navigator, location: windowObj.location, localStorage: { getItem(k){ return storage.has(k) ? storage.get(k) : null; }, setItem(k,v){ storage.set(k, String(v)); }, removeItem(k){ storage.delete(k); }, key(i){ return Array.from(storage.keys())[i] || null; }, get length(){ return storage.size; } }, sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){}, key(){ return null; }, get length(){ return 0; } }, console, URLSearchParams, Blob, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(context);
vm.runInContext(code, context);

const hooks = context.window.__TEST_HOOKS;
const W = context.window;
const clone = (v) => JSON.parse(JSON.stringify(v));
const base = clone(hooks.getStore());
const chips = clone(base.chips);
const chipsSnap = chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const mkCounts = (targetId, qty) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === targetId ? qty : 0]));

const richLocalSession = {
  id: 'same_session', status: 'closed', date: '2026-06-20', createdAt: 1000, updatedAt: 9000, closedAt: 9000,
  playerIds: ['p1','p2'],
  playersSnapshot: [{ id:'p1', name:'Alpha', nick:'A', display:'A' }, { id:'p2', name:'Bravo', nick:'B', display:'B' }],
  chipsSnapshot: chipsSnap,
  game: { players: [
    { id:'p1', buyIn: 100, rebuys: [50], counts: mkCounts('chip_black', 2), majorCombos: { royal_flush: 1, straight_flush: 0, four_kind: 2, full_house: 3 } },
    { id:'p2', buyIn: 100, rebuys: [], counts: mkCounts('chip_red', 5), majorCombos: { royal_flush: 0, straight_flush: 1, four_kind: 0, full_house: 1 } },
  ]},
};
const localStore = Object.assign({}, base, {
  players: [{ id:'p1', name:'Alpha', nick:'A', active:true, stats:{} }, { id:'p2', name:'Bravo', nick:'B', active:true, stats:{} }],
  sessions: [richLocalSession],
  draftSessionId: '',
});
hooks.setStore(localStore);

const thinnerIncomingStore = Object.assign({}, base, {
  players: [{ id:'p1', name:'Alpha', nick:'A', active:true, stats:{} }],
  sessions: [{
    id: 'same_session', status: 'closed', date: '2026-06-20', createdAt: 1000, updatedAt: 12000, closedAt: 12000,
    playerIds: ['p1'],
    playersSnapshot: [{ id:'p1', name:'Alpha', nick:'A', display:'A' }],
    chipsSnapshot: chipsSnap,
    game: { players: [{ id:'p1', buyIn: 100, rebuys: [], counts: mkCounts('chip_red', 1) }] },
  }],
  draftSessionId: '',
});

(async () => {
  const preview = hooks.buildMergedStoreNonDestructive(hooks.getStore(), thinnerIncomingStore);
  if ((preview.mergedStore.players || []).length < 2) throw new Error('preview reduced local players');
  if ((preview.mergedStore.sessions || []).length !== 1) throw new Error('preview lost local session');
  const previewSession = preview.mergedStore.sessions[0];
  if ((previewSession.game.players || []).length !== 2) throw new Error('preview replaced rich local session with thinner incoming session');
  if (!previewSession.game.players[0].majorCombos || previewSession.game.players[0].majorCombos.full_house !== 3) throw new Error('preview lost majorCombos');

  W.__confirmQueue = [true, true];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(thinnerIncomingStore, 'auto')), fileName: 'thinner.json', fileSize: 123 });
  const store = hooks.getStore();
  if ((store.players || []).length < 2) throw new Error('import deleted local player');
  const session = (store.sessions || []).find(s => s.id === 'same_session');
  if (!session || (session.game.players || []).length !== 2) throw new Error('import overwrote rich local session');
  if (!session.game.players[0].majorCombos || session.game.players[0].majorCombos.full_house !== 3) throw new Error('import lost majorCombos');
  console.log('test-import-same-id-thinner-json-keeps-local=ok');
  console.log('test-import-preserves-major-combos-on-conflict=ok');
})().catch(err => { console.error(err); process.exit(1); });
