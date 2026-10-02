/* ============================================================
 * map.js — Peta kecamatan (Leaflet + OSM)  ·  v3 boundary engine
 *
 * Strategi boundary berlapis (v1.1.0):
 *  A. Nominatim (relasi administratif + polygon_geojson)
 *  B. Overpass: relasi admin_level=7 nama±regex DI SEKITAR
 *     koordinat kecamatan (around 30 km) — tahan nama ganda
 *  C. Overpass: admin_level 6|8 + nama longgar (pemekaran baru
 *     kadang ditag level lain)
 *  D. Perkiraan: lingkaran dashed dari jarak tetangga terdekat
 *     pada dataset GeoNames — ditandai "perkiraan".
 *
 * Perbaikan v1.1.0 (bug boundary tak terrender, mis. Kec. Tulung,
 * Kec. Blimbingsari): Nominatim sering hanya mengembalikan NODE
 * (bukan relasi) — fallback Overpass lama pakai exact-name global
 * sehingga gagal. Kini Overpass memakai koordinat kecamatan +
 * regex nama + multi endpoint, DAN ring outer yang terpecah
 * di-stitch menjadi poligon utuh (penyebab boundary "bolong").
 * ============================================================ */
(function (root) {
  'use strict';

  const $ = (s) => document.querySelector(s);

  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  const GEOIT_URL = 'https://server.geoit.dev/vendor/batas-admin//download.php';
  /* alias nama provinsi GeoNames -> nama Permendagri */
  const PROV_ALIAS = {
    'dki jakarta': 'daerah khusus ibukota jakarta',
    'di yogyakarta': 'daerah istimewa yogyakarta',
  };

  function norm(s) {
    return (s || '').toString().toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function normKab(s) {
    let t = norm(s);
    t = t.replace(/\badministrasi\b/g, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^kab(upaten)?\s+/, '').trim();
    return t;
  }

  const MapMod = {
    map: null,
    boundaryLayer: null,
    marker: null,
    cacheKey: 'lta_bound_cache_v3',
    initialized: false,

    /* ---------- inisialisasi Leaflet ---------- */
    init(containerId) {
      if (this.initialized) return;
      const L = root.L;
      if (!L) { console.warn('Leaflet belum termuat'); return; }
      this.map = L.map(containerId, {
        center: [-2.3, 118], zoom: 5, zoomControl: true,
        attributionControl: true, preferCanvas: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(this.map);
      this.initialized = true;
      setTimeout(() => this.map.invalidateSize(), 150);
    },

    /* ---------- cache LRU boundary ---------- */
    _loadCache() {
      try { return JSON.parse(localStorage.getItem(this.cacheKey) || '{}'); }
      catch (e) { return {}; }
    },
    _saveCache(c) {
      try {
        const entries = Object.entries(c)
          .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).slice(0, 30);
        localStorage.setItem(this.cacheKey, JSON.stringify(Object.fromEntries(entries)));
      } catch (e) { /* kuota penuh — abaikan */ }
    },
    _cacheGet(key) {
      const c = this._loadCache();
      if (c[key]) { c[key].ts = Date.now(); this._saveCache(c); return c[key]; }
      return null;
    },
    _cachePut(key, geo, approx) {
      const c = this._loadCache();
      c[key] = { geo, approx: !!approx, ts: Date.now() };
      this._saveCache(c);
    },

    /* ---------- fetch helper: JSON dgn timeout ---------- */
    async _fetchJson(url, ms) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms || 20000);
      try {
        const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } finally { clearTimeout(t); }
    },

    /* ---------- Overpass multi-endpoint ---------- */
    async _overpass(query, ms) {
      const body = 'data=' + encodeURIComponent(query);
      for (const ep of OVERPASS_ENDPOINTS) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), ms || 45000);
          const r = await fetch(ep, {
            method: 'POST', body, cache: 'no-store', signal: ctrl.signal,
          });
          clearTimeout(t);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return await r.json();
        } catch (e) { console.warn('Overpass', ep, e.message); }
      }
      return null;
    },

    /* ============================================================
     * RING STITCHING — gabungkan way outer yang terpecah menjadi
     * cincin tertutup (bug utama boundary "tidak terrender").
     * ============================================================ */
    stitchRings(segments) {
      const K = (p) => p[0].toFixed(7) + '|' + p[1].toFixed(7);
      const pool = [];
      for (const s of segments) {
        // buang titik duplikat berurutan & segmen degenerate
        const clean = [];
        for (const p of s) {
          if (!clean.length || K(clean[clean.length - 1]) !== K(p)) clean.push(p);
        }
        if (clean.length >= 2) pool.push(clean);
      }
      const rings = [];
      while (pool.length) {
        let ring = pool.shift();
        let extended = true;
        while (extended && K(ring[0]) !== K(ring[ring.length - 1])) {
          extended = false;
          const startK = K(ring[0]), endK = K(ring[ring.length - 1]);
          for (let i = 0; i < pool.length; i++) {
            const s = pool[i];
            const s0 = K(s[0]), sN = K(s[s.length - 1]);
            if (s0 === endK) { ring = ring.concat(s.slice(1)); pool.splice(i, 1); extended = true; break; }
            if (sN === endK) { ring = ring.concat(s.slice(0, -1).reverse()); pool.splice(i, 1); extended = true; break; }
            if (sN === startK) { ring = s.slice(0, -1).concat(ring); pool.splice(i, 1); extended = true; break; }
            if (s0 === startK) { ring = s.slice(1).reverse().concat(ring); pool.splice(i, 1); extended = true; break; }
          }
        }
        if (K(ring[0]) === K(ring[ring.length - 1]) && ring.length >= 4) rings.push(ring);
      }
      return rings;
    },

    /* point-in-polygon (ray casting) untuk asosiasi lubang */
    _pointInRing(p, ring) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if ((yi > p[1]) !== (yj > p[1]) &&
            p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },

    /* Ubah relasi Overpass ("out geom") → GeoJSON Polygon/MultiPolygon */
    overpassToGeojson(rel) {
      const outerSegs = [], innerSegs = [];
      for (const m of rel.members || []) {
        if (!m.geometry) continue;
        const pts = m.geometry.filter((p) => p && p.lon != null && p.lat != null)
          .map((p) => [p.lon, p.lat]);
        if (pts.length < 2) continue;
        if (m.role === 'outer') outerSegs.push(pts);
        else if (m.role === 'inner') innerSegs.push(pts);
      }
      if (!outerSegs.length) return null;
      const outers = this.stitchRings(outerSegs);
      if (!outers.length) return null;
      const inners = this.stitchRings(innerSegs);

      if (outers.length === 1) {
        const coords = [outers[0]];
        for (const h of inners) {
          if (this._pointInRing(h[0], outers[0])) coords.push(h);
        }
        return { type: 'Polygon', coordinates: coords };
      }
      // multi outer: asosiasikan lubang ke outer penampungnya
      const polys = outers.map((o) => {
        const shells = [o];
        for (const h of inners) {
          if (this._pointInRing(h[0], o)) shells.push(h);
        }
        return shells;
      });
      return { type: 'MultiPolygon', coordinates: polys };
    },

    /* ---------- strategi A: Nominatim ---------- */
    async _viaNominatim(kec, kabClean) {
      const variants = [
        kec.name + ', ' + kabClean + ', Indonesia',
        'Kecamatan ' + kec.name + ', ' + kabClean + ', Indonesia',
      ];
      for (const q of variants) {
        try {
          const j = await this._fetchJson('https://nominatim.openstreetmap.org/search?q=' +
            encodeURIComponent(q) + '&format=jsonv2&polygon_geojson=1&limit=10&countrycodes=id', 18000);
          if (!Array.isArray(j) || !j.length) continue;
          const rel = j.filter((x) => x.osm_type === 'relation' && x.type === 'administrative' && x.geojson);
          if (!rel.length) continue; // hanya node? coba varian berikutnya
          const kabLc = kabClean.toLowerCase();
          const pick =
            rel.find((x) => (x.display_name || '').toLowerCase().indexOf(kabLc) !== -1 &&
              ['admin_centre', 'county', 'city_district', 'borough', 'district', 'suburb', 'municipality', 'town']
                .indexOf(x.addresstype) !== -1) ||
            rel.find((x) => (x.display_name || '').toLowerCase().indexOf(kabLc) !== -1) ||
            rel.find((x) => ['suburb', 'city_district', 'borough', 'district', 'town', 'municipality']
              .indexOf(x.addresstype) !== -1) || rel[0];
          if (pick && pick.geojson) return pick.geojson;
        } catch (e) { console.warn('Nominatim gagal:', e.message); }
      }
      return null;
    },

    /* ---------- strategi B/C: Overpass around+regex ---------- */
    async _viaOverpass(kec) {
      const nm = kec.name.replace(/[\\'"()]/g, ' ').trim();
      const attempts = [
        // B: kecamatan (admin_level=7) di sekitar koordinat
        '[out:json][timeout:50];relation["boundary"="administrative"]["admin_level"="7"]' +
          '["name"~"^(Kecamatan )?' + nm + '$",i](around:30000,' + kec.lat + ',' + kec.lon + ');out geom;',
        // C: level 6/8 (pemekaran kadang salah tag) di sekitar koordinat
        '[out:json][timeout:50];relation["boundary"="administrative"]' +
          '["admin_level"~"^(6|8)$"]["name"~"^(Kecamatan )?' + nm + '$",i](around:20000,' + kec.lat + ',' + kec.lon + ');out geom;',
      ];
      for (const oq of attempts) {
        const j = await this._overpass(oq);
        if (!j || !Array.isArray(j.elements)) continue;
        // pilih relasi terdekat ke titik pusat kecamatan
        let best = null, bestD = Infinity;
        for (const el of j.elements) {
          if (el.type !== 'relation') continue;
          const geo = this.overpassToGeojson(el);
          if (!geo) continue;
          let minD = 0, found = false;
          const walk = (c) => {
            if (typeof c[0] === 'number') {
              const d = Math.hypot(c[0] - kec.lon, c[1] - kec.lat);
              if (!found || d < minD) { minD = d; found = true; }
            } else for (const c2 of c) walk(c2);
          };
          walk(geo.coordinates);
          if (found && minD < bestD) { bestD = minD; best = geo; }
        }
        if (best && bestD < 0.5) return best; // <0,5° dari pusat → pasti yang benar
      }
      return null;
    },

    /* ============================================================
     * Strategi resmi: dataset batas administrasi (Permendagri 2023,
     * mirror geoit.dev) via kode kecamatan Kemendagri 2025 yang
     * di-bundel (js/data/kec_codes.js, 7.285 kecamatan).
     * Menutup kecamatan yang TIDAK ada di OSM (mis. Tulung,
     * Blimbingsari hasil pemekaran).
     * ============================================================ */

    /* WKT MULTIPOLYGON/POLYGON → GeoJSON (state machine ring-depth) */
    wktToGeojson(wkt) {
      if (!wkt) return null;
      const w = String(wkt).trim();
      const isMP = /^MULTIPOLYGON/i.test(w);
      const start = w.indexOf('(');
      if (start < 0) return null;
      const base = isMP ? 2 : 1;
      let depth = 0, buf = '', polys = [], rings = [];
      for (let i = start; i < w.length; i++) {
        const ch = w[i];
        if (ch === '(') { depth++; buf = ''; }
        else if (ch === ')') {
          if (depth === base) {
            const pts = [];
            for (const pair of buf.split(',')) {
              const xy = pair.trim().split(/\s+/);
              if (xy.length >= 2) {
                const x = parseFloat(xy[0]), y = parseFloat(xy[1]);
                if (isFinite(x) && isFinite(y)) pts.push([x, y]);
              }
            }
            if (pts.length >= 4) rings.push(pts);
          } else if (depth === base - 1) {
            if (rings.length) { polys.push(rings); rings = []; }
          }
          depth--;
          if (depth <= 0) {
            if (rings.length) { polys.push(rings); rings = []; }
            break;
          }
        } else if (depth >= base) buf += ch;
      }
      if (!polys.length) return null;
      return isMP ? { type: 'MultiPolygon', coordinates: polys }
                  : { type: 'Polygon', coordinates: polys[0] };
    },

    _geoBBox(geo) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const walk = (c) => {
        if (typeof c[0] === 'number') {
          if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
          if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
        } else for (const c2 of c) walk(c2);
      };
      walk(geo.coordinates);
      return [x0, y0, x1, y1];
    },
    _bboxHasPoint(bb, lon, lat, pad) {
      const p = pad || 0.05;
      return lon >= bb[0] - p && lon <= bb[2] + p && lat >= bb[1] - p && lat <= bb[3] + p;
    },

    async _geoitFetch(fid, column, table, ms) {
      try {
        const j = await this._fetchJson(GEOIT_URL + '?fid=' + encodeURIComponent(fid) +
          '&column=' + encodeURIComponent(column) + '&table=' + encodeURIComponent(table), ms || 30000);
        if (j && j.code === 200 && Array.isArray(j.data)) return j.data;
        return null;
      } catch (e) { console.warn('geoit', table, e.message); return null; }
    },

    async _viaGeoit(kec, kabClean) {
      const K = root.KECCODES || {}, P = root.PROVCODES || {};
      const key = norm(kec.name) + '|' + normKab(kec.kab || kabClean);
      const code = K[key];

      // D1: kode eksak per kecamatan
      if (code) {
        const rows = await this._geoitFetch(code, 'kode_kec', 'kecamatan');
        const geo = this._pickGeoit(rows, kec);
        if (geo) return geo;
      }

      // D2: daftar kab/kota per provinsi → bundle kecamatan satu kabupaten
      const pkey = norm(kec.prov || '');
      const provCode = P[pkey] || P[PROV_ALIAS[pkey] || ''];
      if (provCode) {
        const kabs = await this._kabCodes(provCode);
        const kKey = normKab(kec.kab || kabClean);
        const kk = kabs[kKey];
        if (kk) {
          const rows = await this._geoitFetch(kk, 'kode_kec', 'kecamatan', 45000);
          const geo = this._pickGeoit(rows, kec);
          if (geo) return geo;
        }
      }
      return null;
    },

    _pickGeoit(rows, kec) {
      if (!rows || !rows.length) return null;
      let fallback = null;
      for (const r of rows) {
        const geo = this.wktToGeojson(r.WKT_GEOMETRY);
        if (!geo) continue;
        const bb = this._geoBBox(geo);
        const okPoint = this._bboxHasPoint(bb, kec.lon, kec.lat, 0.15);
        if (norm(r.kecamatan || r.nama || '') === norm(kec.name)) {
          if (okPoint || rows.length === 1) return geo;
          fallback = fallback || geo; // nama cocok tapi titik jauh
        } else if (okPoint && !fallback) fallback = geo;
      }
      return fallback;
    },

    _kabCodes(provCode) {
      const CK = 'lta_kabcodes_v1';
      const c = this._loadCache();
      // cache global terpisah agar tak tergusur LRU boundary
      try {
        const all = JSON.parse(localStorage.getItem(CK) || '{}');
        if (all[provCode]) return all[provCode];
      } catch (e) { /* abaikan */ }
      const self = this;
      return this._geoitFetch(provCode, 'kode_prov', 'kabkota', 25000).then((rows) => {
        if (!rows) return {};
        const m = {};
        for (const r of rows) m[normKab(r.kab_kota || r.nama || '')] = r.kode_kk || r.fid;
        try {
          const all2 = JSON.parse(localStorage.getItem(CK) || '{}');
          all2[provCode] = m;
          const keys = Object.keys(all2);
          while (keys.length > 40) delete all2[keys.shift()];
          localStorage.setItem(CK, JSON.stringify(all2));
        } catch (e) { /* kuota */ }
        return m;
      }).catch(() => ({}));
    },

    /* ---------- strategi D: perkiraan lingkaran ---------- */
    _approxRadius(kec) {
      const G = root.GEODATA;
      if (!G || !G.kec) return 0.035; // ~3,5 km default
      let min = Infinity;
      for (let i = 0; i < G.kec.length; i++) {
        const r = G.kec[i];
        if (r[3] === kec.lat && r[4] === kec.lon) continue;
        const d = Math.hypot((r[4] - kec.lon) * Math.cos(kec.lat * Math.PI / 180), r[3] - kec.lat);
        if (d > 0 && d < min) min = d;
      }
      if (!isFinite(min)) return 0.035;
      const km = Math.min(9, Math.max(1.2, min * 111 * 0.55)); // 55% jarak tetangga
      return km / 111;
    },
    _approxCircleGeo(kec) {
      const R = this._approxRadius(kec);
      const pts = [];
      for (let a = 0; a <= 72; a++) {
        const th = (a / 72) * 2 * Math.PI;
        pts.push([
          kec.lon + R * Math.sin(th) / Math.cos(kec.lat * Math.PI / 180),
          kec.lat + R * Math.cos(th),
        ]);
      }
      return { type: 'Polygon', coordinates: [pts] };
    },

    /* ---------- ambil boundary kecamatan ---------- */
    async fetchBoundary(kec) {
      const key = kec.name + '|' + (kec.kab || '') + '|' + (kec.prov || '');
      const cached = this._cacheGet(key);
      if (cached) return { geo: cached.geo, source: 'cache', approx: cached.approx };

      const kabClean = (kec.kab || kec.prov || '').replace(/^(Kota|Kabupaten|Kab|Kota Administrasi)\s+/i, '');

      // A. Nominatim
      const nGeo = await this._viaNominatim(kec, kabClean);
      if (nGeo) { this._cachePut(key, nGeo, false); return { geo: nGeo, source: 'nominatim', approx: false }; }

      // D. Dataset resmi Permendagri (kode eksak / bundle kabupaten)
      const gGeo = await this._viaGeoit(kec, kabClean);
      if (gGeo) { this._cachePut(key, gGeo, false); return { geo: gGeo, source: 'geoit', approx: false }; }

      // B/C. Overpass around+regex
      const oGeo = await this._viaOverpass(kec);
      if (oGeo) { this._cachePut(key, oGeo, false); return { geo: oGeo, source: 'overpass', approx: false }; }

      // D. Perkiraan
      const aGeo = this._approxCircleGeo(kec);
      this._cachePut(key, aGeo, true);
      return { geo: aGeo, source: 'approx', approx: true };
    },

    /* ---------- tampilkan kecamatan di peta ---------- */
    async showKecamatan(kec, info) {
      if (!this.initialized) this.init('map');
      const L = root.L;

      if (this.boundaryLayer) { this.map.removeLayer(this.boundaryLayer); this.boundaryLayer = null; }
      if (this.marker) { this.map.removeLayer(this.marker); this.marker = null; }

      this.marker = L.circleMarker([kec.lat, kec.lon], {
        radius: 6, color: '#fff', weight: 2, fillColor: '#7c5cff', fillOpacity: 1,
      }).addTo(this.map);

      const res = await this.fetchBoundary(kec);
      const style = res.approx
        ? { color: '#ff9f43', weight: 2, fillColor: '#ff9f43', fillOpacity: 0.10, dashArray: '2 6' }
        : { color: '#7c5cff', weight: 2.5, fillColor: '#7c5cff', fillOpacity: 0.25, dashArray: '4 3' };
      this.boundaryLayer = L.geoJSON(res.geo, { style }).addTo(this.layerOrMap());
      try { this.map.fitBounds(this.boundaryLayer.getBounds(), { padding: [40, 40] }); }
      catch (e) { this.map.setView([kec.lat, kec.lon], 12); }
      return { source: res.source, approx: res.approx };
    },

    layerOrMap() { return this.map; },

    /* ---------- pencarian & autocomplete ---------- */
    _norm(s) {
      return (s || '').toString().toLowerCase()
        .replace(/^kecamatan\s+/, '').replace(/^kec\.\s+/, '').trim();
    },

    search(query, limit) {
      const G = root.GEODATA;
      if (!G || !G.kec) return [];
      const q = this._norm(query);
      if (!q) return [];
      const lim = limit || 12;
      const starts = [], contains = [];
      for (let i = 0; i < G.kec.length; i++) {
        const k = G.kec[i];
        const n = k[0].toLowerCase();
        if (n === q) starts.unshift(i);
        else if (n.startsWith(q)) starts.push(i);
        else if (n.indexOf(q) !== -1) contains.push(i);
        if (starts.length >= lim) break;
      }
      const ids = starts.concat(contains).slice(0, lim);
      return ids.map((i) => {
        const row = G.kec[i];
        return {
          idx: i, name: row[0], kab: G.kab[row[1]] || '', prov: G.provinces[row[2]] || '',
          lat: row[3], lon: row[4],
        };
      });
    },

    /** Ambil kecamatan berdasar indeks dataset. */
    byIndex(i) {
      const G = root.GEODATA;
      const row = G.kec[i];
      return { idx: i, name: row[0], kab: G.kab[row[1]] || '', prov: G.provinces[row[2]] || '', lat: row[3], lon: row[4] };
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MapMod;
  else root.MapMod = MapMod;
})(typeof window !== 'undefined' ? window : globalThis);
