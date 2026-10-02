/* ============================================================
 * prayer.js — Perhitungan waktu sholat astronomis
 *
 * Metode default: KEMENAG RI (Kementerian Agama)
 *  - Subuh  : matahari −20° di bawah horizon  (+ ihtiyat −2 menit)
 *  - Terbit : ketinggian −0,833°              (+ ihtiyat +2 menit)
 *  - Dzuhur : kulminasi (transit)             (+ ihtiyat +2 menit)
 *  - Ashar  : panjang bayangan = 1× benda (Syafi'i)
 *  - Maghrib: ketinggian −0,833°              (+ ihtiyat +2 menit)
 *  - Isya   : matahari −18°                   (+ ihtiyat +2 menit)
 * Semua waktu dalam MENIT jam lokal zona legal (WIB/WITA/WIT).
 * Mendukung prediksi tanggal berapa pun (murni astronomi).
 * ============================================================ */
(function (root) {
  'use strict';

  const Astro = root.Astro || (typeof require !== 'undefined' ? require('./astro.js') : null);
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;

  const DEFAULT_PARAMS = {
    fajrAngle: 20,        // derajat
    ishaAngle: 18,        // derajat
    asrFactor: 1,         // 1 = Syafi'i/Maliki/Hanbali, 2 = Hanafi
    ihtiyat: { fajr: -2, sunrise: 2, dhuhr: 2, asr: 0, maghrib: 2, isha: 2 }, // menit
    highLatRule: 'none',  // 'none' | 'angle' (Indonesia tak berada di lintang tinggi)
  };

  const LABELS = [
    { key: 'fajr',    name: 'Subuh' },
    { key: 'sunrise', name: 'Terbit' },
    { key: 'dhuhr',   name: 'Dzuhur' },
    { key: 'asr',     name: 'Ashar' },
    { key: 'maghrib', name: 'Maghrib' },
    { key: 'isha',    name: 'Isya' },
  ];

  function mod(x, m) { return ((x % m) + m) % m; }

  /** Menit-menit transit (Dzuhur geometris) jam lokal. */
  function transitMinutes(date, lon, tzOffsetHours) {
    return mod(720 - lon * 4 - Astro.equationOfTime(date) + tzOffsetHours * 60, 1440);
  }

  /**
   * Hitung jadwal sholat satu tanggal.
   * @param {Date} date  instan apa pun pada tanggal tsb (UTC-safe)
   * @param {number} lat  lintang
   * @param {number} lon  bujur
   * @param {number} tzOffsetHours  offset zona legal (7/8/9)
   * @param {object} [params] override DEFAULT_PARAMS
   * @returns {{fajr:number,sunrise:number,dhuhr:number,asr:number,maghrib:number,isha:number,noon:number}}
   */
  function prayerTimes(date, lat, lon, tzOffsetHours, params) {
    const p = Object.assign({}, DEFAULT_PARAMS, params || {});
    const iht = Object.assign({}, DEFAULT_PARAMS.ihtiyat, (params && params.ihtiyat) || {});
    const decl = Astro.solarDeclination(date);
    const transit = transitMinutes(date, lon, tzOffsetHours);

    const out = {};
    out.noon = mod(transit + iht.dhuhr, 1440);            // sama dengan dhuhr
    out.dhuhr = out.noon;

    // Terbit / Maghrib
    const H0 = Astro.hourAngleDeg(-0.833, lat, decl);
    if (H0 === null) { // kutub (tidak terjadi di Indonesia, guard saja)
      out.sunrise = mod(transit - 6 * 60, 1440);
      out.sunset = out.maghrib = mod(transit + 6 * 60, 1440);
    } else {
      out.sunrise = mod(transit - H0 * 4 + iht.sunrise, 1440);
      out.maghrib = mod(transit + H0 * 4 + iht.maghrib, 1440);
    }

    // Subuh & Isya (sudut)
    const Hf = Astro.hourAngleDeg(-p.fajrAngle, lat, decl);
    out.fajr = Hf === null ? mod(out.sunrise - 75, 1440) : mod(transit - Hf * 4 + iht.fajr, 1440);
    const Hi = Astro.hourAngleDeg(-p.ishaAngle, lat, decl);
    out.isha = Hi === null ? mod(out.maghrib + 90, 1440) : mod(transit + Hi * 4 + iht.isha, 1440);

    // Ashar: ketinggian matahari saat panjang bayangan = T kali benda + bayangan saat zulhijjah
    //  alt_asr = arctan( 1 / (T + tan(|lat - decl|)) )
    const T = p.asrFactor;
    const altAsr = Math.atan(1 / (T + Math.tan(Math.abs(lat - decl) * RAD))) * DEG;
    const Ha = Astro.hourAngleDeg(altAsr, lat, decl);
    out.asr = Ha === null ? mod(transit + 6 * 60, 1440) : mod(transit + Ha * 4 + iht.asr, 1440);

    return { fajr: out.fajr, sunrise: out.sunrise, dhuhr: out.dhuhr, asr: out.asr, maghrib: out.maghrib, isha: out.isha, noon: out.noon };
  }

  /** Jadwal untuk N hari ke depan (prediksi). */
  function scheduleRange(startDate, days, lat, lon, tzOffsetHours, params) {
    const out = [];
    const base = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 12, 0, 0);
    for (let i = 0; i < days; i++) {
      const d = new Date(base + i * 86400000);
      const t = prayerTimes(d, lat, lon, tzOffsetHours, params);
      out.push({ date: d, times: t });
    }
    return out;
  }

  /** Sholat berikutnya relatif terhadap menitSekarang (jam lokal). */
  function nextPrayer(times, minutesNow) {
    const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (const k of order) {
      if (times[k] > minutesNow) {
        return { key: k, name: (LABELS.find(l => l.key === k) || {}).name || k, minutes: times[k], tomorrow: false };
      }
    }
    return { key: 'fajr', name: 'Subuh', minutes: times.fajr, tomorrow: true };
  }

  /** Bulan penuh (tahun, bulan 1-12) → array jadwal untuk tampilan bulanan. */
  function monthSchedule(year, month, lat, lon, tzOffsetHours, params) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const out = [];
    for (let d = 1; d <= days; d++) {
      const dt = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
      out.push({ day: d, times: prayerTimes(dt, lat, lon, tzOffsetHours, params) });
    }
    return out;
  }

  const Prayer = { DEFAULT_PARAMS, LABELS, prayerTimes, scheduleRange, nextPrayer, monthSchedule, transitMinutes };

  if (typeof module !== 'undefined' && module.exports) module.exports = Prayer;
  else root.Prayer = Prayer;
})(typeof window !== 'undefined' ? window : globalThis);
