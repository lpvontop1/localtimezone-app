/* Helper: muat modul web di lingkungan Node (shim window bersama + GEODATA) */
'use strict';
const fs = require('fs');
const path = require('path');

const WWW = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');

/* Satu objek window bersama untuk semua modul (meniru lingkungan browser). */
const SHARED = { GEODATA: undefined };

function load(rel) {
  const src = fs.readFileSync(path.join(WWW, rel), 'utf8');
  const before = new Set(Object.keys(SHARED));
  const fn = new Function('window', 'globalThis', src);
  fn(SHARED, SHARED); // UMD akan menempel modul ke window
  const after = Object.keys(SHARED).filter(k => !before.has(k) && typeof SHARED[k] === 'object');
  if (after.length) return SHARED[after[0]];
  // fallback: modul mungkin sudah ada sebelumnya (re-require)
  for (const k of Object.keys(SHARED)) {
    if (typeof SHARED[k] === 'object' && SHARED[k] !== null) {
      // kembalikan objek yang namanya mirip file
      const stem = path.basename(rel, '.js');
      if (k.toLowerCase() === stem.toLowerCase()) return SHARED[k];
    }
  }
  return null;
}

function loadGeodata() {
  if (SHARED.GEODATA) return SHARED.GEODATA;
  const src = fs.readFileSync(path.join(WWW, 'js', 'data', 'geodata.js'), 'utf8');
  const fn = new Function('window', src);
  fn(SHARED);
  return SHARED.GEODATA;
}

let passed = 0, failed = 0;
const failures = [];
function assert(name, cond, detail) {
  if (cond) { passed++; console.log('  ✅ ' + name + (detail ? ' — ' + detail : '')); }
  else { failed++; failures.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n▶ ' + t); }
function summary(suite) {
  console.log('\n════════ ' + suite + ': ' + passed + ' lulus, ' + failed + ' gagal ════════');
  if (failed) { failures.forEach(f => console.log('  GAGAL: ' + f)); process.exitCode = 1; }
}

module.exports = { load, loadGeodata, assert, section, summary, WWW, SHARED };
