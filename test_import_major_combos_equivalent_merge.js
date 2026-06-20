const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    window.__dialogs.push({ title: String(title || ''), body: String(body || '') });\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  importBackupJson, buildPortableBackupPayload, normalizeStoreObject, buildMergedStoreNonDestructive,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
const chipsSnap = clone(base.chips).map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const mkCounts = (targetId, qty) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === targetId ? qty : 0]));

function makeSession(id, combos){
  return {
    id, status: 'closed', date: '2026-06-20', createdAt: 1000, updatedAt: 2000, closedAt: 2000,
    playerIds: ['p1','p2'],
    playersSnapshot: [{ id:'p1', name:'Alpha', nick:'A', display:'A' }, { id:'p2', name:'Bravo', nick:'B', display:'B' }],
    chipsSnapshot: chipsSnap,
    game: { players: [
      { id:'p1', buyIn: 100, rebuys: [50], counts: mkCounts('chip_black', 2), majorCombos: combos && combos.p1 },
      { id:'p2', buyIn: 100, rebuys: [], counts: mkCounts('chip_red', 5), majorCombos: combos && combos.p2 },
    ]},
  };
}

(async () => {
  const localSession = makeSession('local_same_id', null);
  const incomingSession = makeSession('local_same_id', { p1: { royal_flush: 1, straight_flush: 0, four_kind: 2, full_house: 0 }, p2: { royal_flush: 0, straight_flush: 1, four_kind: 0, full_house: 3 } });
  const localStore = Object.assign({}, base, {
    players: [{ id:'p1', name:'Alpha', nick:'A', active:true, stats:{} }, { id:'p2', name:'Bravo', nick:'B', active:true, stats:{} }],
    sessions: [localSession], draftSessionId: '',
  });
  hooks.setStore(localStore);

  const incomingStore = Object.assign({}, base, { players: clone(localStore.players), sessions: [incomingSession], draftSessionId: '' });
  const preview = hooks.buildMergedStoreNonDestructive(hooks.getStore(), incomingStore);
  if (preview.summary.sessionsUpdated !== 1) throw new Error('equivalent same-id session with majorCombos should update');
  if (preview.summary.duplicatesSkipped !== 0) throw new Error('equivalent same-id session with new majorCombos should not be skipped');
  const previewSession = preview.mergedStore.sessions[0];
  if (previewSession.game.players[0].buyIn !== 100) throw new Error('buyIn changed');
  if (previewSession.game.players[0].rebuys.length !== 1 || previewSession.game.players[0].rebuys[0] !== 50) throw new Error('rebuys changed');
  if (previewSession.game.players[0].counts.chip_black !== 2) throw new Error('counts changed');
  if (previewSession.game.players[0].majorCombos.four_kind !== 2) throw new Error('majorCombos not integrated');
  if (!previewSession.majorCombosSummary || previewSession.majorCombosSummary.totalRegistradas !== 7) throw new Error('majorCombosSummary not generated');

  W.__confirmQueue = [true, true];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(incomingStore, 'auto')), fileName: 'combos.json', fileSize: 123 });
  const applied = hooks.getStore().sessions[0];
  if (applied.game.players[1].majorCombos.full_house !== 3) throw new Error('applied import lost incoming majorCombos');
  const exported = hooks.buildPortableBackupPayload(hooks.getStore(), 'auto');
  const exportedSession = exported.data.source.store.sessions[0];
  if (!exportedSession.game.players[0].majorCombos || exportedSession.game.players[0].majorCombos.royal_flush !== 1) throw new Error('export lost majorCombos after import');
  if (!exportedSession.majorCombosSummary || exportedSession.majorCombosSummary.totalRegistradas !== 7) throw new Error('export lost majorCombosSummary after import');

  const localDifferentId = makeSession('local_diff_id', null);
  const incomingDifferentId = makeSession('incoming_diff_id', { p1: { royal_flush: 0, straight_flush: 1, four_kind: 0, full_house: 1 }, p2: { royal_flush: 0, straight_flush: 0, four_kind: 1, full_house: 0 } });
  hooks.setStore(Object.assign({}, base, { players: clone(localStore.players), sessions: [localDifferentId], draftSessionId: '' }));
  const diffPreview = hooks.buildMergedStoreNonDestructive(hooks.getStore(), Object.assign({}, base, { players: clone(localStore.players), sessions: [incomingDifferentId], draftSessionId: '' }));
  if (diffPreview.mergedStore.sessions.length !== 1) throw new Error('equivalent different-id session duplicated');
  if (diffPreview.summary.sessionsUpdated !== 1) throw new Error('equivalent different-id session with majorCombos should update');
  if (diffPreview.mergedStore.sessions[0].id !== 'local_diff_id') throw new Error('local session id should be preserved');
  if (diffPreview.mergedStore.sessions[0].game.players[0].majorCombos.full_house !== 1) throw new Error('different-id majorCombos not merged');

  const oldPreview = hooks.buildMergedStoreNonDestructive(diffPreview.mergedStore, Object.assign({}, base, { players: clone(localStore.players), sessions: [makeSession('incoming_old_no_combos', null)], draftSessionId: '' }));
  if (oldPreview.mergedStore.sessions[0].game.players[0].majorCombos.full_house !== 1) throw new Error('old JSON without majorCombos erased local majorCombos');

  console.log('test-import-equivalent-major-combos-same-id=ok');
  console.log('test-import-equivalent-major-combos-different-id=ok');
  console.log('test-import-major-combos-export-after-import=ok');
  console.log('test-import-old-json-keeps-local-major-combos=ok');
})().catch(err => { console.error(err); process.exit(1); });
