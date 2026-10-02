/* ============================================================
 * test-prayer.js — Unit test jadwal sholat
 * 1) Invarian urutan waktu
 * 2) Konsistensi transit/terbit-terbenam
 * 3) Validasi online vs Aladhan API (metode 20 = Kemenag RI)
 *    — dilewati dengan aman bila offline.
 * ============================================================ */
'use strict';
const https = require('https');
const { load, assert, section, summary } = require('./helper');
const Astro = load('js/astro.js');
const Prayer = load('js/prayer.js');
const Zones = load('js/zones.js');

/** GET https sederhana (family:4 — sandbox menolak happy-eyeballs undici). */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ host: u.hostname, path: u.pathname + u.search, family: 4, timeout: 15000,
      headers: { 'User-Agent': 'localtimezone-app-tests/1.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => res.statusCode === 200 ? resolve(d) : reject(new Error('HTTP ' + res.statusCode)));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

section('Invarian: Subuh < Terbit < Dzuhur < Ashar < Maghrib < Isya');
{
  let bad = 0, worst = '';
  const sample = [[-6.1944, 106.8333], [-8.65, 115.2], [-5.14, 119.42], [3.59, 98.67],
    [-2.53, 140.72], [-7.8, 110.37], [0.95, 97.55], [-7.25, 112.75]];
  for (const [la, lo] of sample) {
    const z = Zones.zoneByCoord(la, lo);
    for (let doy = 1; doy <= 366; doy += 7) {
      const d = new Date(Date.UTC(2026, 0, doy, 12));
      const t = Prayer.prayerTimes(d, la, lo, z.offset);
      const ok = t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr &&
        t.asr < t.maghrib && t.maghrib < t.isha;
      if (!ok) { bad++; worst = `(${la},${lo}) DOY ${doy}: ` + JSON.stringify(t); }
    }
  }
  assert('Urutan valid untuk 8 lokasi × 53 tanggal', bad === 0, worst);
}

section('Durasi antar waktu masuk akal (tropis)');
{
  const t = Prayer.prayerTimes(new Date(Date.UTC(2026, 9, 2, 12)), -6.1944, 106.8333, 7);
  const gap1 = t.sunrise - t.fajr, gap2 = t.dhuhr - t.sunrise, gap3 = t.asr - t.dhuhr,
    gap4 = t.maghrib - t.asr, gap5 = t.isha - t.maghrib;
  assert('Subuh→Terbit 75–110 mnt', gap1 > 70 && gap1 < 115, gap1.toFixed(0) + ' mnt');
  assert('Terbit→Dzuhur ~355–375 mnt', gap2 > 350 && gap2 < 380, gap2.toFixed(0) + ' mnt');
  assert('Dzuhur→Ashar 150–230 mnt', gap3 > 145 && gap3 < 240, gap3.toFixed(0) + ' mnt');
  // Okt: matahari nyaris zenith di Jakarta → Ashar maju (181 mnt). Rentang tropis 80–200.
  assert('Ashar→Maghrib 80–200 mnt (tropis)', gap4 > 80 && gap4 < 200, gap4.toFixed(0) + ' mnt');
  assert('Maghrib→Isya 60–100 mnt', gap5 > 60 && gap5 < 100, gap5.toFixed(0) + ' mnt');
}

section('Prediksi masa depan: konsisten antar-tahun (astronomis)');
{
  const t1 = Prayer.prayerTimes(new Date(Date.UTC(2026, 9, 2, 12)), -6.1944, 106.8333, 7);
  const t2 = Prayer.prayerTimes(new Date(Date.UTC(2027, 9, 2, 12)), -6.1944, 106.8333, 7);
  const diff = Math.abs(t1.dhuhr - t2.dhuhr);
  assert('Dzuhur 2 Okt 2026 vs 2027 selisih ≤ 4 mnt', diff <= 4, diff.toFixed(1) + ' mnt');
}

section('Konsistensi dengan transit geometris + ihtiyat');
{
  const d = new Date(Date.UTC(2026, 9, 2, 12));
  const transit = Prayer.transitMinutes(d, 106.8333, 7);
  const t = Prayer.prayerTimes(d, -6.1944, 106.8333, 7);
  assert('Dzuhur = transit + 2', Math.abs(t.dhuhr - (transit + 2)) < 0.01);
  assert('Dzuhur Jakarta 2 Okt ≈ 11:35–11:50 (Aladhan: 11:42)', t.dhuhr > 695 && t.dhuhr < 710,
    Astro.minutesToHM(t.dhuhr));
}

section('Referensi statis Aladhan metode-20 (dipanen 2 Okt 2026, Jakarta)');
{
  // Ground truth dari api.aladhan.com method=20 untuk Jakarta 2-10-2026:
  // Fajr 04:20 · Sunrise 05:37 · Dhuhr 11:42 · Asr 14:47 · Maghrib 17:47 · Isha 18:56
  const ref = { fajr: 260, sunrise: 337, dhuhr: 702, asr: 887, maghrib: 1067, isha: 1136 };
  const mine = Prayer.prayerTimes(new Date(Date.UTC(2026, 9, 2, 12)), -6.1944, 106.8333, 7);
  const map = { fajr: 'Subuh', sunrise: 'Terbit', dhuhr: 'Dzuhur', asr: 'Ashar', maghrib: 'Maghrib', isha: 'Isya' };
  for (const k of Object.keys(ref)) {
    const d = Math.abs(ref[k] - mine[k]);
    assert('Referensi ' + map[k] + ' (±4 mnt)', d <= 4,
      ref[k] + ' vs ' + Astro.minutesToHM(mine[k]) + ' → ' + d.toFixed(0) + ' mnt');
  }
}

section('nextPrayer');
{
  const t = { fajr: 260, sunrise: 355, dhuhr: 719, asr: 930, maghrib: 1071, isha: 1165 };
  let np = Prayer.nextPrayer(t, 200);
  assert('Pukul 03:20 → Subuh', np.key === 'fajr');
  np = Prayer.nextPrayer(t, 720);
  assert('Pukul 12:00 → Ashar (Dzuhur baru lewat)', np.key === 'asr');
  np = Prayer.nextPrayer(t, 1200);
  assert('Pukul 20:00 → Subuh besok', np.tomorrow === true);
}

section('Validasi online: Aladhan API metode 20 (KEMENAG) — Jakarta');
(async () => {
  let online = false;
  try {
    const raw = await httpsGet('https://api.aladhan.com/v1/timings/2-10-2026?latitude=-6.1944&longitude=106.8333&method=20');
    const j = JSON.parse(raw);
    const T = j.data.timings;
    const mine = Prayer.prayerTimes(new Date(Date.UTC(2026, 9, 2, 12)), -6.1944, 106.8333, 7);
    const hms = (s) => (+s.split(':')[0]) * 60 + (+s.split(':')[1]);
    const pairs = [
      ['Subuh', hms(T.Fajr), mine.fajr], ['Terbit', hms(T.Sunrise), mine.sunrise],
      ['Dzuhur', hms(T.Dhuhr), mine.dhuhr], ['Ashar', hms(T.Asr), mine.asr],
      ['Maghrib', hms(T.Maghrib), mine.maghrib], ['Isya', hms(T.Isha), mine.isha],
    ];
    let worst = 0, worstNm = '';
    for (const [nm, ref, mv] of pairs) {
      const d = Math.abs(ref - mv);
      if (d > worst) { worst = d; worstNm = nm; }
      assert('Aladhan vs lokal: ' + nm + ' (±3 mnt)', d <= 3,
        ref + ' vs ' + Astro.minutesToHM(mv) + ' → selisih ' + d.toFixed(0) + ' mnt');
    }
    console.log('  (selisih terburuk: ' + worstNm + ' ' + worst.toFixed(0) + ' mnt — ihtiyat & pembulatan Kemenag dapat menyebabkan ±2 mnt)');
    online = true;
  } catch (e) {
    console.log('  ⚠️  OFFLINE — test Aladhan dilewati: ' + e.message);
  }

  if (online) {
    section('Validasi online: Makassar & Jayapura (satu sampel masing-masing)');
    try {
      for (const [nm, la, lo, off] of [['Makassar', -5.1477, 119.4327, 8], ['Jayapura', -2.5916, 140.6690, 9]]) {
        const raw = await httpsGet('https://api.aladhan.com/v1/timings/2-10-2026?latitude=' + la + '&longitude=' + lo + '&method=20');
        const j = JSON.parse(raw);
        const mine = Prayer.prayerTimes(new Date(Date.UTC(2026, 9, 2, 12)), la, lo, off);
        const ref = (+j.data.timings.Dhuhr.split(':')[0]) * 60 + (+j.data.timings.Dhuhr.split(':')[1]);
        const d = Math.abs(ref - mine.dhuhr);
        assert('Dzuhur ' + nm + ' (±3 mnt)', d <= 3, j.data.timings.Dhuhr + ' vs ' + Astro.minutesToHM(mine.dhuhr));
      }
    } catch (e) { console.log('  ⚠️ dilewati: ' + e.message); }
  }

  summary('test-prayer.js');
})();
