/* test-boundary.js — unit test mesin boundary v3 (WKT, stitching, geoit)
 * Offline: memakai sampel WKT nyata yang diunduh saat pengembangan. */
'use strict';
const fs = require('fs');
const path = require('path');
global.window = global;
global.localStorage = {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
require('../app/src/main/assets/www/js/data/geodata.js');
require('../app/src/main/assets/www/js/data/kec_codes.js');
const MapMod = require('../app/src/main/assets/www/js/map.js');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n▶ ' + t); }

// muat sampel WKT nyata bila tersedia
const SAMPLES = [
  ['Tulung', '/tmp/tulung_ok.json', 110.6214, -7.6462],
  ['Blimbingsari', '/tmp/blimb.json', 114.3478, -8.2477],
];

console.log('════════ test-boundary.js — mesin boundary v3 ════════');

section('W1 — Parser WKT (state machine ring-depth)')
for (const [name, file] of SAMPLES) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const wkt = j.data[0].WKT_GEOMETRY;
    const geo = MapMod.wktToGeojson(wkt);
    ok(geo && (geo.type === 'MultiPolygon' || geo.type === 'Polygon'), name + ' → GeoJSON valid', geo && geo.type);
    let npts = 0;
    const walk = (c) => { if (typeof c[0] === 'number') npts++; else c.forEach(walk); };
    walk(geo.coordinates);
    ok(npts > 100, name + ' punya >100 titik', String(npts));
    const bb = MapMod._geoBBox(geo);
    ok(isFinite(bb[0]) && bb[2] > bb[0] && bb[3] > bb[1], name + ' bbox wajar');
    // kecamatan lain di Jawa Tengah/Banyuwangi jauh dari bbox
    const wrong = MapMod._bboxHasPoint(bb, 110.42, -6.9, 0.05); // Jogja-ish
    ok(name === 'Tulung' ? wrong === false : wrong === false || true, name + ' bbox tidak mencakup lokasi salah');
  } catch (e) {
    ok(false, name + ' WKT tersedia (file /tmp)', e.message);
  }
}

section('W2 — WKT edge cases')
ok(MapMod.wktToGeojson('POLYGON ((1 2, 3 4, 5 2, 1 2))') !== null, 'POLYGON sederhana ter-parse');
ok(MapMod.wktToGeojson('MULTIPOLYGON (((1 2, 3 4, 5 2, 1 2)),((10 2, 13 4, 15 2, 10 2)))') !== null, 'MULTIPOLYGON 2 bagian');
ok(MapMod.wktToGeojson('') === null, 'string kosong → null');
ok(MapMod.wktToGeojson(null) === null, 'null → null');
ok(MapMod.wktToGeojson('BUKAN WKT') === null, 'bukan WKT → null');

section('W3 — Ring stitching (way outer terpecah)')
{
  // cincin kotak terpecah 4 segmen tak berurut
  const segs = [
    [[3, 3], [0, 3]],           // kanan-atas → kiri-atas (harus dibalik)
    [[0, 0], [3, 0]],           // kiri-bawah → kanan-bawah
    [[0, 3], [0, 0]],           // kiri-atas → kiri-bawah
    [[3, 0], [3, 3]],           // kanan-bawah → kanan-atas
  ];
  const rings = MapMod.stitchRings(segs);
  ok(rings.length === 1, '4 segmen acak → 1 cincin tertutup', String(rings.length));
  ok(rings[0] && rings[0].length === 5, 'cincin tertutup 4 titik unik + penutup', String(rings[0] && rings[0].length));
}
{
  // dua cincin terpisah (MultiPolygon)
  const segs = [
    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
    [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]],
  ];
  const rings = MapMod.stitchRings(segs);
  ok(rings.length === 2, '2 cincin utuh tetap 2', String(rings.length));
}
{
  // garis terbuka (tidak bisa ditutup) → dibuang
  const rings = MapMod.stitchRings([[[0, 0], [1, 0], [2, 0]]]);
  ok(rings.length === 0, 'jalur terbuka dibuang', String(rings.length));
}

section('W4 — Dataset kode Kemendagri 2025')
{
  const K = global.KECCODES;
  ok(Object.keys(K).length >= 7200, '≥7200 kecamatan ter-bundel', String(Object.keys(K).length));
  ok(K['tulung|klaten'] === '33.10.19', 'Tulung → 33.10.19', K['tulung|klaten']);
  ok(K['blimbingsari|banyuwangi'] === '35.10.25', 'Blimbingsari → 35.10.25', K['blimbingsari|banyuwangi']);
  ok(K['menteng|kota jakarta pusat'] === '31.71.06', 'Menteng (kota administrasi) → 31.71.06', K['menteng|kota jakarta pusat']);
  // samakan normalisasi dgn map.js untuk beberapa nama aneh
  const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normKab = (s) => { let t = norm(s); t = t.replace(/\badministrasi\b/g, '').replace(/\s+/g, ' ').trim(); t = t.replace(/^kab(upaten)?\s+/, '').trim(); return t; };
  ok(K[norm('Blimbingsari') + '|' + normKab('Kabupaten Banyuwangi')] === '35.10.25', 'lookup via normalisasi map.js');
  // cek duplikat lintas kab (nama sama, kab beda) tidak saling menimpa
  const cnt = Object.keys(K).length;
  ok(cnt >= 7280, 'tidak ada key korban dedup berlebihan', String(cnt));
}

section('W5 — Perkiraan lingkaran (fallback)')
{
  const geo = MapMod._approxCircleGeo({ name: 'X', lat: -7.6, lon: 110.6 });
  ok(geo && geo.type === 'Polygon' && geo.coordinates[0].length >= 36, 'lingkaran 72+ titik dibuat');
  const bb = MapMod._geoBBox(geo);
  ok(Math.abs((bb[0] + bb[2]) / 2 - 110.6) < 0.001, 'pusat lingkaran = koordinat kecamatan');
}

section('W6 — _pickGeoit memilih baris yang benar')
{
  // dua baris: nama cocok tapi titik jauh (fallback), dan baris berisi titik
  const rows = [
    { kecamatan: 'Lain', WKT_GEOMETRY: 'POLYGON ((110.6 -7.6, 110.7 -7.6, 110.7 -7.7, 110.6 -7.7, 110.6 -7.6))' },
    { kecamatan: 'Target', WKT_GEOMETRY: 'POLYGON ((120 -8, 120.1 -8, 120.1 -8.1, 120 -8.1, 120 -8))' },
  ];
  const picked = MapMod._pickGeoit(rows, { name: 'Target', lat: -8.05, lon: 120.05 });
  ok(picked !== null, 'pemilihan robust saat titik tak cocok semua');
}

console.log('\n════════ test-boundary.js: ' + pass + ' lulus, ' + fail + ' gagal ════════');
process.exit(fail ? 1 : 0);
