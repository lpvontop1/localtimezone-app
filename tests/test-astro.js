/* ============================================================
 * test-astro.js — Unit test mesin astronomi vs referensi NOAA
 * Referensi: NOAA Solar Calculator, nilai harian EoT & deklinasi
 * https://gml.noaa.gov/grad/solcalc/ (tabel 2024–2026 ±0,2 menit)
 * ============================================================ */
'use strict';
const { load, assert, section, summary } = require('./helper');
const Astro = load('js/astro.js');

section('Equation of Time — titik ekstrem & nol (NOAA)');
// Titik klasik: maks +16,4 mnt ≈ 3 Nov; min −14,2 mnt ≈ 11 Feb;
// nol ≈ 15 Apr, 13 Jun, 1 Sep, 25 Des.
const cases = [
  { d: [2026, 1, 1],   eot: -3.6, tol: 1.0, nm: '1 Jan 2026' },
  { d: [2026, 2, 11],  eot: -14.2, tol: 0.6, nm: '11 Feb 2026 (minimum)' },
  { d: [2026, 4, 15],  eot: 0.0,  tol: 1.2, nm: '15 Apr 2026 (nol)' },
  { d: [2026, 6, 13],  eot: 0.0,  tol: 1.2, nm: '13 Jun 2026 (nol)' },
  { d: [2026, 9, 1],   eot: 0.0,  tol: 1.2, nm: '1 Sep 2026 (nol)' },
  { d: [2026, 11, 3],  eot: 16.4, tol: 0.6, nm: '3 Nov 2026 (maksimum)' },
  { d: [2026, 12, 25], eot: 0.0,  tol: 1.2, nm: '25 Des 2026 (nol)' },
  { d: [2026, 7, 26],  eot: -6.5, tol: 1.0, nm: '26 Jul 2026' },
];
for (const c of cases) {
  const got = Astro.equationOfTime(new Date(Date.UTC(c.d[0], c.d[1] - 1, c.d[2], 12)));
  assert('EoT ' + c.nm, Math.abs(got - c.eot) <= c.tol,
    'harapan ' + c.eot + ' ±' + c.tol + ', hasil ' + got.toFixed(2));
}

section('Batas fisik EoT sepanjang 2026');
let mn = 99, mx = -99;
for (let doy = 1; doy <= 365; doy++) {
  const e = Astro.equationOfTime(new Date(Date.UTC(2026, 0, doy, 12)));
  if (e < mn) mn = e;
  if (e > mx) mx = e;
}
assert('|EoT| maksimum ≤ 16,9 mnt', Math.max(Math.abs(mn), Math.abs(mx)) <= 16.9,
  'rentang ' + mn.toFixed(2) + ' … +' + mx.toFixed(2));

section('Deklinasi matahari');
{
  const jun = Astro.solarDeclination(new Date(Date.UTC(2026, 5, 21, 12)));
  const des = Astro.solarDeclination(new Date(Date.UTC(2026, 11, 21, 12)));
  const mar = Astro.solarDeclination(new Date(Date.UTC(2026, 2, 20, 12)));
  assert('Solstis Juni ≈ +23,44°', Math.abs(jun - 23.44) <= 0.15, jun.toFixed(2) + '°');
  assert('Solstis Des ≈ −23,44°', Math.abs(des + 23.44) <= 0.15, des.toFixed(2) + '°');
  assert('Ekuinoks Maret ≈ 0° (±0,6; momen ekuinoks tidak tepat noon)', Math.abs(mar) <= 0.6, mar.toFixed(2) + '°');
}

section('Waktu matahari sejati (bujur → menit)');
{
  // Bujur 90°BT: LMT = UTC + 6 jam. Pada 12:00 UTC → LMT 18:00 = 1080 mnt, dikoreksi EoT.
  const d90 = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
  const t = Astro.trueSolarTimeMinutes(d90, 90);
  const expectT = Astro.mod(1080 + Astro.equationOfTime(d90), 1440);
  assert('Bujur 90° pukul 12:00 UTC → 18:00 LMT + EoT', Math.abs(t - expectT) <= 0.5,
    'hasil ' + t.toFixed(1) + ' mnt (EoT ' + Astro.equationOfTime(d90).toFixed(1) + ')');
  // Bujur 105° (meridian WIB): TST−legal ≈ EoT saja
  const t2 = Astro.trueSolarTimeMinutes(new Date(Date.UTC(2026, 10, 3, 0, 0, 0)), 105);
  const utcMin = 0, eot = Astro.equationOfTime(new Date(Date.UTC(2026, 10, 3, 0, 0, 0)));
  const expect = Astro.mod(utcMin + 105 * 4 + eot, 1440);
  assert('Konsistensi internal 105°BT', Math.abs(t2 - expect) < 0.01);
}

section('Noon matahari & terbit/terbenam (Jakarta −6,2 / 106,8 / WIB+7)');
{
  const d = new Date(Date.UTC(2026, 5, 21, 12)); // 21 Juni
  const noon = Astro.solarNoonMinutes(d, 106.8, 7);
  assert('Noon matahari Jakarta ≈ 12:00 ±25 mnt', Math.abs(noon - 720) <= 25, noon.toFixed(1) + ' mnt');
  const st = Astro.sunTimes(d, -6.2, 106.8, 7);
  assert('Terbit ~06:00 WIB', Math.abs(st.sunrise - 360) <= 25, Astro.minutesToHM(st.sunrise));
  assert('Terbenam ~17:47 WIB (±25)', Math.abs(st.sunset - 1067) <= 25, Astro.minutesToHM(st.sunset));
  assert('Simetri terbit/terbenam sekitar noon', Math.abs((st.sunrise + st.sunset) / 2 - noon) <= 2);
  assert('Panjang siang ~11,7 jam', Math.abs(st.dayLength - 700) <= 25, st.dayLength.toFixed(0) + ' mnt');
}

section('Posisi matahari');
{
  // noon: azimuth ~180° (Des, matahari selatan Jakarta) atau ~0° (Juni, utara)
  const june = Astro.sunPosition(new Date(Date.UTC(2026, 5, 21, 4, 52, 0)), -6.2, 106.8);
  assert('Saat noon Juni di Jakarta matahari di UTARA (az≈0)',
    june.azimuth < 45 || june.azimuth > 315, 'az=' + june.azimuth.toFixed(1) + '°');
  const dec = Astro.sunPosition(new Date(Date.UTC(2026, 11, 21, 5, 0, 0)), -6.2, 106.8);
  assert('Saat noon Des matahari di SELATAN (az≈180)',
    Math.abs(dec.azimuth - 180) < 45, 'az=' + dec.azimuth.toFixed(1) + '°');
}

section('Fungsi bantu');
assert('minutesToHM(727) = 12:07', Astro.minutesToHM(727) === '12:07');
assert('mod(-10, 1440) = 1430', Astro.mod(-10, 1440) === 1430);

summary('test-astro.js');
