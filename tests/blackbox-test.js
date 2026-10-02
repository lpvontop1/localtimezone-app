/* ============================================================
 * blackbox-test.js — Uji kotak hitam dari sudut pandang pengguna
 * Tidak melihat implementasi internal; hanya input → output yang
 * diamati lewat API modul yang sama seperti yang dipakai UI.
 * ============================================================ */
'use strict';
const { load, loadGeodata, assert, section, summary } = require('./helper');
const Astro = load('js/astro.js');
const Prayer = load('js/prayer.js');
const Zones = load('js/zones.js');
const MapMod = load('js/map.js');
const G = loadGeodata();

section('FB1 — Pencarian: "menteng" (huruf kecil, tanpa prefiks)');
{
  const r = MapMod.search('menteng', 12);
  assert('ditemukan ≥1', r.length >= 1, r.length + ' hasil');
  const top = r[0];
  assert('hasil teratas = Menteng / Jakarta Pusat / DKI Jakarta',
    top.name === 'Menteng' && /Jakarta Pusat/.test(top.kab) && top.prov === 'DKI Jakarta',
    JSON.stringify(top));
  assert('koordinat Menteng wajar (−6,19/106,83 ±0,05)',
    Math.abs(top.lat + 6.1944) < 0.05 && Math.abs(top.lon - 106.8333) < 0.05);
}

section('FB2 — Pencarian dengan prefiks & variasi');
{
  assert('"Kecamatan Menteng" tetap ketemu', MapMod.search('Kecamatan Menteng', 5)[0].name === 'Menteng');
  assert('"KEC. MENTENG" tetap ketemu', MapMod.search('KEC. MENTENG', 5)[0].name === 'Menteng');
  assert('"  Menteng  " (spasi) tetap ketemu', MapMod.search('  Menteng  ', 5)[0].name === 'Menteng');
  assert('"Menteng" case-insensitive', MapMod.search('MeNtEnG', 5)[0].name === 'Menteng');
}

section('FB3 — Pencarian tidak valid / ambiguitas');
{
  assert('"zzzzqqqq" → 0 hasil', MapMod.search('zzzzqqqq', 12).length === 0);
  assert('"" (kosong) → 0 hasil', MapMod.search('', 12).length === 0);
  assert('null → 0 hasil', MapMod.search(null, 12).length === 0);
  const dup = MapMod.search('sukamaju', 12);
  if (dup.length > 1) {
    const provs = new Set(dup.map(d => d.prov));
    assert('"sukamaju" ambigu → semua hasil tampil dengan provinsi masing-masing', provs.size > 1,
      dup.length + ' hasil, ' + provs.size + ' provinsi');
  } else {
    assert('"sukamaju" ditemukan', dup.length === 1, JSON.stringify(dup));
  }
}

section('FB4 — Zona waktu legal untuk seluruh 6.916 kecamatan');
{
  let wib = 0, wita = 0, wit = 0;
  for (const k of G.kec) {
    const z = Zones.zoneByProvince(G.provinces[k[2]]);
    if (z.label === 'WIB') wib++; else if (z.label === 'WITA') wita++; else wit++;
  }
  assert('Ketiga zona terpakai', wib > 0 && wita > 0 && wit > 0,
    'WIB=' + wib + ' WITA=' + wita + ' WIT=' + wit);
  assert('Mayoritas WIB (Sumatera+Jawa)', wib > wita && wib > 2000);
}

section('FB5 — Waktu legal vs waktu matahari (jam berjalan)');
{
  // Simulasi: pengguna di Menteng pukul 12:00:00 WIB 2 Okt 2026
  const now = new Date(Date.UTC(2026, 9, 2, 5, 0, 0)); // 12:00 WIB
  const zone = Zones.zoneByProvince('DKI Jakarta');
  const legalH = (now.getTime() / 1000) % 86400 / 3600 + 7;
  const tst = Astro.trueSolarTimeMinutes(now, 106.8333);
  const legalMin = 720; // 12:00
  const diff = tst - legalMin;
  // selisih = LMT delta (+7,3 mnt) + EoT (+10,1) ≈ +17,4 → matahari ±17 mnt di depan
  assert('Matahari lebih cepat 10–25 mnt dari jam WIB', diff > 10 && diff < 25,
    diff.toFixed(1) + ' mnt (TST ' + Astro.minutesToHM(tst) + ' vs 12:00)');
}

