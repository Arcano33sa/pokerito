const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, computeAnalytics, recalcAndPersistStats, getArchiveProfileLiveModel, buildMajorComboRankings, buildMajorComboRankingLookup,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(),
    style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {}, hidden: false,
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; }, hasAttribute(name){ return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, blur(){}, focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1280, clientHeight: 800 },
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
  innerWidth: 1280,
  innerHeight: 800,
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
const clone = (v) => JSON.parse(JSON.stringify(v));

const base = clone(hooks.getStore());
const chips = clone(base.chips);
const chipsSnap = chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const chipBlack = chips.find(c => c.id === 'chip_black');
if (!chipBlack) throw new Error('missing chip_black');
function countsForValue(amount){
  return Object.fromEntries(chipsSnap.map(c => [c.id, c.id === 'chip_black' ? Math.floor(Math.max(0, amount) / chipBlack.value) : 0]));
}

const players = [
  { id: 'p_a', name: 'Ana', nick: 'Ace', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_b', name: 'Beto', nick: 'Toro', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_c', name: 'Cora', nick: 'Queen', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_d', name: 'Dani', nick: 'River', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
];
const playerIds = players.map(p => p.id);

function mkSession(id, date, ts, payoutsById, comboById, opts={}){
  return {
    id,
    status: 'closed',
    date,
    createdAt: ts,
    updatedAt: ts,
    closedAt: ts,
    pdfSeq: Number(String(id).replace(/\D+/g, '')) || 0,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: {
      players: playerIds.map(pid => {
        const baseState = {
          id: pid,
          buyIn: 100,
          rebuys: [],
          counts: countsForValue(payoutsById[pid] || 0),
        };
        if (!opts.omitComboField) baseState.majorCombos = clone(comboById[pid] || {});
        return baseState;
      })
    },
  };
}

const sessions = [
  mkSession('s_001', '2026-04-10', 1000, { p_a: 300, p_b: 0, p_c: 0, p_d: 0 }, {
    p_a: { royal_flush: 1, full_house: 1 },
    p_b: { four_kind: 3 },
    p_c: { full_house: 2 },
    p_d: { full_house: 2 },
  }),
  mkSession('s_002', '2026-04-11', 2000, { p_a: 0, p_b: 300, p_c: 0, p_d: 0 }, {
    p_a: { straight_flush: 1 },
    p_b: {}, p_c: {}, p_d: {},
  }),
  mkSession('s_legacy', '2025-12-31', 3000, { p_a: 250, p_b: 50, p_c: 50, p_d: 50 }, {
    p_a: {}, p_b: {}, p_c: {}, p_d: {},
  }, { omitComboField: true }),
];

hooks.setStore({ ...base, players: clone(players), sessions: clone(sessions), draftSessionId: '' });
hooks.recalcAndPersistStats();
const analytics = hooks.computeAnalytics();
const rankings = analytics.majorComboRankings || hooks.buildMajorComboRankings(analytics);
const lookup = hooks.buildMajorComboRankingLookup(analytics);

if (!rankings || !Array.isArray(rankings.total)) throw new Error('major combo rankings should exist');
if (rankings.total.length !== 4) throw new Error(`expected 4 players in total combo ranking, got ${rankings.total.length}`);
if (rankings.total[0].id !== 'p_a') throw new Error(`expected Ana to lead total combos by stability tie-break, got ${rankings.total[0].id}`);
if (rankings.total[0].count !== 3 || rankings.total[1].id !== 'p_b' || rankings.total[1].count !== 3) throw new Error('total combo ranking should keep Ana and Beto at 3 combos each');
if (rankings.total[0].rankPos !== 1 || rankings.total[1].rankPos !== 2) throw new Error('total combo ranking should break tie by sessions and assign stable positions');

const fullHouse = rankings.byCombo && rankings.byCombo.full_house;
if (!Array.isArray(fullHouse) || fullHouse.length !== 3) throw new Error('full house ranking should exist with 3 players');
if (fullHouse[0].id !== 'p_c' || fullHouse[1].id !== 'p_d') throw new Error('full house ranking should be led by Cora and Dani');
if (fullHouse[0].rankPos !== 1 || fullHouse[1].rankPos !== 1) throw new Error('full house tied leaders should share rank #1');
if (fullHouse[2].id !== 'p_a' || fullHouse[2].rankPos !== 3) throw new Error('Ana should appear after the shared full house leaders');

const royal = rankings.byCombo.royal_flush;
if (royal.length !== 1 || royal[0].id !== 'p_a' || royal[0].count !== 1) throw new Error('royal flush ranking should only include Ana');
const straight = rankings.byCombo.straight_flush;
if (straight.length !== 1 || straight[0].id !== 'p_a' || straight[0].count !== 1) throw new Error('straight flush ranking should only include Ana');
const poker = rankings.byCombo.four_kind;
if (poker.length !== 1 || poker[0].id !== 'p_b' || poker[0].count !== 3) throw new Error('poker ranking should only include Beto');

const profileA = hooks.getArchiveProfileLiveModel(analytics, 'p_a');
const profileB = hooks.getArchiveProfileLiveModel(analytics, 'p_b');
const profileLegacySafe = hooks.getArchiveProfileLiveModel(analytics, 'p_c');
if (!profileA || !profileB || !profileLegacySafe) throw new Error('profiles should still resolve after combo rankings');
if (!profileA.majorComboRanks || profileA.majorComboRanks.total !== 1) throw new Error('Ana profile should expose total combo rank #1');
if ((profileA.majorComboRanks.byCombo || {}).royal_flush !== 1) throw new Error('Ana profile should expose royal flush rank #1');
if (!profileB.majorComboRanks || profileB.majorComboRanks.total !== 2) throw new Error('Beto profile should expose total combo rank #2');
if ((profileB.majorComboRanks.byCombo || {}).four_kind !== 1) throw new Error('Beto profile should expose poker rank #1');
if ((profileLegacySafe.majorCombos || {}).royal_flush !== 0) throw new Error('legacy-safe profile should keep zero combo counts when session data lacked the field');

const legacySummary = analytics.summaryRows.find(row => row.sessionId === 's_legacy');
if (!legacySummary) throw new Error('legacy session should still be included in summaryRows');
if (legacySummary.majorCombosTotal !== 0) throw new Error('legacy session without combo field should stay at 0 combos');
if (!lookup.has('p_a') || lookup.get('p_a').total !== 1) throw new Error('major combo ranking lookup should expose Ana total rank');
if ((lookup.get('p_c').byCombo || {}).full_house !== 1 || (lookup.get('p_d').byCombo || {}).full_house !== 1) throw new Error('lookup should preserve shared full house rank');

console.log('test-session-major-combos-stage5-total-ranking=ok');
console.log('test-session-major-combos-stage5-by-combo-ranking=ok');
console.log('test-session-major-combos-stage5-profile-rank-links=ok');
console.log('test-session-major-combos-stage5-legacy-compat=ok');
