/* ============================================================
 * zones.js — Zona waktu hukum Indonesia & utilitas waktu
 *
 * Dasar hukum: Keppres No. 41 Tahun 1987 jo. UU No. 3 Tahun 1963
 *  - WIB  (UTC+7): Asia/Jakarta  — Sumatera, Jawa, Kalimantan Barat
 *  - WITA (UTC+8): Asia/Makassar — Nusa Tenggara, Kalimantan (selain Barat), Sulawesi
 *  - WIT  (UTC+9): Asia/Jayapura — Maluku, Papua
 * ============================================================ */
(function (root) {
  'use strict';

  const ZONES = {
    WIB:  { label: 'WIB',  offset: 7, tzId: 'Asia/Jakarta',  meridian: 105, name: 'Waktu Indonesia Barat' },
    WITA: { label: 'WITA', offset: 8, tzId: 'Asia/Makassar', meridian: 120, name: 'Waktu Indonesia Tengah' },
    WIT:  { label: 'WIT',  offset: 9, tzId: 'Asia/Jayapura', meridian: 135, name: 'Waktu Indonesia Timur' },
  };

  /* Pemetaan provinsi (nama resmi) → zona legal. 38 provinsi. */
  const PROV_ZONE = {
    // WIB (17)
    'Aceh': 'WIB', 'Sumatera Utara': 'WIB', 'Sumatera Barat': 'WIB', 'Riau': 'WIB',
    'Kepulauan Riau': 'WIB', 'Jambi': 'WIB', 'Sumatera Selatan': 'WIB',
    'Kepulauan Bangka Belitung': 'WIB', 'Bengkulu': 'WIB', 'Lampung': 'WIB',
    'Banten': 'WIB', 'DKI Jakarta': 'WIB', 'Jawa Barat': 'WIB', 'Jawa Tengah': 'WIB',
    'DI Yogyakarta': 'WIB', 'Jawa Timur': 'WIB', 'Kalimantan Barat': 'WIB',
    // WITA (13)
    'Bali': 'WITA', 'Nusa Tenggara Barat': 'WITA', 'Nusa Tenggara Timur': 'WITA',
    'Kalimantan Tengah': 'WITA', 'Kalimantan Selatan': 'WITA', 'Kalimantan Timur': 'WITA',
    'Kalimantan Utara': 'WITA', 'Sulawesi Utara': 'WITA', 'Gorontalo': 'WITA',
    'Sulawesi Tengah': 'WITA', 'Sulawesi Barat': 'WITA', 'Sulawesi Selatan': 'WITA',
    'Sulawesi Tenggara': 'WITA',
    // WIT (8)
    'Maluku': 'WIT', 'Maluku Utara': 'WIT', 'Papua': 'WIT', 'Papua Barat': 'WIT',
    'Papua Barat Daya': 'WIT', 'Papua Tengah': 'WIT', 'Papua Selatan': 'WIT',
    'Papua Pegunungan': 'WIT',
  };

  /** Zona legal berdasarkan nama provinsi. null jika tak dikenal. */
  function zoneByProvince(prov) {
    const key = PROV_ZONE[prov];
    return key ? ZONES[key] : null;
  }

  /**
   * Heuristik zona dari koordinat (dipakai bila nama provinsi tak tersedia,
   * mis. hasil GPS offline). Batas dipilih untuk meminimalkan galat:
   *  - 114,40°BT  batas Jawa (WIB) / Bali (WITA) — Banyuwangi barat 114,36
   *  - 110,70°BT  batas Kalbar (WIB) / Kalteng (WITA) — hanya berlaku di Kalimantan
   *  - 125,05°BT  batas Sulawesi (WITA) / Maluku (WIT)
   */
  function zoneByCoord(lat, lon) {
    if (lon < 110.7) {
      // Sumatera, Jawa barat/tengah, Kalbar
      return ZONES.WIB;
    }
    if (lon < 114.4) {
      // Jawa timur (WIB) vs Kalimantan timur/tengah selatan (WITA): bedakan via garis lintang
      // Kalteng/Kalsel berada di utara −5,5°LS..? Kalteng 3,3°LS−0,05; Kalsel −4,4..−1,5
      // Jawa max +6,5°LU (Bawean −5,8LS)... gunakan: laut Jawa utara (lat > -4.0) & lon<114.4 ambigu.
      // Kasus umum: lon 110.7–114.4 & lat < -4.2 → Jawa (WIB); selain itu Kalimantan (WITA).
      return (lat < -4.2) ? ZONES.WIB : ZONES.WITA;
    }
    if (lon < 125.05) return ZONES.WITA;
    return ZONES.WIT;
  }

  /** Selisih menit antara waktu matahari rata-rata lokal dan jam legal (positif = matahari lebih cepat). */
  function lmtDeltaMinutes(lon, zone) {
    return mod_(lon * 4 - zone.offset * 60 + 720, 1440) - 720;
  }

  function mod_(x, m) { return ((x % m) + m) % m; }

  /** Nama hari & bulan Indonesia. */
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  /** "Jumat, 2 Oktober 2026" dari instan Date pada zona offset tertentu. */
  function formatDateID(date, tzOffsetHours) {
    const d = new Date(date.getTime() + tzOffsetHours * 3600000);
    return HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /** Tanggal pendek "2 Okt 2026". */
  function formatDateShortID(date, tzOffsetHours) {
    const d = new Date(date.getTime() + tzOffsetHours * 3600000);
    const b = BULAN[d.getUTCMonth()].slice(0, 3);
    return d.getUTCDate() + ' ' + b + ' ' + d.getUTCFullYear();
  }

  /** Tanggal Masehi + Hijriah (ummalqura) bila didukung. */
  function formatDateFullID(date, tzOffsetHours) {
    let hijri = '';
    try {
      const d = new Date(date.getTime() + tzOffsetHours * 3600000);
      hijri = new Intl.DateTimeFormat('id-u-ca-islamic-umalqura',
        { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch (e) { hijri = ''; }
    return hijri;
  }

  const Zones = {
    ZONES, PROV_ZONE, zoneByProvince, zoneByCoord, lmtDeltaMinutes,
    formatDateID, formatDateShortID, formatDateFullID, HARI, BULAN,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Zones;
  else root.Zones = Zones;
})(typeof window !== 'undefined' ? window : globalThis);
