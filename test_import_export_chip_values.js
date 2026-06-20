const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    window.__dialogs.push({ title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger });\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
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

const customizedChips = clone(base.chips).map((chip, index) => Object.assign({}, chip, {
  value: ({ chip_white: 10, chip_red: 25, chip_green: 50, chip_black: 1000, chip_blue: 5000 })[chip.id] || chip.value,
  updatedAt: 1000 + index,
  createdAt: 500,
}));
const incomingStore = Object.assign({}, base, {
  chips: customizedChips,
  players: [],
  sessions: [],
  createdAt: 500,
  updatedAt: 1500,
});

(async () => {
  // Instalación local fresca: sus fichas predeterminadas tienen updatedAt más reciente que el respaldo.
  const freshLocal = clone(hooks.getStore());
  if (!freshLocal.chips.some(c => c.id === 'chip_red' && c.value === 5)) throw new Error('fresh default chip baseline invalid');

  const preview = hooks.buildMergedStoreNonDestructive(freshLocal, incomingStore);
  const previewRed = (preview.mergedStore.chips || []).find(c => c.id === 'chip_red');
  if (!previewRed || previewRed.value !== 25) throw new Error('preview did not preserve imported custom red chip value');

  W.__confirmQueue = [true, true];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(incomingStore, 'auto')), fileName: 'chips-custom.json', fileSize: 123 });

  const imported = hooks.getStore();
  const byId = new Map((imported.chips || []).map(c => [c.id, c]));
  if (!byId.get('chip_white') || byId.get('chip_white').value !== 10) throw new Error('import lost custom white chip value');
  if (!byId.get('chip_red') || byId.get('chip_red').value !== 25) throw new Error('import lost custom red chip value');
  if (!byId.get('chip_green') || byId.get('chip_green').value !== 50) throw new Error('import lost custom green chip value');
  if (!byId.get('chip_black') || byId.get('chip_black').value !== 1000) throw new Error('import lost custom black chip value');
  if (!byId.get('chip_blue') || byId.get('chip_blue').value !== 5000) throw new Error('import lost custom blue chip value');

  const exportedAfterImport = hooks.buildPortableBackupPayload(imported, 'auto');
  const exportedChips = (((exportedAfterImport || {}).data || {}).source || {}).store.chips || [];
  const exportedById = new Map(exportedChips.map(c => [c.id, c]));
  if (!exportedById.get('chip_red') || exportedById.get('chip_red').value !== 25) throw new Error('export after import did not preserve custom red chip value');
  if (!exportedById.get('chip_blue') || exportedById.get('chip_blue').value !== 5000) throw new Error('export after import did not preserve custom blue chip value');

  console.log('test-import-preserves-custom-chip-values-over-fresh-defaults=ok');
  console.log('test-export-after-import-preserves-custom-chip-values=ok');
})().catch(err => { console.error(err); process.exit(1); });
