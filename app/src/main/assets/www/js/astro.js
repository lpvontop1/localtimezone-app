/* ============================================================
 * astro.js — Mesin astronomi matahari
 * Formula: NOAA Solar Calculator (Global Monitoring Laboratory)
 * https://gml.noaa.gov/grad/solcalc/calcdetails.html
 *
 * Semua fungsi menerima objek Date (instan absolut UTC).
 * Konvensi:
 *  - EoT (equation of time) dalam menit: EoT = waktu matahari sejati − waktu matahari rata-rata
 *  - LMT (Local Mean Time) = UTC + (bujur / 15) jam  → 1° = 4 menit
 *  - TST (True Solar Time) = LMT + EoT
 * ============================================================ */
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  function mod(x, m) { return ((x % m) + m) % m; }

  /** Nomor hari dalam tahun (1–366) berdasarkan tanggal UTC. */
  function dayOfYear(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    const cur = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor((cur - start) / 86400000) + 1;
  }

  /**
   * Sudut fraksional orbit bumi γ (radian), formula NOAA.
   * hourUTC: jam UTC fraksional (default 12 → nilai tengah hari).
   */
  function gamma(date, hourUTC) {
    const h = (hourUTC === undefined) ? 12 : hourUTC;
    const n = dayOfYear(date) - 1 + (h - 12) / 24;
    return 2 * Math.PI / 365 * n;
  }

  /**
   * Equation of Time dalam menit (±16,5 menit).
   * Akuntansi orbit elips bumi (kecepatan bervariasi — hukum Kepler) + axial tilt 23,44°.
   */
  function equationOfTime(date, hourUTC) {
    const g = gamma(date, hourUTC);
    return 229.18 * (
      0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g)
    );
  }

  /** Deklinasi matahari (derajat, −23,44 … +23,44) — deret Spencer, error < 0,035°. */
  function solarDeclination(date, hourUTC) {
    const g = gamma(date, hourUTC);
    const rad = 0.006918 -
      0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) -
      0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
      0.002697 * Math.cos(3 * g) + 0.001480 * Math.sin(3 * g);
    return rad * DEG;
  }

  /** Offset LMT terhadap UTC dalam jam untuk bujur tertentu. */
  function lmtOffsetHours(lon) { return lon / 15; }

  /**
   * Waktu matahari sejati (TST) dalam menit sejak tengah malam (0–1440).
   * @param {Date} date instan absolut
   * @param {number} lon bujur timur positif
   */
  function trueSolarTimeMinutes(date, lon) {
    const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const eot = equationOfTime(date, utcMin / 60);
    return mod(utcMin + lon * 4 + eot, 1440);
  }

  /** Format menit-hari → "HH:MM". */
  function minutesToHM(mins) {
    const m = mod(Math.round(mins), 1440);
    const hh = Math.floor(m / 60), mm = m % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /**
   * Noon matahari (kulminasi atas) dalam menit jam lokal zona hukum.
   * Noon(UTC) = 12:00 − EoT − bujur×4 menit.
   */
  function solarNoonMinutes(date, lon, tzOffsetHours) {
    const noonUTC = 720 - lon * 4 - equationOfTime(date);
    return mod(noonUTC + tzOffsetHours * 60, 1440);
  }

  /** Sudut jam (derajat) untuk ketinggian matahari tertentu. null jika tidak tercapai. */
  function hourAngleDeg(altitudeDeg, latDeg, declDeg) {
    const cosH = (Math.sin(altitudeDeg * RAD) - Math.sin(latDeg * RAD) * Math.sin(declDeg * RAD)) /
      (Math.cos(latDeg * RAD) * Math.cos(declDeg * RAD));
    if (cosH > 1 || cosH < -1) return null;
    return Math.acos(cosH) * DEG;
  }

  /**
   * Waktu terbit & terbenam matahari (menit jam lokal zona hukum).
   * zenith default 90,833° (= 90° + refraksi 0,583° + sudut radius matahari 0,25°).
   * @returns {{sunrise:number, sunset:number, dayLength:number}|null} dayLength dalam menit
   */
  function sunTimes(date, lat, lon, tzOffsetHours, zenith) {
    const z = (zenith === undefined) ? 90.833 : zenith;
    const decl = solarDeclination(date);
    const altitude = -(z - 90); // zenith 90,833° → ketinggian −0,833°
    const H = hourAngleDeg(altitude, lat, decl);
    const noonUTC = 720 - lon * 4 - equationOfTime(date);
    if (H === null) return null;
    const rise = mod(noonUTC - H * 4 + tzOffsetHours * 60, 1440);
    const set = mod(noonUTC + H * 4 + tzOffsetHours * 60, 1440);
    return { sunrise: rise, sunset: set, dayLength: H * 8 };
  }

  /**
   * Posisi matahari saat ini: ketinggian (elevasi) & azimuth (derajat dari utara, searah jarum jam).
   */
  function sunPosition(date, lat, lon) {
    const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const decl = solarDeclination(date, utcH);
    const eot = equationOfTime(date, utcH);
    const tstH = utcH + lon / 15 + eot / 60;          // waktu matahari sejati (jam)
    const H = (tstH - 12) * 15;                        // sudut jam (derajat)
    const sinAlt = Math.sin(lat * RAD) * Math.sin(decl * RAD) +
      Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(H * RAD);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
    const az = mod(Math.atan2(Math.sin(H * RAD),
      Math.cos(H * RAD) * Math.sin(lat * RAD) - Math.tan(decl * RAD) * Math.cos(lat * RAD)) * DEG + 180, 360);
    return { altitude: alt, azimuth: az, declination: decl, hourAngle: H };
  }

  const Astro = {
    RAD, DEG, mod, dayOfYear, gamma, equationOfTime, solarDeclination,
    lmtOffsetHours, trueSolarTimeMinutes, minutesToHM, solarNoonMinutes,
    hourAngleDeg, sunTimes, sunPosition,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Astro;
  else root.Astro = Astro;
})(typeof window !== 'undefined' ? window : globalThis);
