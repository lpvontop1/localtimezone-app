/* ============================================================
 * app.js — Logika utama aplikasi Zona Waktu Lokal Indonesia
 * Berjalan di dalam WebView Android; berkomunikasi dengan Kotlin
 * lewat window.AndroidBridge (NativeBridge.kt).
 * ============================================================ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const Astro = window.Astro, Zones = window.Zones, Prayer = window.Prayer,
    Weather = window.Weather, MapMod = window.MapMod, Solar = window.SolarMod;
  const Native = window.AndroidBridge || null;

  /* ---------------- STATE ---------------- */
  const DEFAULT_LOC = { name: 'Menteng', kab: 'Kota Jakarta Pusat', prov: 'DKI Jakarta', lat: -6.1944, lon: 106.8333, source: 'default' };

  const state = {
    loc: Object.assign({}, DEFAULT_LOC),
    settings: { hanafi: false, use24h: true },
    page: 'page-home',
    prvOffset: 0,          // offset hari pada tab sholat
    mapKec: null,          // kecamatan terpilih di peta
    mapWeather: null,
  };

  function saveState() {
    const payload = JSON.stringify({ loc: state.loc, settings: state.settings });
    try { localStorage.setItem('lta_state', payload); } catch (e) {}
    if (Native && Native.saveState) {
      // kirim ringkasan untuk widget Android (dihitung ulang di Kotlin)
      try { Native.saveState(JSON.stringify(state.loc)); } catch (e) {}
    }
  }
  function loadState() {
    try {
      const raw = localStorage.getItem('lta_state');
      if (raw) {
        const j = JSON.parse(raw);
        if (j.loc && isFinite(j.loc.lat)) state.loc = Object.assign({}, DEFAULT_LOC, j.loc);
        if (j.settings) state.settings = Object.assign(state.settings, j.settings);
      }
    } catch (e) {}
  }

  /* ---------------- ZONA & WAKTU ---------------- */
  function currentZone() {
    const z = Zones.zoneByProvince(state.loc.prov);
    return z || Zones.zoneByCoord(state.loc.lat, state.loc.lon);
  }

  function fmtClock(date, zone) {
    const d = new Date(date.getTime() + zone.offset * 3600000);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  }
  function fmtHM(mins) { return Astro.minutesToHM(mins); }

  function localMinutes(date, zone) {
    const d = new Date(date.getTime() + zone.offset * 3600000);
    return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  }

  /* ---------------- SPLASH ---------------- */
  function splashProgress() {
    let pct = 0;
    const bar = $('#splashBar');
    const t = setInterval(() => {
      pct = Math.min(100, pct + 12 + Math.random() * 18);
      bar.style.width = pct + '%';
      if (pct >= 100) {
        clearInterval(t);
        setTimeout(() => $('#splash').classList.add('hide'), 250);
      }
    }, 140);
  }

  /* ---------------- TICKER ---------------- */
  function tick() {
    const now = new Date();
    const zone = currentZone();
    const loc = state.loc;

    // header
    $('#hdrClock').textContent = fmtClock(now, zone);
    $('#hdrZone').textContent = zone.label;
    $('#hdrLoc').textContent = loc.name + (loc.prov ? ' · ' + loc.prov : '');

    if (state.page === 'page-home') renderHome(now, zone, loc);
    if (state.page === 'page-prayer') renderPrayerLive(now, zone);
    if (state.page === 'page-map' && state.mapKec) renderMapInfo(now, zone);
    if (state.page === 'page-solar' && Solar) Solar.renderLive(now);
  }

  /* ---------------- BERANDA ---------------- */
  function renderHome(now, zone, loc) {
    $('#homeClock').textContent = fmtClock(now, zone);
    $('#homeZoneLabel').textContent = zone.name + ' (' + zone.label + ' · UTC+' + zone.offset + ')';
    $('#homeDate').textContent = Zones.formatDateID(now, zone.offset);
    $('#homeHijri').textContent = Zones.formatDateFullID(now, zone.offset);

    // waktu matahari
    const tst = Astro.trueSolarTimeMinutes(now, loc.lon);
    const tstH = Math.floor(tst / 60), tstM = Math.floor(tst % 60), tstS = Math.floor((tst % 1) * 60);
    const p2 = (n) => (n < 10 ? '0' : '') + n;
    $('#solarClock').textContent = p2(tstH) + ':' + p2(tstM) + ':' + p2(tstS);

    const eot = Astro.equationOfTime(now);
    const lmtDelta = loc.lon * 4 - zone.offset * 60 + 720; // selisih LMT vs jam legal (menit, ter-normalisasi)
    const lmtDeltaN = ((lmtDelta % 1440) + 1440) % 1440 - 720;
    const solarVsLegal = ((lmtDeltaN + eot) % 1440 + 2160) % 1440 - 720;
    $('#solarDelta').textContent =
      'Matahari vs jam legal: ' + (solarVsLegal >= 0 ? '+' : '') + solarVsLegal.toFixed(1) + ' menit' +
      ' (LMT ' + (lmtDeltaN >= 0 ? '+' : '') + lmtDeltaN.toFixed(0) + ' mnt · EoT ' + (eot >= 0 ? '+' : '') + eot.toFixed(1) + ' mnt)';

    const noon = Astro.solarNoonMinutes(now, loc.lon, zone.offset);
    $('#solarNoon').textContent = fmtHM(noon) + ' ' + zone.label;
    // LMT = UTC + bujur×4 menit (TANPA offset zona legal)
    $('#solarMean').textContent = fmtHM(now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() + loc.lon * 4) + ' (LMT)';

    const st = Astro.sunTimes(now, loc.lat, loc.lon, zone.offset);
    if (st) {
      $('#sunriseT').textContent = fmtHM(st.sunrise) + ' ' + zone.label;
      $('#sunsetT').textContent = fmtHM(st.sunset) + ' ' + zone.label;
      const dl = st.dayLength;
      $('#dayLen').textContent = Math.floor(dl / 60) + ' jam ' + Math.round(dl % 60) + ' mnt';
    } else {
      $('#sunriseT').textContent = '—';
      $('#sunsetT').textContent = '—';
      $('#dayLen').textContent = '—';
    }
    const sp = Astro.sunPosition(now, loc.lat, loc.lon);
    $('#sunPos').textContent = sp.altitude.toFixed(1) + '° / ' + sp.azimuth.toFixed(0) + '°';

    // perbandingan
    $('#cmpLegal').textContent = fmtClock(now, zone) + ' ' + zone.label;
    $('#cmpLmt').textContent = fmtHM(now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() + loc.lon * 4);
    $('#cmpTst').textContent = fmtHM(tst);
    $('#cmpNote').textContent =
      'Di ' + loc.name + ' (bujur ' + loc.lon.toFixed(3) + '°BT), matahari tenggelam ' +
      Math.abs(lmtDeltaN).toFixed(0) + ' menit ' + (lmtDeltaN < 0 ? 'lebih lambat' : 'lebih cepat') +
      ' daripada jam ' + zone.label + '. Equation of Time hari ini ' +
      (eot >= 0 ? 'menambah +' : 'mengurangi ') + eot.toFixed(1) + ' menit.';

    drawEotChart(now);
  }

  /** Grafik EoT setahun pada canvas. */
  let eotPoints = null;
  function drawEotChart(now) {
    const cv = $('#eotChart');
    if (!cv.getContext) return;
    // hitung sekali per menit (cache)
    if (!eotPoints || (now - eotPoints.at) > 60000) {
      const year = now.getUTCFullYear();
      const pts = [];
      for (let doy = 1; doy <= 365; doy += 2) {
        const d = new Date(Date.UTC(year, 0, doy, 12));
        pts.push(Astro.equationOfTime(d));
      }
      eotPoints = { at: now, pts };
    }
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    // garis nol
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    // titik hari ini
    const doyNow = Astro.dayOfYear(now);
    const px = ((doyNow - 1) / 364) * (W - 8) + 4;
    // kurva
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const maxE = 17;
    eotPoints.pts.forEach((e, i) => {
      const x = (i / (eotPoints.pts.length - 1)) * (W - 8) + 4;
      const y = H / 2 - (e / maxE) * (H / 2 - 6);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    // marker sekarang
    const eNow = Astro.equationOfTime(now);
    ctx.fillStyle = '#ffb454';
    ctx.beginPath();
    ctx.arc(px, H / 2 - (eNow / maxE) * (H / 2 - 6), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- GPS ---------------- */
  function requestGps() {
    if (!navigator.geolocation) { toast('Geolocation tidak tersedia'); return; }
    toast('Mengambil lokasi GPS…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      let prov = null, name = 'Lokasi Saya';
      // reverse geocode (online)
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon +
          '&format=jsonv2&zoom=13&accept-language=id', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          const a = j.address || {};
          prov = a.state || null;
          name = a.suburb || a.village || a.town || a.city_district || a.county || 'Lokasi Saya';
          // cocokkan ke dataset bila bisa
          const hit = MapMod.search(name, 1)[0];
          if (hit && hit.prov === prov) {
            state.loc = { name: hit.name, kab: hit.kab, prov: hit.prov, lat: hit.lat, lon: hit.lon, source: 'gps+data' };
          } else {
            state.loc = { name: name, kab: a.county || '', prov: prov || '', lat: lat, lon: lon, source: 'gps' };
          }
        }
      } catch (e) {
        state.loc = { name: name, kab: '', prov: prov || '', lat: lat, lon: lon, source: 'gps' };
      }
      if (!state.loc.prov) state.loc.prov = '';
      saveState();
      toast('Lokasi: ' + state.loc.name);
    }, (err) => {
      toast('GPS gagal: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  /* ---------------- PICKER KECAMATAN ---------------- */
  let pickerCb = null;
  function openPicker(cb) {
    pickerCb = typeof cb === 'function' ? cb : null;
    $('#kecModal').classList.add('show');
    $('#kecSearch').value = '';
    renderPickerResults('');
    setTimeout(() => $('#kecSearch').focus(), 120);
  }
  function closePicker() { $('#kecModal').classList.remove('show'); }

  function resultItemHTML(r) {
    return '<div class="result-item" data-i="' + r.idx + '">' +
      '<div class="r1">Kec. ' + r.name + '</div>' +
      '<div class="r2">' + r.kab + ' · ' + r.prov + '</div></div>';
  }

  function renderPickerResults(q) {
    const box = $('#kecResults');
    const list = q ? MapMod.search(q, 30) : MapMod.search('menteng', 5);
    box.innerHTML = list.length
      ? list.map(resultItemHTML).join('')
      : '<div class="result-item"><div class="r2">Tidak ditemukan. Butuh internet untuk pencarian online.</div></div>';
    box.classList.add('show');
    box.querySelectorAll('.result-item').forEach((el) => {
      el.addEventListener('click', () => {
        const r = MapMod.byIndex(+el.dataset.i);
        if (pickerCb) {
          const cb = pickerCb; pickerCb = null; closePicker();
          cb(r);
          return;
        }
        state.loc = { name: r.name, kab: r.kab, prov: r.prov, lat: r.lat, lon: r.lon, source: 'manual' };
        saveState();
        closePicker();
        toast('Lokasi: Kec. ' + r.name);
      });
    });
  }

  /* ---------------- PETA ---------------- */
  function bindMapSearch() {
    const inp = $('#mapSearch'), box = $('#mapResults');
    let deb;
    inp.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        const q = inp.value.trim();
        if (!q) { box.classList.remove('show'); return; }
        const list = MapMod.search(q, 12);
        box.innerHTML = list.length
          ? list.map(resultItemHTML).join('')
          : '<div class="result-item"><div class="r2">Tidak ditemukan dalam data offline.</div></div>';
        box.classList.add('show');
        box.querySelectorAll('.result-item').forEach((el) => {
          el.addEventListener('click', () => {
            box.classList.remove('show');
            inp.value = '';
            selectMapKec(MapMod.byIndex(+el.dataset.i));
          });
        });
      }, 120);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) box.classList.remove('show');
    });
  }

  async function selectMapKec(kec) {
    state.mapKec = kec;
    $('#mapKecTitle').textContent = 'Kec. ' + kec.name;
    $('#mapKecSub').textContent = (kec.kab || '?') + ' · ' + (kec.prov || '?') +
      ' · ' + kec.lat.toFixed(4) + '°, ' + kec.lon.toFixed(4) + '°';
    $('#mapWeather').textContent = 'Memuat boundary & cuaca…';
    let src = null, approx = false;
    try {
      const res = await MapMod.showKecamatan(kec);
      src = res && res.source; approx = !!(res && res.approx);
    } catch (e) { console.warn('boundary error', e); }
    // cuaca
    try {
      state.mapWeather = await Weather.fetchWeather(kec.lat, kec.lon);
    } catch (e) {
      state.mapWeather = null;
      $('#mapWeather').textContent = 'Cuaca tidak tersedia (periksa koneksi internet).';
    }
    renderMapInfo(new Date(), currentZone());
    if (approx) toast('Boundary OSM belum tersedia — menampilkan perkiraan area');
    else if (src === 'cache') toast('Boundary dari cache');
  }

  function renderMapInfo(now, zone) {
    const k = state.mapKec;
    if (!k) return;
    const eot = Astro.equationOfTime(now);
    $('#mapLegal').textContent = fmtClock(now, zone) + ' ' + zone.label;
    $('#mapSolar').textContent = fmtHM(Astro.trueSolarTimeMinutes(now, k.lon));
    $('#mapEot').textContent = (eot >= 0 ? '+' : '') + eot.toFixed(1) + ' mnt';
    const zoneByLon = Zones.zoneByCoord(k.lat, k.lon);
    const meridDelta = k.lon * 4 - zoneByLon.offset * 60;
    const md = ((meridDelta % 1440) + 2160) % 1440 - 720;
    $('#mapMerid').textContent = (md >= 0 ? '+' : '') + md.toFixed(0) + ' mnt (' + zoneByLon.label + ')';

    if (state.mapWeather) {
      const w = state.mapWeather, c = w.current;
      let html = '<div class="w-cur"><span class="w-emoji">' + c[1] + '</span>' +
        '<span>' + c.temp + '°C · ' + c[0] + '<br><small style="color:var(--dim)">Terasa ' + c.feels +
        '°C · Lembap ' + c.humidity + '% · Angin ' + c.wind + ' km/j</small></span></div><div class="w-days">';
      w.daily.slice(0, 3).forEach((d) => {
        html += '<div class="w-day">' + d[1] + '<b>' + d.tmax + '°/' + d.tmin + '°</b>' +
          (d.rainProb != null ? '🌧️' + d.rainProb + '%' : '') + '</div>';
      });
      html += '</div><div class="w-src">Sumber: Open-Meteo</div>';
      $('#mapWeather').innerHTML = html;
    }
  }

  /* ---------------- SHOLAT ---------------- */
  function prayerDate() {
    const zone = currentZone();
    const d = new Date(Date.now() + state.prvOffset * 86400000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  }

  function renderPrayer() {
    const zone = currentZone();
    const loc = state.loc;
    const d = prayerDate();
    const params = Prayer.DEFAULT_PARAMS;
    const t = Prayer.prayerTimes(d, loc.lat, loc.lon, zone.offset,
      { asrFactor: state.settings.hanafi ? 2 : 1 });
    $('#prvDate').textContent = Zones.formatDateID(d, zone.offset) +
      (state.prvOffset === 0 ? ' (hari ini)' : state.prvOffset > 0 ? ' (+' + state.prvOffset + ' hari)' : '');

    const rows = Prayer.LABELS.map((l) => {
      return '<div class="prayer-row" data-k="' + l.key + '"><span class="p-name">' + l.name +
        '</span><b class="p-time">' + fmtHM(t[l.key]) + ' ' + zone.label + '</b></div>';
    }).join('');
    $('#prayerList').innerHTML = rows;
    const eot = Astro.equationOfTime(d);
    $('#prayerMeta').textContent =
      'Dihitung untuk ' + loc.name + ' (' + loc.lat.toFixed(3) + '°, ' + loc.lon.toFixed(3) + '°) · EoT ' +
      (eot >= 0 ? '+' : '') + eot.toFixed(1) + ' mnt · Kemenag 20°/18° · murni astronomis (bisa prediksi tanggal berapa pun)';
  }

  function renderPrayerLive(now, zone) {
    if (!state.page.includes('prayer')) return;
    // highlight baris berikutnya + countdown
    const today = prayerDate();
    const sameDay = today.getTime() === Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0);
    if (state.prvOffset !== 0) { $('#nextPrayerCount').textContent = 'Pindah ke Hari Ini untuk countdown'; return; }
    const params = { asrFactor: state.settings.hanafi ? 2 : 1 };
    const t = Prayer.prayerTimes(today, state.loc.lat, state.loc.lon, zone.offset, params);
    const minsNow = localMinutes(now, zone);
    const np = Prayer.nextPrayer(t, minsNow);
    let diff;
    if (np.tomorrow) diff = 1440 - minsNow + t.fajr;
    else diff = np.minutes - minsNow;
    $('#nextPrayerName').textContent = np.name;
    $('#nextPrayerTime').textContent = fmtHM(np.minutes) + ' ' + zone.label;
    const hh = Math.floor(diff / 60), mm = Math.floor(diff % 60);
    $('#nextPrayerCount').textContent = '≈ ' + hh + ' jam ' + mm + ' menit lagi';
    document.querySelectorAll('.prayer-row').forEach((el) => {
      el.classList.toggle('next', el.dataset.k === np.key);
    });
  }

  function renderMonth() {
    const zone = currentZone();
    const d = prayerDate();
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const rows = Prayer.monthSchedule(y, m, state.loc.lat, state.loc.lon, zone.offset,
      { asrFactor: state.settings.hanafi ? 2 : 1 });
    let html = '<tr><th>Tgl</th><th>Subuh</th><th>Terbit</th><th>Dzuhur</th><th>Ashar</th><th>Maghrib</th><th>Isya</th></tr>';
    rows.forEach((r) => {
      html += '<tr><td>' + r.day + '</td><td>' + fmtHM(r.times.fajr) + '</td><td>' + fmtHM(r.times.sunrise) +
        '</td><td>' + fmtHM(r.times.dhuhr) + '</td><td>' + fmtHM(r.times.asr) + '</td><td>' +
        fmtHM(r.times.maghrib) + '</td><td>' + fmtHM(r.times.isha) + '</td></tr>';
    });
    $('#monthTable').innerHTML = html;
    $('#monthCard').classList.remove('hidden');
  }

  async function verifyAladhan() {
    const out = $('#aladhanOut');
    const zone = currentZone();
    out.textContent = 'Memverifikasi ke Aladhan API (metode 20 = Kemenag)…';
    const d = prayerDate();
    const dateStr = d.getUTCDate() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCFullYear();
    try {
      const r = await fetch('https://api.aladhan.com/v1/timings/' + dateStr +
        '?latitude=' + state.loc.lat + '&longitude=' + state.loc.lon + '&method=20');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const t = j.data.timings;
      const mine = Prayer.prayerTimes(d, state.loc.lat, state.loc.lon, zone.offset,
        { asrFactor: state.settings.hanafi ? 2 : 1 });
      const pairs = [
        ['Subuh', t.Fajr, mine.fajr], ['Terbit', t.Sunrise, mine.sunrise],
        ['Dzuhur', t.Dhuhr, mine.dhuhr], ['Ashar', t.Asr, mine.asr],
        ['Maghrib', t.Maghrib, mine.maghrib], ['Isya', t.Isha, mine.isha],
      ];
      let txt = 'Bandingkan (Aladhan vs lokal):\n';
      pairs.forEach(([nm, ref, mv]) => {
        const rm = hmsToMin(ref), dm = Math.abs(rm - mv);
        txt += nm + ': ' + ref + ' vs ' + fmtHM(mv) + ' → selisih ' + dm.toFixed(0) + ' mnt\n';
      });
      out.textContent = txt;
    } catch (e) {
      out.textContent = 'Verifikasi gagal (offline?): ' + e.message;
    }
  }
  function hmsToMin(s) {
    const p = String(s).split(':');
    return (+p[0]) * 60 + (+p[1]);
  }

  /* ---------------- SELF TEST ---------------- */
  function selfTest() {
    const out = $('#selfTestOut');
    const lines = [];
    const t0 = performance.now();
    let pass = 0, fail = 0;
    function check(nm, ok, detail) {
      ok ? pass++ : fail++;
      lines.push((ok ? '✅' : '❌') + ' ' + nm + (detail ? ' — ' + detail : ''));
    }
    // 1. EoT bounds
    let eotMin = 99, eotMax = -99, dMax = null, dMin = null;
    for (let doy = 1; doy <= 365; doy++) {
      const e = Astro.equationOfTime(new Date(Date.UTC(2026, 0, doy, 12)));
      if (e < eotMin) { eotMin = e; dMin = doy; }
      if (e > eotMax) { eotMax = e; dMax = doy; }
    }
    check('EoT maksimum ±3 Nov', Math.abs(dMax - 307) <= 6, dMax + ' (+' + eotMax.toFixed(1) + ' mnt)');
    check('EoT minimum ±11 Feb', Math.abs(dMin - 42) <= 6, dMin + ' (' + eotMin.toFixed(1) + ' mnt)');
    check('|EoT| ≤ 16,9 mnt', Math.max(Math.abs(eotMin), Math.abs(eotMax)) <= 16.9);

    // 2. Referensi NOAA: EoT ≈ 0 pada ±15 Apr / 13 Jun / 1 Sep / 25 Des
    const zeros = [105, 164, 244, 359];
    zeros.forEach((doy) => {
      const e = Math.abs(Astro.equationOfTime(new Date(Date.UTC(2026, 0, doy, 12))));
      check('EoT≈0 di DOY ' + doy, e <= 1.2, e.toFixed(2) + ' mnt');
    });

    // 3. Urutan sholat valid untuk 200 kecamatan acak
    let bad = 0;
    const G = window.GEODATA;
    for (let i = 0; i < 200; i++) {
      const k = G.kec[Math.floor(Math.random() * G.kec.length)];
      const z = Zones.zoneByProvince(G.provinces[k[2]]) || Zones.zoneByCoord(k[3], k[4]);
      const t = Prayer.prayerTimes(new Date(), k[3], k[4], z.offset);
      if (!(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib < t.isha)) bad++;
    }
    check('Urutan sholat 200 sampel', bad === 0, bad + ' pelanggaran');

    // 4. Zona provinsi lengkap 38
    const nProv = G.provinces.filter((p) => Zones.zoneByProvince(p)).length;
    check('38 provinsi terpetakan', nProv === 38, nProv + ' provinsi');

    // 5. Benchmark: 365 hari × 6 waktu untuk 25 kecamatan
    const t1 = performance.now();
    let sum = 0;
    for (let i = 0; i < 25; i++) {
      const k = G.kec[i * 7 % G.kec.length];
      const z = Zones.zoneByProvince(G.provinces[k[2]]) || Zones.zoneByCoord(k[3], k[4]);
      for (let doy = 1; doy <= 365; doy++) {
        const t = Prayer.prayerTimes(new Date(Date.UTC(2026, 0, doy, 12)), k[3], k[4], z.offset);
        sum += t.dhuhr;
      }
    }
    const dt = performance.now() - t1;
    check('Benchmark 9.125 hitungan sholat', dt < 3000, dt.toFixed(0) + ' ms');

    const total = (performance.now() - t0).toFixed(0);
    lines.unshift('Hasil: ' + pass + ' lulus, ' + fail + ' gagal (' + total + ' ms)');
    out.textContent = lines.join('\n');
    if (Native && Native.vibrate) Native.vibrate(fail ? 200 : 40);
  }

  /* ---------------- UTIL ---------------- */
  let toastTimer;
  function toast(msg) {
    let el = $('#toastEl');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toastEl';
      el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#242a4d;' +
        'color:#fff;padding:10px 18px;border-radius:22px;font-size:13px;z-index:2000;box-shadow:0 6px 20px rgba(0,0,0,.5);transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }

  /* ---------------- NAVIGASI ---------------- */
  function switchPage(id) {
    state.page = id;
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === id));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === id));
    if (id === 'page-map') {
      MapMod.init('map');
      setTimeout(() => MapMod.map && MapMod.map.invalidateSize(), 200);
    }
    if (id === 'page-prayer') { renderPrayer(); renderPrayerLive(new Date(), currentZone()); }
    if (id === 'page-solar' && Solar) {
      Solar.init();
      if (!Solar.manual) Solar.setLoc({ name: state.loc.name, lat: state.loc.lat, lon: state.loc.lon });
      Solar.renderLive(new Date());
    }
    if (id === 'page-more') {
      const G = window.GEODATA;
      if (G) $('#statKec').textContent = G.kec.length.toLocaleString('id-ID');
    }
    try { localStorage.setItem('lta_page', id); } catch (e) {}
  }

  function bindEvents() {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.addEventListener('click', () => switchPage(b.dataset.page));
    });
    $('#btnGps').addEventListener('click', requestGps);
    $('#btnPickKec').addEventListener('click', openPicker);
    $('#kecModalX').addEventListener('click', closePicker);
    $('#kecModal').addEventListener('click', (e) => { if (e.target.id === 'kecModal') closePicker(); });
    $('#kecSearch').addEventListener('input', (e) => renderPickerResults(e.target.value.trim()));

    $('#prvPrev').addEventListener('click', () => { state.prvOffset--; renderPrayer(); });
    $('#prvNext').addEventListener('click', () => { state.prvOffset++; renderPrayer(); });
    $('#prvToday').addEventListener('click', () => { state.prvOffset = 0; $('#monthCard').classList.add('hidden'); renderPrayer(); });
    $('#prvMonth').addEventListener('click', renderMonth);
    $('#btnAladhan').addEventListener('click', verifyAladhan);
    $('#chkHanafi').addEventListener('change', (e) => {
      state.settings.hanafi = e.target.checked;
      $('#setAsr').textContent = e.target.checked ? 'Hanafi' : "Syafi'i";
      saveState();
      renderPrayer();
    });
    $('#btnSelfTest').addEventListener('click', selfTest);
    $('#btnShare').addEventListener('click', () => {
      const zone = currentZone();
      const now = new Date();
      const txt = '🕐 ' + state.loc.name + ' (' + state.loc.prov + ')\n' +
        'Jam legal: ' + fmtClock(now, zone) + ' ' + zone.label + '\n' +
        'Waktu matahari: ' + fmtHM(Astro.trueSolarTimeMinutes(now, state.loc.lon)) + '\n' +
        'EoT: ' + Astro.equationOfTime(now).toFixed(1) + ' menit';
      if (Native && Native.shareText) Native.shareText(txt);
      else if (navigator.share) navigator.share({ text: txt });
      else toast(txt);
    });
  }

  /* ---------------- EKSPOR KEPERLUAN MIRROR (solar.js) ---------------- */
  window.toast = toast;
  window.openKecPicker = openPicker;

  /* ---------------- BACK BUTTON NATIVE ---------------- */
  window.onNativeBack = function () {
    if ($('#kecModal').classList.contains('show')) { closePicker(); return; }
    if (state.page !== 'page-home') { switchPage('page-home'); return; }
    if (Native && Native.exitApp) Native.exitApp();
  };

  /* ---------------- INIT ---------------- */
  function init() {
    loadState();
    $('#chkHanafi').checked = !!state.settings.hanafi;
    $('#setAsr').textContent = state.settings.hanafi ? 'Hanafi' : "Syafi'i";
    splashProgress();
    bindEvents();
    bindMapSearch();
    switchPage('page-home');
    tick();
    setInterval(tick, 1000);
    // GPS otomatis sekali di awal (diam-diam, WebView akan minta izin)
    setTimeout(() => { try { requestGps(); } catch (e) {} }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