section('FB6 — Alur sholat pengguna: tanggal maju 90 hari (prediksi)');
{
  const zone = Zones.zoneByProvince('Bali');
  let allOk = true, detail = '';
  for (let off = 0; off <= 90; off += 15) {
    const d = new Date(Date.UTC(2026, 9, 2 + off, 12));
    const t = Prayer.prayerTimes(d, -8.65, 115.2167, zone.offset);
    const ok = t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr &&
      t.asr < t.maghrib && t.maghrib < t.isha;
    if (!ok) { allOk = false; detail = 'off=' + off; }
  }
  assert('Prediksi 90 hari Bali konsisten', allOk, detail);
}

section('FB7 — Widget state JSON (kontrak JS→Kotlin)');
{
  // meniru payload saveState() di app.js
  const loc = { name: 'Menteng', kab: 'Kota Jakarta Pusat', prov: 'DKI Jakarta', lat: -6.1944, lon: 106.8333, source: 'manual' };
  const json = JSON.stringify(loc);
  const o = JSON.parse(json);
  assert('field lengkap', ['name', 'kab', 'prov', 'lat', 'lon'].every(k => k in o));
  assert('lat/lon numerik', typeof o.lat === 'number' && typeof o.lon === 'number');
  // sisi Kotlin: zoneOffsetForProvince harus memberi 7 untuk DKI Jakarta
  const off = Zones.zoneByProvince(o.prov).offset;
  assert('zona DKI Jakarta = 7 (WIB)', off === 7);
}

section('FB8 — Cuaca: parser Open-Meteo (payload nyata)');
{
  const Weather = load('js/weather.js');
  const fake = {
    current: { temperature_2m: 31.2, relative_humidity_2m: 68, apparent_temperature: 36.5,
      weather_code: 80, wind_speed_10m: 12.3, wind_direction_10m: 180 },
    daily: { time: ['2026-10-02', '2026-10-03', '2026-10-04'],
      weather_code: [2, 95, 1], temperature_2m_max: [32.1, 31.4, 33.0],
      temperature_2m_min: [25.0, 24.8, 25.3], precipitation_probability_max: [60, 85, 20] },
    utc_offset_seconds: 25200,
  };
  // mirip transformasi di fetchWeather
  const cur = { ...Weather.describe(fake.current.weather_code) };
  assert('Kode 80 → Hujan Lokal Ringan 🌦️', cur[0] === 'Hujan Lokal Ringan' && cur[1] === '🌦️',
    JSON.stringify(cur));
  const d1 = Weather.describe(95);
  assert('Kode 95 → Badai Petir ⛈️', d1[0] === 'Badai Petir');
  const unknown = Weather.describe(9999);
  assert('Kode tak dikenal → fallback', unknown[0] === 'Tidak diketahui');
}

section('FB9 — Robustness input ekstrem');
{
  // bujur di luar Indonesia
  const tst = Astro.trueSolarTimeMinutes(new Date(), 179.9);
  assert('bujur ekstrem 179,9° tidak NaN', isFinite(tst), tst.toFixed(1));
  // lintang kutub → sunTimes null, tidak crash
  const st = Astro.sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 89.9, 0, 0);
  assert('lintang kutub → null (tanpa crash)', st === null);
  // sholat di kutub → fallback 6 jam
  const t = Prayer.prayerTimes(new Date(Date.UTC(2026, 5, 21, 12)), 89.9, 0, 0);
  assert('sholat di kutub → fallback tanpa crash', isFinite(t.fajr) && isFinite(t.isha));
  // query angka
  assert('query "123" → 0 hasil, tanpa crash', MapMod.search('123', 5).length === 0);
}

section('FB10 — Konsistensi tiga zona antar-modul');
{
  // untuk 500 kecamatan acak: zone JS harus sama dengan aturan provinsi
  let bad = 0;
  for (let i = 0; i < 500; i++) {
    const k = G.kec[(i * 149) % G.kec.length];
    const zProv = Zones.zoneByProvince(G.provinces[k[2]]);
    const zCoord = Zones.zoneByCoord(k[3], k[4]);
    if (zProv.label !== zCoord.label) bad++;
  }
  // heuristik bujur tidak 100% identik provinsi (Kalteng, Jatim dsb) — batasi 8% mismatch
  const pct = (bad / 500) * 100;
  assert('heuristik bujur vs provinsi: mismatch < 8%', pct < 8, bad + '/500 (' + pct.toFixed(1) + '%)');
}

summary('blackbox-test.js');
