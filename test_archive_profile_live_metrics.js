const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, computeAnalytics, getArchiveProfileLiveModel, recalcAndPersistStats,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
  __dialogs: [], __confirmQueue: [],
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
const chips = clone(base.chips);
const chipsSnap = chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const chipBlack = chips.find(c => c.id === 'chip_black');
if (!chipBlack) throw new Error('missing chip_black');
const countsForValue = (amount) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === 'chip_black' ? Math.floor(amount / chipBlack.value) : 0]));

const players = [
  { id: 'p_a', name: 'Ana', nick: 'Ace', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_b', name: 'Beto', nick: 'Toro', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
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
  mkSession('s1', '2026-03-01', 1000, { p_a: 0, p_b: 200 }),
  mkSession('s2', '2026-03-08', 2000, { p_a: 250, p_b: 0 }),
  mkSession('s3', '2026-03-15', 3000, { p_a: 300, p_b: 0 }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const analytics = hooks.computeAnalytics();
const profile = hooks.getArchiveProfileLiveModel(analytics, 'p_a');
if (!profile) throw new Error('profile should exist');
if (profile.primaryName !== 'Ana') throw new Error(`expected primaryName Ana, got ${profile.primaryName}`);
if (profile.nickLabel !== 'Ace') throw new Error(`expected nickLabel Ace, got ${profile.nickLabel}`);
if (profile.games !== 3) throw new Error(`expected 3 games, got ${profile.games}`);
if (profile.rankPos !== 1) throw new Error(`expected current rank #1, got ${profile.rankPos}`);
if (profile.bestHistoricalRank !== 1) throw new Error(`expected best historical rank #1, got ${profile.bestHistoricalRank}`);
if (!profile.currentStreak || profile.currentStreak.length !== 2 || !/victorias seguidas/.test(profile.currentStreak.label)) throw new Error(`expected 2-win streak, got ${JSON.stringify(profile.currentStreak)}`);
if (!profile.trend || profile.trend.label !== 'En alza') throw new Error(`expected trend En alza, got ${profile.trend && profile.trend.label}`);
if (profile.latestSessionId !== 's3') throw new Error(`expected latest session id s3, got ${profile.latestSessionId}`);
if (!Array.isArray(profile.recentForm) || profile.recentForm.length !== 3) throw new Error('recent form should expose 3 latest sessions');
if (!profile.bestWinStreak || profile.bestWinStreak.length !== 2) throw new Error(`expected best win streak 2, got ${JSON.stringify(profile.bestWinStreak)}`);
if (!profile.bestItmStreak || profile.bestItmStreak.length !== 2) throw new Error(`expected best itm streak 2, got ${JSON.stringify(profile.bestItmStreak)}`);

console.log('test-profile-live-name-and-nick=ok');
console.log('test-profile-live-best-historical-rank=ok');
console.log('test-profile-live-current-streak=ok');
console.log('test-profile-live-trend-and-latest-session=ok');
