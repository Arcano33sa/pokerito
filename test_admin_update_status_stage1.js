const fs = require('fs');
const path = require('path');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function mustContain(haystack, needle, label){
  if (!haystack.includes(needle)) throw new Error(`missing ${label}: ${needle}`);
}

mustContain(app, 'id="adminUpdateSection"', 'admin update section markup');
mustContain(app, 'id="checkUpdateBtn"', 'check update button');
mustContain(app, "const UPDATE_UI_KEY = 'pokerito_update_ui';", 'update ui storage key');
mustContain(app, "const UPDATE_BOOT_KEY = 'pokerito_update_boot';", 'update boot storage key');
mustContain(app, 'async function checkForAppUpdate()', 'update check flow');
mustContain(app, 'async function applyAppUpdate()', 'real update apply flow');
mustContain(app, "button: 'Actualizar ahora'", 'available update button copy');
mustContain(app, "hydratePostUpdateUiState();", 'post-update hydrate on boot');
mustContain(app, "persistUpdateBootMark({", 'post-update boot mark persistence');
mustContain(app, 'stateObj.state === \'available\' ? applyAppUpdate() : checkForAppUpdate()', 'single smart button switch');
mustContain(app, "worker.postMessage({ type: 'POKERITO_SKIP_WAITING' });", 'waiting worker activation message');
mustContain(css, '.admin-update-strip{', 'admin update layout css');
mustContain(css, '.admin-update-pill.is-success{', 'admin update success pill css');
mustContain(css, '.admin-update-panel .panel-head{', 'admin update panel head polish css');
if (!/const CACHE_NAME = 'pokerito-v0\.1\.51-pdf-editorial-(?:fragmentation-stage2|final-stage3)';/.test(sw)) throw new Error('missing service worker cache bump');
mustContain(sw, "data.type === 'POKERITO_SKIP_WAITING'", 'service worker skip waiting message hook');

console.log('test-admin-update-section=ok');
console.log('test-admin-update-smart-button=ok');
console.log('test-admin-update-apply-flow=ok');
console.log('test-admin-update-post-reload-state=ok');
console.log('test-admin-update-cache-bump=ok');
