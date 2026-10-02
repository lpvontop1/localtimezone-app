/* ============================================================
 * test-data.js — Integritas dataset kecamatan
 * ============================================================ */
'use strict';
const { loadGeodata, assert, section, summary } = require('./helper');
const G = loadGeodata();

section('Struktur dasar');
assert('Dataset dimuat', !!G && Array.isArray(G.kec));
assert('Jumlah kecamatan ≥ 6.500', G.kec.length >= 6500, G.kec.length + ' kecamatan');
assert('38 provinsi', G.provinces.length === 38, G.provinces.length + ' provinsi');
assert('Kabupaten/kota ≥ 400', G.kab.length >= 400, G.kab.length + ' kab/kota');

section('Validasi setiap baris (6.900+ baris)');
let badCoord = 0, badIdx = 0, badName = 0;
for (const k of G.kec) {
  const [name, ki, pi, la, lo] = k;
  if (!name || name.length < 2 || name.length > 60) badName++;
  if (!(la >= -11.5 && la <= 7.0 && lo >= 94.0 && lo <= 141.2)) badCoord++;
  if (!(Number.isInteger(ki) && ki >= 0 && ki < G.kab.length)) badIdx++;
  if (!(Number.isInteger(pi) && pi >= 0 && pi < G.provinces.length)) badIdx++;
}
assert('Semua koordinat dalam bbox Indonesia', badCoord === 0, badCoord + ' anomali');
assert('Semua indeks kab/prov valid', badIdx === 0, badIdx + ' anomali');
assert('Semua nama valid', badName === 0, badName + ' anomali');

section('Sampel kota besar (koordinat ±0,5°)');
const samples = [
  ['Menteng', 'DKI Jakarta', -6.2, 106.8],
  ['Kuta', 'Bali', -8.7, 115.17],
  ['Larangan', 'Banten', -6.28, 106.72],
  ['Makassar', null, -5.14, 119.42], // kecamatan Ujung Tanah/Wajo dkk — cari apapun 'Makassar'
];
{
  const m = G.kec.find(k => k[0] === 'Menteng');
  assert('Menteng ada & dekat koordinat benar', !!m && Math.abs(m[3] + 6.1944) < 0.01 && Math.abs(m[4] - 106.8333) < 0.01,
    m ? m[3] + ',' + m[4] : 'tidak ada');
  const pM = G.provinces[m[2]];
  assert('Menteng di DKI Jakarta', pM === 'DKI Jakarta', pM);
  const kM = G.kab[m[1]];
  assert('Menteng di Jakarta Pusat', /Jakarta Pusat/.test(kM), kM);
}

section('Distribusi provinsi');
{
  const cnt = new Array(G.provinces.length).fill(0);
  for (const k of G.kec) cnt[k[2]]++;
  const min = Math.min(...cnt), max = Math.max(...cnt);
  assert('Setiap provinsi ≥ 5 kecamatan', min >= 5, 'min=' + min + ' max=' + max);
  assert('Jawa Barat provinsi terpadat (≥ 500)',
    cnt[G.provinces.indexOf('Jawa Barat')] >= 500, 'Jabar=' + cnt[G.provinces.indexOf('Jawa Barat')]);
}

summary('test-data.js');
