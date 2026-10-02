/* run-all.js — menjalankan seluruh suite test berurutan */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  'test-astro.js',
  'test-zones.js',
  'test-data.js',
  'test-prayer.js',
  'test-boundary.js',
  'test-solar.js',
  'stress-test.js',
  'blackbox-test.js',
];

let fail = 0;
console.log('══════════════ LOCALTIMEZONE-APP — TEST SUITE ══════════════');
for (const s of suites) {
  console.log('\n████ ' + s + ' ████');
  const r = spawnSync(process.execPath, ['--dns-result-order=ipv4first', path.join(__dirname, s)],
    { stdio: 'inherit', timeout: 300000 });
  if (r.status !== 0) fail++;
}
console.log('\n══════════════ HASIL AKHIR: ' + (suites.length - fail) + '/' + suites.length +
  ' suite lulus ' + (fail ? '❌' : '✅') + ' ══════════════');
process.exit(fail ? 1 : 0);
