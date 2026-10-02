/* ============================================================
 * test-zones.js — Pemetaan 38 provinsi → zona legal & heuristik bujur
 * ============================================================ */
'use strict';
const { load, loadGeodata, assert, section, summary } = require('./helper');
const Zones = load('js/zones.js');
const G = loadGeodata();

section('Pemetaan provinsi resmi (Keppres 41/1987)');
const wib = ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi',
  'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung', 'Banten',
  'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Kalimantan Barat'];
const wita = ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Tengah',
  'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara', 'Gorontalo',
  'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara'];
const wit = ['Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Barat Daya',
  'Papua Tengah', 'Papua Selatan', 'Papua Pegunungan'];

for (const p of wib) assert('WIB: ' + p, Zones.zoneByProvince(p) === Zones.ZONES.WIB);
for (const p of wita) assert('WITA: ' + p, Zones.zoneByProvince(p) === Zones.ZONES.WITA);
for (const p of wit) assert('WIT: ' + p, Zones.zoneByProvince(p) === Zones.ZONES.WIT);
assert('Total provinsi terpetakan = 38', Object.keys(Zones.PROV_ZONE).length === 38);

section('Heuristik bujur (fallback GPS offline)');
assert('Banda Aceh (5.5, 95.3) → WIB', Zones.zoneByCoord(5.5, 95.3) === Zones.ZONES.WIB);
assert('Jakarta (-6.2, 106.8) → WIB', Zones.zoneByCoord(-6.2, 106.8) === Zones.ZONES.WIB);
assert('Surabaya (-7.3, 112.75) → WIB', Zones.zoneByCoord(-7.3, 112.75) === Zones.ZONES.WIB);
assert('Banyuwangi (-8.2, 114.36) → WIB', Zones.zoneByCoord(-8.2, 114.36) === Zones.ZONES.WIB);
assert('Denpasar (-8.65, 115.2) → WITA', Zones.zoneByCoord(-8.65, 115.2) === Zones.ZONES.WITA);
assert('Palangka Raya (-2.2, 113.9) → WITA', Zones.zoneByCoord(-2.2, 113.9) === Zones.ZONES.WITA);
assert('Makassar (-5.1, 119.4) → WITA', Zones.zoneByCoord(-5.1, 119.4) === Zones.ZONES.WITA);
assert('Ambon (-3.7, 128.2) → WIT', Zones.zoneByCoord(-3.7, 128.2) === Zones.ZONES.WIT);
assert('Jayapura (-2.5, 140.7) → WIT', Zones.zoneByCoord(-2.5, 140.7) === Zones.ZONES.WIT);

section('Format tanggal Indonesia');
{
  const d = new Date(Date.UTC(2026, 9, 2, 4, 0, 0)); // Jumat 2 Okt 2026 11:00 WIB
  assert('formatDateID', Zones.formatDateID(d, 7) === 'Jumat, 2 Oktober 2026',
    Zones.formatDateID(d, 7));
  assert('formatDateShortID', Zones.formatDateShortID(d, 7) === '2 Okt 2026');
}

section('Konsistensi data ↔ zona: kecamatan di dataset terpetakan semua');
{
  let unmapped = 0;
  for (const k of G.kec) {
    const z = Zones.zoneByProvince(G.provinces[k[2]]);
    if (!z) unmapped++;
  }
  assert('0 kecamatan tak terpetakan', unmapped === 0, unmapped + ' gagal');
}

summary('test-zones.js');
