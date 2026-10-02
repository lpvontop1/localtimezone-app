/* test-solar.js — unit test halaman mirror mysolartime.com + solarGmtId */
'use strict';
global.window = global;
const Astro = require('../app/src/main/assets/www/js/astro.js');
require('../app/src/main/assets/www/js/zones.js');
const { fmtHMS, fmtHM, gmtIdFromMinutes, deviceGmtId } =
  require('../app/src/main/assets/www/js/solar.js');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n▶ ' + t); }

console.log('════════ test-solar.js — mirror mysolartime ════════');

section('S1 — Format jam (HH:MM:SS menit-hari)')
ok(fmtHMS(0) === '00:00:00', 'tengah malam 00:00:00', fmtHMS(0));
ok(fmtHMS(61 + 1 / 60) === '01:01:01', '1 j 1 m 1 s → 01:01:01', fmtHMS(61 + 1 / 60));
ok(fmtHMS(1439 + 59 / 60 + 59 / 3600) === '23:59:59', 'menjelang tengah malam', fmtHMS(1439 + 59 / 60 + 59 / 3600));
ok(fmtHMS(1440 + 60) === '01:00:00', 'normalisasi melewati 1440', fmtHMS(1440 + 60));
ok(fmtHM(-30) === '23:30', 'menit negatif dinormalisasi', fmtHM(-30));

section('S2 — ID zona GMT custom')
ok(gmtIdFromMinutes(420) === 'GMT+7:00', '420 mnt → GMT+7:00', gmtIdFromMinutes(420));
ok(gmtIdFromMinutes(434.6) === 'GMT+7:15', '434,6 → dibulatkan 7:15', gmtIdFromMinutes(434.6));
ok(gmtIdFromMinutes(0) === 'GMT+0:00', 'nol', gmtIdFromMinutes(0));
ok(gmtIdFromMinutes(-180) === 'GMT-3:00', 'negatif', gmtIdFromMinutes(-180));
const d = new Date('2026-10-02T10:00:00Z');
ok(deviceGmtId(d).length > 0 && /^GMT[+-]\d{1,2}:\d{2}$/.test(deviceGmtId(d)), 'deviceGmtId format valid', deviceGmtId(d));

section('S3 — Konsistensi TST vs offset GMT matahari (inti anti-beku widget)')
// verifikasi matematis: TST(date, lon) ≈ jam UTC + offset (dibulatkan 1 menit)
{
  let maxErr = 0;
  for (const lon of [95.0, 105.0, 110.62, 120.0, 135.0, 140.9]) {
    for (const hour of [0, 6, 12, 18]) {
      const date = new Date(Date.UTC(2026, 9, 2, hour, 0, 30));
      const tst = Astro.trueSolarTimeMinutes(date, lon);
      const offMin = Math.round(lon * 4 + Astro.equationOfTime(date, hour + 0.5 / 60));
      const viaTz = (hour * 60 + 0.5 + offMin) % 1440;
      let err = Math.abs(((tst - viaTz + 720) % 1440) - 720);
      maxErr = Math.max(maxErr, err);
    }
  }
  ok(maxErr <= 0.5, 'galat pembulatan ≤ 30 detik untuk 24 kombinasi', maxErr.toFixed(3) + ' mnt');
}

section('S4 — EoT mempengaruhi offset searah rumus')
{
  const feb = new Date(Date.UTC(2026, 1, 11, 6, 0, 0)); // EoT minimum ±-14 mnt
  const nov = new Date(Date.UTC(2026, 10, 3, 6, 0, 0)); // EoT maksimum
  const eotFeb = Astro.equationOfTime(feb, 6);
  const eotNov = Astro.equationOfTime(nov, 6);
  ok(eotFeb < -10 && eotNov > 10, 'EoT ekstrem Feb(-) & Nov(+) sesuai teori',
    eotFeb.toFixed(1) + ' / ' + eotNov.toFixed(1));
  ok(gmtIdFromMinutes(105 * 4 + eotFeb) !== gmtIdFromMinutes(105 * 4 + eotNov),
    'offset GMT matahari berubah antar ekstrem EoT');
}

section('S5 — sunPosition untuk kompas (sudut & arah)')
{
  // 15 Apr 23:00 UTC = 16 Apr 06:00 WIB → matahari timur
  const pos = Astro.sunPosition(new Date(Date.UTC(2026, 3, 15, 23, 0, 0)), -6.2, 106.8);
  ok(isFinite(pos.azimuth) && isFinite(pos.altitude), 'azimuth & elevasi terhitung');
  ok(pos.altitude > 0 && pos.altitude < 40, 'elevasi pagi rendah', pos.altitude.toFixed(1));
  ok(pos.azimuth > 60 && pos.azimuth < 130, 'pagi → azimuth timur (60–130°)', pos.azimuth.toFixed(1));
  const posEve = Astro.sunPosition(new Date(Date.UTC(2026, 3, 15, 10, 0, 0)), -6.2, 106.8);
  ok(posEve.azimuth > 240 && posEve.azimuth < 300, 'sore → azimuth barat (240–300°)', posEve.azimuth.toFixed(1));
}

section('S6 — Zona per koordinat (dipakai panel legal)')
{
  const Z = require('../app/src/main/assets/www/js/zones.js');
  const a = Z.zoneByCoord(-6.2, 106.8);
  const b = Z.zoneByCoord(-2.5, 118.0);
  const c = Z.zoneByCoord(-9.5, 140.0);
  ok(a.offset === 7, 'Jakarta WIB', a.label);
  ok(b.offset === 8, 'Indonesia tengah WITA', b.label);
  ok(c.offset === 9, 'Papua WIT', c.label);
}

console.log('\n════════ test-solar.js: ' + pass + ' lulus, ' + fail + ' gagal ════════');
process.exit(fail ? 1 : 0);
