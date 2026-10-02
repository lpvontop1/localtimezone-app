/* ============================================================
 * map.js — Peta kecamatan (Leaflet + OSM)
 *
 * Boundary "GeoJSON 2026": diambil LANGSUNG dari OpenStreetMap
 * (Nominatim polygon_geojson → fallback Overpass API), sehingga
 * selalu versi terkini termasuk pemekaran 2024-2026. Hasil di-cache
 * LRU di localStorage (maks 30 poligon) agar offline tetap bisa.
 * ============================================================ */
(function (root) {
  'use strict';

  const $ = (s) => document.querySelector(s);

  const MapMod = {
    map: null,
    boundaryLayer: null,
    marker: null,
    cacheKey: 'lta_bound_cache_v2',
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
        // batasi 30 entri: buang yang terlama dipakai
        const entries = Object.entries(c)
          .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).slice(0, 30);
        localStorage.setItem(this.cacheKey, JSON.stringify(Object.fromEntries(entries)));
      } catch (e) { /* kuota penuh — abaikan */ }
    },
    _cacheGet(key) {
      const c = this._loadCache();
      if (c[key]) { c[key].ts = Date.now(); this._saveCache(c); return c[key].geo; }
      return null;
    },
    _cachePut(key, geo) {
      const c = this._loadCache();
      c[key] = { geo, ts: Date.now() };
      this._saveCache(c);
    },

    /* ---------- ambil boundary kecamatan ---------- */
    async fetchBoundary(kec) {
      const key = kec.name + '|' + (kec.kab || '') + '|' + (kec.prov || '');
      const cached = this._cacheGet(key);
      if (cached) return { geo: cached, source: 'cache' };

      // 1) Nominatim: cari RELASI administratif (boundary kecamatan).
      //    Tanpa prefiks "Kecamatan" (OSM menamai relasi hanya "Menteng"),
      //    lalu filter sisi-klien agar tidak tertukar dgn Puskesmas/kantor.
      const kabClean = (kec.kab || kec.prov || '').replace(/^(Kota|Kabupaten|Kab|Kota Administrasi)\s+/i, '');
      const q = encodeURIComponent(kec.name + ', ' + kabClean + ', Indonesia');
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?q=' + q +
          '&format=jsonv2&polygon_geojson=1&limit=8&countrycodes=id', { cache: 'no-store' });
        if (r.ok) {
          const arr = await r.json();
          const rel = arr.filter(x => x.osm_type === 'relation' && x.type === 'administrative' && x.geojson);
          const kabLc = kabClean.toLowerCase();
          const pick = rel.find(x => (x.display_name || '').toLowerCase().indexOf(kabLc) !== -1) ||
            rel.find(x => ['suburb', 'city_district', 'borough', 'district', 'town', 'municipality']
              .indexOf(x.addresstype) !== -1) || rel[0];
          if (pick) {
            this._cachePut(key, pick.geojson);
            return { geo: pick.geojson, source: 'nominatim' };
          }
        }
      } catch (e) { console.warn('Nominatim gagal:', e.message); }

      // 2) Overpass fallback: relasi admin_level=6|7 berdasar nama
      try {
        const oq = '[out:json][timeout:30];relation["boundary"="administrative"]' +
          '["admin_level"~"^(6|7)$"]["name"="' + kec.name.replace(/"/g, '\\"') + '"];out geom 1;';
        const r2 = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(oq), { cache: 'no-store' });
        if (r2.ok) {
          const j = await r2.json();
          const el = (j.elements || [])[0];
          if (el && el.members) {
            const geo = this._overpassToGeojson(el);
            if (geo) { this._cachePut(key, geo); return { geo, source: 'overpass' }; }
          }
        }
      } catch (e) { console.warn('Overpass gagal:', e.message); }

      return null;
    },

    /* Ubah hasil Overpass relation (members geometry) → GeoJSON MultiPolygon/Polygon */
    _overpassToGeojson(rel) {
      const polys = [];
      const outer = [];
      for (const m of rel.members || []) {
        if (m.role === 'outer' && m.geometry) {
          outer.push(m.geometry.map(pt => [pt.lon, pt.lat]));
        }
      }
      if (!outer.length) return null;
      if (outer.length === 1) {
        return { type: 'Polygon', coordinates: [outer[0]] };
      }
      return { type: 'MultiPolygon', coordinates: outer.map(ring => [ring]) };
    },

    /* ---------- tampilkan kecamatan di peta ---------- */
    async showKecamatan(kec, info) {
      if (!this.initialized) this.init('map');
      const L = root.L;

      // bersihkan layer lama
      if (this.boundaryLayer) { this.map.removeLayer(this.boundaryLayer); this.boundaryLayer = null; }
      if (this.marker) { this.map.removeLayer(this.marker); this.marker = null; }

      // marker titik pusat
      this.marker = L.circleMarker([kec.lat, kec.lon], {
        radius: 6, color: '#fff', weight: 2, fillColor: '#7c5cff', fillOpacity: 1,
      }).addTo(this.map);

      // coba ambil boundary
      const res = await this.fetchBoundary(kec);
      if (res) {
        this.boundaryLayer = L.geoJSON(res.geo, {
          style: { color: '#7c5cff', weight: 2.5, fillColor: '#7c5cff', fillOpacity: 0.25, dashArray: '4 3' },
        }).addTo(this.map);
        try { this.map.fitBounds(this.boundaryLayer.getBounds(), { padding: [40, 40] }); }
        catch (e) { this.map.setView([kec.lat, kec.lon], 12); }
      } else {
        this.map.setView([kec.lat, kec.lon], 12);
      }
      return res ? res.source : null;
    },

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
