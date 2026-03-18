const fs = require('fs');
const path = require('path');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function mustContain(haystack, needle, label){
  if (!haystack.includes(needle)) throw new Error(`missing ${label}: ${needle}`);
}

mustContain(app, 'module-hero module-hero--admin', 'Administración hero markup');
mustContain(app, 'module-hero module-hero--archivo', 'Archivo hero markup');
mustContain(app, 'assets/hero/hero_admin.svg', 'Administración hero asset wiring');
mustContain(app, 'assets/hero/hero_archivo.svg', 'Archivo hero asset wiring');
mustContain(app, 'data-go-route="/archivo/perfiles"', 'Archivo hero CTA perfiles');
mustContain(css, '.module-hero__layout', 'module hero css layout');
mustContain(css, '.module-hero__stats', 'module hero css stats');

const heroAdmin = path.join(root, 'assets/hero/hero_admin.svg');
const heroArchivo = path.join(root, 'assets/hero/hero_archivo.svg');
if (!fs.existsSync(heroAdmin)) throw new Error('hero_admin.svg should exist');
if (!fs.existsSync(heroArchivo)) throw new Error('hero_archivo.svg should exist');

console.log('test-module-heroes-markup=ok');
console.log('test-module-heroes-assets=ok');
