/* ============================================================
 * stress-test.js — Uji beban & kinerja mesin perhitungan
 * Target kinerja (referensi: perangkat Android kelas bawah ~5× lebih
 * lambat dari Node di mesin ini):
 *  S1  6.916 kecamatan × 1 hari (astro + 6 waktu sholat)     < 4 detik
 *  S2  6.916 kecamatan × 365 hari (EoT + waktu matahari)     < 20 detik
 *  S3  25 kecamatan × 365 hari × 6 waktu sholat (prediksi)   < 3 detik
 *  S4  Autocomplete 5.000 kueri acak                         < 2 detik total
 *  S5  Tick UI (renderHome lengkap)                          < 5 ms/panggilan
 * ============================================================ */
'use strict';
const { load, loadGeodata } = require('./helper');
const Astro = load('js/astro.js');
const Prayer = load('js/prayer.js');
const Zones = load('js/zones.js');
const MapMod = load('js/map.js');

const G = loadGeodata();
let failed = false;
function check(name, ok, detail) {
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + ' — ' + detail);
  if (!ok) failed = true;
}
const fmt = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : ms.toFixed(0) + ' ms');

console.log('▶ S1: 6.916 kecamatan × 1 hari (astro + sholat lengkap)');
{
  const t0 = process.hrtime.bigint();
  let sink = 0;
  for (const [name, ki, pi, la, lo] of G.kec) {
    const z = Zones.zoneByProvince(G.provinces[pi]) || Zones.zoneByCoord(la, lo);
    const t = Prayer.prayerTimes(new Date(), la, lo, z.offset);
    const st = Astro.sunTimes(new Date(), la, lo, z.offset);
    const tst = Astro.trueSolarTimeMinutes(new Date(), lo);
    sink += t.dhuhr + (st ? st.dayLength : 0) + tst;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('S1 total', ms < 4000, fmt(ms) + ' (sink=' + sink.toFixed(0) + ')');
}

console.log('▶ S2: 6.916 kecamatan × 365 hari (EoT + waktu matahari sejati) = 2.524.340 hitungan');
{
  const t0 = process.hrtime.bigint();
  let sink = 0;
  const base = Date.UTC(2026, 0, 1, 12);
  for (let i = 0; i < G.kec.length; i++) {
    const lo = G.kec[i][4];
    for (let doy = 0; doy < 365; doy++) {
      const ms = base + doy * 86400000;
      sink += Astro.equationOfTime(new Date(ms));
      sink += Astro.trueSolarTimeMinutes(new Date(ms), lo);
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('S2 total', ms < 20000, fmt(ms) + ' (sink=' + sink.toFixed(0) + ')');
}

console.log('▶ S3: 25 kecamatan × 365 hari × 6 waktu sholat (prediksi tahunan) = 54.750 waktu');
{
  const t0 = process.hrtime.bigint();
  let sink = 0;
  const base = Date.UTC(2026, 0, 1, 12);
  for (let i = 0; i < 25; i++) {
    const k = G.kec[(i * 277) % G.kec.length];
    const z = Zones.zoneByProvince(G.provinces[k[2]]) || Zones.zoneByCoord(k[3], k[4]);
    for (let doy = 0; doy < 365; doy++) {
      const t = Prayer.prayerTimes(new Date(base + doy * 86400000), k[3], k[4], z.offset);
      sink += t.fajr + t.isha;
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('S3 total', ms < 3000, fmt(ms) + ' (sink=' + sink.toFixed(0) + ')');
}

console.log('▶ S4: Autocomplete — 5.000 kueri acak');
{
  const t0 = process.hrtime.bigint();
  let sink = 0;
  const names = G.kec.map(k => k[0]);
  for (let i = 0; i < 5000; i++) {
    const nm = names[(i * 137) % names.length];
    const q = nm.slice(0, 2 + (i % 4)).toLowerCase();
    sink += MapMod.search(q, 12).length;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('S4 total', ms < 2000, fmt(ms) + ' → rata-rata ' + (ms / 5000).toFixed(3) + ' ms/kueri');
}

console.log('▶ S5: renderHome virtual (tanpa DOM) — 200 tick');
{
  const t0 = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < 200; i++) {
    const now = new Date(Date.now() + i * 1000);
    const loc = { lat: -6.1944, lon: 106.8333 };
    const eot = Astro.equationOfTime(now);
    const tst = Astro.trueSolarTimeMinutes(now, loc.lon);
    const noon = Astro.solarNoonMinutes(now, loc.lon, 7);
    const st = Astro.sunTimes(now, loc.lat, loc.lon, 7);
    const sp = Astro.sunPosition(now, loc.lat, loc.lon);
    sink += eot + tst + noon + st.dayLength + sp.azimuth;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('S5 total', ms / 200 < 5, fmt(ms) + ' → ' + (ms / 200).toFixed(2) + ' ms/tick');
}

console.log('▶ S6: mesin boundary v3 — 2.000 parse WKT + 2.000 stitch + 7.285 lookup kode');
{
  const fs = require('fs');
  const path = require('path');
  const { SHARED } = require('./helper');
  // muat kec_codes ke SHARED
  const kecSrc = fs.readFileSync(path.join(require('./helper').WWW, 'js', 'data', 'kec_codes.js'), 'utf8');
  new Function('window', kecSrc)(SHARED);
  const K = SHARED.KECCODES || {};

  let wktSample = null;
  try { wktSample = JSON.parse(fs.readFileSync('/tmp/tulung_ok.json', 'utf8')).data[0].WKT_GEOMETRY; }
  catch (e) {
    // fallback: sintetis multi-poligon besar
    let pts = [];
    for (let i = 0; i < 600; i++) {
      const a = i / 600 * 2 * Math.PI;
      pts.push((110 + 0.2 * Math.cos(a)).toFixed(6) + ' ' + (-7.6 + 0.2 * Math.sin(a)).toFixed(6));
    }
    wktSample = 'MULTIPOLYGON (((' + pts.join(',') + ')))';
  }
  const t0 = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < 2000; i++) {
    const geo = MapMod.wktToGeojson(wktSample);
    if (geo) sink++;
  }
  const t1 = process.hrtime.bigint();
  // cincin tertutup dari 60 titik lingkaran → dipecah jadi segmen → diacak
  const ring = [];
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * 2 * Math.PI;
    ring.push([110 + 0.2 * Math.cos(a), -7.6 + 0.2 * Math.sin(a)]);
  }
  const segs = [];
  for (let i = 0; i < 60; i++) segs.push([ring[i], ring[(i + 1) % 60]]);
  segs.reverse(); // urutan acak sengaja: stitching harus menyambung ulang
  for (let i = 0; i < 2000; i++) sink += MapMod.stitchRings(segs).length;
  const t2 = process.hrtime.bigint();
  const keys = Object.keys(K);
  for (let i = 0; i < 10; i++) for (const k of keys) sink += K[k].length;
  const t3 = process.hrtime.bigint();
  const msW = Number(t1 - t0) / 1e6, msS = Number(t2 - t1) / 1e6, msK = Number(t3 - t2) / 1e6;
  check('S6a parse WKT ×2000', msW / 2000 < 15, fmt(msW) + ' → ' + (msW / 2000).toFixed(3) + ' ms/parse');
  check('S6b stitch ×2000 (60 segmen acak → 1 ring)', msS / 2000 < 5, fmt(msS) + ' → ' + (msS / 2000).toFixed(3) + ' ms/stitch');
  check('S6c lookup kode ×' + (keys.length * 10).toLocaleString('id-ID'), msK < 200, fmt(msK));
  check('S6 sanity', sink > 5000, 'sink=' + sink);
}

console.log('\n════════ stress-test.js: ' + (failed ? 'ADA TARGET GAGAL' : 'SEMUA TARGET TERCAPAI') + ' ════════');
process.exitCode = failed ? 1 : 0;
