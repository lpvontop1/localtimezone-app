/* ============================================================
 * solar.js — MIRROR fungsional mysolartime.com (v1.1.0)
 *
 * Fitur yang dicerminkan (implementasi mandiri, offline):
 *  1. Dual clock: waktu matahari sejati vs waktu legal (per detik)
 *  2. Sumber lokasi: perangkat / peta (kecamatan) / manual lat-lon
 *  3. Konverter "pilih tanggal & jam" → waktu matahari + ephemerides
 *  4. Ephemerides: terbit, kulminasi, terbenam, panjang siang,
 *     deklinasi, Equation of Time + kurva setahun
 *  5. Kompas matahari: azimuth matahari & arah bayangan
 * ============================================================ */
(function (root) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const Astro = root.Astro;
  const Zones = root.Zones;

  function mod(x, m) { return ((x % m) + m) % m; }

  function fmtHMS(mins) {
    const totalSec = Math.round(mod(mins, 1440) * 60000) / 1000; // bulatkan ke ms
    const ss = Math.floor(mod(totalSec, 60));
    const mm = Math.floor(mod(totalSec / 60, 60));
    const hh = Math.floor(totalSec / 3600);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return p(hh) + ':' + p(mm) + ':' + p(ss);
  }

  function fmtHM(mins) {
    const m = mod(Math.round(mins), 1440);
    const hh = Math.floor(m / 60), mm = m % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /** Offset zona perangkat → "GMT+7:00". */
  function deviceGmtId(date) {
    let o = -date.getTimezoneOffset();
    const s = o < 0 ? '-' : '+';
    o = Math.abs(o);
    return 'GMT' + s + Math.floor(o / 60) + ':' + (o % 60 < 10 ? '0' : '') + (o % 60);
  }

  /** Offset menit → "GMT+7:14". */
  function gmtIdFromMinutes(totalMin) {
    const s = totalMin < 0 ? '-' : '+';
    const a = Math.abs(Math.round(totalMin));
    return 'GMT' + s + Math.floor(a / 60) + ':' + (a % 60 < 10 ? '0' : '') + (a % 60);
  }

  const Solar = {
    /** Lokasi aktif halaman mirror (independen dari tab lain). */
    loc: null, // {name, lat, lon}
    manual: false,
    drawn: false,

    init() {
      if (this._inited) return;
      this._inited = true;

      const applyManual = () => {
        const la = parseFloat($('#solLat').value);
        const lo = parseFloat($('#solLon').value);
        if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
          root.toast && root.toast('Koordinat tidak valid');
          return;
        }
        this.setLoc({ name: 'Manual', lat: la, lon: lo, manualSet: true });
      };
      $('#solBtnApply').addEventListener('click', applyManual);
      $('#solBtnHere').addEventListener('click', () => {
        if (!navigator.geolocation) { root.toast && root.toast('Geolocation tidak tersedia'); return; }
        navigator.geolocation.getCurrentPosition((pos) => {
          this.setLoc({ name: 'Lokasi Saya', lat: pos.coords.latitude, lon: pos.coords.longitude, manualSet: true });
        }, () => root.toast && root.toast('Izin lokasi diperlukan'), { timeout: 12000 });
      });
      $('#solBtnPick').addEventListener('click', () => {
        const open = root.openKecPicker;
        if (open) open((kec) => this.setLoc(Object.assign({}, kec, { manualSet: true })));
      });
      $('#solBtnConv').addEventListener('click', () => this.convert());
      $('#solBtnOriginal').addEventListener('click', () => {
        if (root.AndroidBridge && root.AndroidBridge.openUrl) root.AndroidBridge.openUrl('https://mysolartime.com/');
        else root.open && root.open('https://mysolartime.com/');
      });
      // default: ikuti lokasi aplikasi
      const appLoc = root.currentAppLocation && root.currentAppLocation();
      this.loc = appLoc || { name: 'Jakarta', lat: -6.2, lon: 106.8 };
      const dt = $('#solConvAt');
      if (dt) {
        const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
        dt.value = now.toISOString().slice(0, 16);
      }
      this.renderStatic(new Date());
    },

    /** Dipanggil tiap detik oleh ticker aplikasi. */
    renderLive(date) {
      if (!this._inited) return;
      const L = this.loc;
      const eot = Astro.equationOfTime(date, date.getUTCHours() + date.getUTCMinutes() / 60);
      const tst = Astro.trueSolarTimeMinutes(date, L.lon);
      $('#solSolar').textContent = fmtHMS(tst);
      const zone = Zones.zoneByCoord(L.lat, L.lon);
      const legalMin = date.getUTCHours() * 60 + date.getUTCMinutes() +
        date.getUTCSeconds() / 60 + zone.offset * 60;
      $('#solLegal').textContent = fmtHMS(legalMin);
      $('#solLegalOff').textContent = zone.label + ' · ' + gmtIdFromMinutes(zone.offset * 60);
      $('#solSolarOff').textContent = 'GMT' + (L.lon * 4 + eot >= 0 ? '+' : '−') +
        (() => { const a = Math.abs(L.lon * 4 + eot); const h = Math.floor(a / 60), m = Math.round(a % 60); return h + ':' + (m < 10 ? '0' : '') + m; })();
      const delta = (L.lon * 4 + eot) - zone.offset * 60;
      $('#solDelta').textContent = 'Selisih matahari vs jam legal: ' +
        (delta >= 0 ? '+' : '−') + (() => { const a = Math.abs(delta); const h = Math.floor(a / 60), m = Math.round(a % 60); return (h ? h + ' j ' : '') + m + ' mnt'; })() +
        ' · bujur ' + L.lon.toFixed(3) + '° · EoT ' + (eot >= 0 ? '+' : '') + eot.toFixed(1) + ' mnt';
      this.drawCompass(date);
    },

    renderStatic(date) {
      const L = this.loc;
      $('#solLoc').textContent = L.name || '—';
      $('#solCoord').textContent = L.lat.toFixed(4) + '°, ' + L.lon.toFixed(4) + '°';
      $('#solMachine').textContent = deviceGmtId(date) + ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')';
      $('#solLmt').textContent = gmtIdFromMinutes(L.lon * 4) + ' (' + (L.lon / 15).toFixed(2) + ' jam)';

      const zone = Zones.zoneByCoord(L.lat, L.lon);
      const st = Astro.sunTimes(date, L.lat, L.lon, zone.offset);
      $('#solRise').textContent = st ? fmtHM(st.sunrise) : '—';
      $('#solNoon').textContent = fmtHM(Astro.solarNoonMinutes(date, L.lon, zone.offset));
      $('#solSet').textContent = st ? fmtHM(st.sunset) : '—';
      $('#solLen').textContent = st ? Math.floor(st.dayLength / 60) + ' j ' + Math.round(st.dayLength % 60) + ' mnt' : '—';
      const decl = Astro.solarDeclination(date);
      $('#solDecl').textContent = (decl >= 0 ? '+' : '') + decl.toFixed(2) + '°';
      const eot = Astro.equationOfTime(date);
      $('#solEot').textContent = (eot >= 0 ? '+' : '') + eot.toFixed(1) + ' mnt';
      this.drawEotCurve(date);
    },

    setLoc(loc) {
      this.loc = loc;
      if (loc && loc.manualSet) this.manual = true;
      this.renderStatic(new Date());
      this.renderLive(new Date());
    },

    /** Konverter momen → waktu matahari (meniru "Select a date and an hour"). */
    convert() {
      const v = $('#solConvAt').value;
      const out = $('#solConvOut');
      if (!v) { out.textContent = 'Pilih tanggal & jam dulu.'; return; }
      const date = new Date(v); // datetime-local → instan lokal perangkat
      if (isNaN(date.getTime())) { out.textContent = 'Format tanggal tidak valid.'; return; }
      const L = this.loc;
      const tst = Astro.trueSolarTimeMinutes(date, L.lon);
      const eot = Astro.equationOfTime(date, date.getUTCHours() + date.getUTCMinutes() / 60);
      const decl = Astro.solarDeclination(date, date.getUTCHours() + date.getUTCMinutes() / 60);
      const pos = Astro.sunPosition(date, L.lat, L.lon);
      out.innerHTML =
        '<div class="convert-big">' + fmtHMS(tst) + '</div>' +
        '<div class="convert-sub">waktu matahari sejati di bujur ' + L.lon.toFixed(3) + '° pada momen tersebut</div>' +
        '<div class="kv"><span>Waktu matahari rata-rata (LMT)</span><b>' + fmtHMS(L.lon * 4) + '</b></div>' +
        '<div class="kv"><span>EoT pada momen itu</span><b>' + (eot >= 0 ? '+' : '') + eot.toFixed(2) + ' mnt</b></div>' +
        '<div class="kv"><span>Deklinasi</span><b>' + (decl >= 0 ? '+' : '') + decl.toFixed(2) + '°</b></div>' +
        '<div class="kv"><span>Elevasi / Azimut matahari</span><b>' + pos.altitude.toFixed(1) + '° / ' + pos.azimuth.toFixed(1) + '°</b></div>';
      this.renderLive(date);
    },

    /** Kurva EoT setahun + penanda hari ini (canvas). */
    drawEotCurve(today) {
      const cv = $('#solChart');
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      const css = getComputedStyle(document.documentElement);
      const dim = (css.getPropertyValue('--dim') || '#97a2bc').trim();
      const accent = (css.getPropertyValue('--accent2') || '#FFC46B').trim();
      ctx.clearRect(0, 0, W, H);
      // sumbu nol
      ctx.strokeStyle = dim; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.globalAlpha = 1;
      // kurva
      ctx.strokeStyle = accent; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let d = 0; d <= 366; d++) {
        const dt = new Date(Date.UTC(today.getUTCFullYear(), 0, 1) + d * 86400000);
        const v = Astro.equationOfTime(dt);
        const x = (d / 366) * W;
        const y = H / 2 - (v / 17) * (H / 2 - 6);
        if (d === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // penanda hari ini
      const doy = Astro.dayOfYear(today);
      const vt = Astro.equationOfTime(today);
      const x = (doy / 366) * W, y = H / 2 - (vt / 17) * (H / 2 - 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    },

    /** Kompas matahari: ring utara, jarum azimuth matahari, arah bayangan. */
    drawCompass(date) {
      const cv = $('#solCompass');
      if (!cv) return;
      const L = this.loc;
      const pos = Astro.sunPosition(date, L.lat, L.lon);
      const ctx = cv.getContext('2d');
      const W = cv.width, cx = W / 2, cy = W / 2, R = W / 2 - 10;
      const css = getComputedStyle(document.documentElement);
      const dim = (css.getPropertyValue('--dim') || '#97a2bc').trim();
      const amber = (css.getPropertyValue('--accent2') || '#FFC46B').trim();
      ctx.clearRect(0, 0, W, W);

      // ring & tick
      ctx.strokeStyle = dim; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.8;
      for (let a = 0; a < 360; a += 15) {
        const rad = a * Math.PI / 180;
        const r1 = R - (a % 90 === 0 ? 9 : 4);
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(rad) * r1, cy - Math.cos(rad) * r1);
        ctx.lineTo(cx + Math.sin(rad) * R, cy - Math.cos(rad) * R);
        ctx.stroke();
      }
      ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = dim;
      ctx.fillText('U', cx, cy - R + 20);
      ctx.fillText('T', cx, cy + R - 20);
      ctx.fillText('B', cx - R + 20, cy);
      ctx.fillText('S', cx + R - 20, cy);
      ctx.globalAlpha = 1;

      if (pos.altitude < -0.5) {
        ctx.fillStyle = dim; ctx.font = '500 13px sans-serif';
        ctx.fillText('Matahari di bawah horizon', cx, cy);
        if ($('#solCompassCap')) {
          $('#solCompassCap').textContent = 'Matahari berada di bawah horizon (elevasi ' +
            pos.altitude.toFixed(1) + '°) — malam di lokasi Anda.';
        }
        return;
      }
      // arah matahari (amber) & bayangan (putus, terang)
      const az = pos.azimuth * Math.PI / 180;
      // jarum matahari
      ctx.strokeStyle = amber; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(az) * (R - 16), cy - Math.cos(az) * (R - 16));
      ctx.stroke();
      // titik matahari di ujung
      ctx.fillStyle = amber;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(az) * (R - 16), cy - Math.cos(az) * (R - 16), 6, 0, Math.PI * 2);
      ctx.fill();
      // bayangan (berlawanan)
      ctx.setLineDash([5, 5]); ctx.strokeStyle = dim; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - Math.sin(az) * (R - 30), cy + Math.cos(az) * (R - 30));
      ctx.stroke();
      ctx.setLineDash([]);
      // pusat
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      if ($('#solCompassCap')) {
        $('#solCompassCap').textContent = 'Matahari di ' + pos.azimuth.toFixed(0) +
          '° (' + arahKompas(pos.azimuth) + '), elevasi ' + pos.altitude.toFixed(1) +
          '° — bayangan jatuh ke ' + arahKompas(mod(pos.azimuth + 180, 360)) + '.';
      }
    },
  };

  function arahKompas(az) {
    const names = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
    return names[Math.round(mod(az, 360) / 45) % 8];
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { Solar, fmtHMS, fmtHM, gmtIdFromMinutes, deviceGmtId };
  else root.SolarMod = Solar;
})(typeof window !== 'undefined' ? window : globalThis);
