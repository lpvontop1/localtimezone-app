# 🕐 Zona Waktu Lokal Indonesia

Aplikasi Android **hybrid** (Kotlin + WebView fullscreen) untuk Android 9+ (API 28).
Seluruh komponen & logika berbasis **HTML/CSS/JS**, dibungkus Kotlin sebagai container APK,
dengan **3 widget Android** yang menghitung mandiri lewat mirror Kotlin.

![Platform](https://img.shields.io/badge/Android-9%2B%20(API%2028)-green) ![Build](https://img.shields.io/badge/Gradle-8.7-blue) ![Kotlin](https://img.shields.io/badge/Kotlin-1.9.24-purple)

---

## ✨ Fitur

| # | Fitur | Keterangan |
|---|-------|------------|
| 1 | **Zona waktu akurat & menyeluruh** | 6.916 kecamatan se-Indonesia (38 provinsi, 512 kab/kota). Waktu legal WIB/WITA/WIT per provinsi (Keppres 41/1987) **dan** waktu matahari sejati dari bujur: 15° = 1 jam, 7,5° = 30 mnt, 3,75° = 15 mnt, presisi penuh 1° = 4 mnt. |
| 2 | **Equation of Time** | Formula NOAA memperhitungkan orbit elips bumi + axial tilt 23,44°. EoT ±16,4 menit, ditampilkan live + kurva setahun. |
| 3 | **Peta kecamatan (GeoJSON live "2026")** | Cari kecamatan → boundary digambar live dari OpenStreetMap (Nominatim → fallback Overpass), highlight ungu, selalu versi terkini termasuk pemekaran 2024–2026, di-cache LRU untuk offline. |
| 4 | **Cuaca per kecamatan** | Open-Meteo: suhu, terasa, kelembapan, angin + prakiraan 3 hari. |
| 5 | **Deteksi lokasi pengguna** | GPS (WebView Geolocation) → reverse-geocode → waktu saat ini + waktu legal ditampilkan otomatis. |
| 6 | **Waktu sholat** | Metode Kemenag (Subuh 20°, Isya 18°, Ashar Syafi'i/Hanafi, ihtiyat ±2 mnt), murni astronomis → prediksi tanggal berapa pun (navigasi harian & tabel bulanan), verifikasi online Aladhan API. |
| 7 | **Widget Android** (tahan lama-press ikon app di Samsung/One UI) | ① Jam Zona — TextClock legal + waktu matahari (update tiap menit) ② Jadwal Sholat — 6 waktu + hitung mundur ③ Mini Solar Clock 2×1. |
| 8 | **Bonus** | Grafik EoT setahun, posisi matahari (azimut/elevasi), panjang siang, tanggal Hijriah, berbagi info waktu, self-test diagnostik in-app. |

## 🏗️ Arsitektur

```
┌─────────────────────────── APK ───────────────────────────┐
│  Kotlin (container)                                        │
│  ├─ MainActivity      : WebView fullscreen immersive       │
│  ├─ NativeBridge      : JS ⇄ Kotlin (saveState/share/…)    │
│  ├─ AstroCalc.kt      : mirror formula (widget mandiri)    │
│  ├─ 3× AppWidgetProvider + AlarmReceiver (tick 60 detik)   │
│  └─ BootReceiver      : pasang ulang alarm setelah reboot  │
│                                                            │
│  assets/www (HTML/CSS/JS)                                  │
│  ├─ astro.js    : EoT NOAA, deklinasi, TST, terbit/terbenam│
│  ├─ zones.js    : WIB/WITA/WIT per provinsi + heuristik    │
│  ├─ prayer.js   : jadwal sholat + prediksi masa depan      │
│  ├─ map.js      : Leaflet + boundary live OSM + cache LRU  │
│  ├─ weather.js  : Open-Meteo                               │
│  ├─ geodata.js  : 6.916 kecamatan (GeoNames ADM3)          │
│  └─ app.js      : UI Beranda / Peta / Sholat / Lainnya     │
└────────────────────────────────────────────────────────────┘
```

**Nol dependensi eksternal** (hanya Kotlin stdlib + framework Android) — APK mungil, build cepat.

## 📐 Formula (ringkas)

- γ = 2π·n/365 (n = hari-ke dalam tahun)
- **EoT** = 229,18·(0,000075 + 0,001868·cosγ − 0,032077·sinγ − 0,014615·cos2γ − 0,040849·sin2γ) [menit]
- **Deklinasi** = Spencer (±0,035°)
- **Waktu matahari sejati** = UTC + bujur×4 menit + EoT
- **Noon** = 12:00 − bujur×4 − EoT (UTC) → dikonversi ke jam legal
- **Sholat**: hour-angle dari sudut ketinggian; Ashar alt = arctan(1/(T + tan|φ−δ|)), T=1 (Syafi'i) / 2 (Hanafi)

## 🔧 Build

```bash
# Prasyarat: JDK 17, Android SDK 34
gradle assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
gradle assembleRelease        # ditandatangani debug key (installable)
node tests/run-all.js         # 6 suite test (astro/zones/data/prayer/stress/blackbox)
```

Atau cukup push — **GitHub Actions** membangun APK otomatis (artifact di tab Actions, release saat tag `v*`).

## 🧪 Testing (ringkasan)

| Suite | Isi | Hasil |
|-------|-----|-------|
| test-astro | EoT vs titik referensi NOAA (maks/min/nol), deklinasi solstis/ekuinoks, terbit/terbenam Jakarta | 23/23 |
| test-zones | 38 provinsi → zona, heuristik bujur, format tanggal | 51/51 |
| test-data | Integritas 6.916 baris (bbox, indeks, nama, distribusi) | 12/12 |
| test-prayer | Invarian urutan, gap tropis, **validasi live Aladhan metode-20 (Kemenag): selisih ≤ 2 menit** di WIB/WITA/WIT | 26/26 |
| stress-test | 6.916 kec × 1 hari = 19 ms · 6.916 × 365 hari (2,52 jt hitungan) = 1,23 s · autocomplete 0,21 ms/query | semua target tercapai |
| blackbox | 10 alur pengguna (pencarian Menteng, ambiguitas, widget-state, cuaca, robustness ekstrem) | 26/26 |
| UI headless browser | Beranda/Peta/Sholat/Lainnya + self-test in-app 10/10, 0 error konsol | lulus |

Detail: [`docs/TESTING.md`](docs/TESTING.md)

## 📚 Sumber data & kredit

- Kecamatan: [GeoNames](https://www.geonames.org/) dump ID.zip + hierarchy (CC BY 4.0) — snapshot 2026-10-02; kecamatan hasil pemekaran terbaru yang belum tercakup tetap dapat dicari via Nominatim online.
- Boundary peta: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL) — live, selalu terkini.
- Cuaca: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
- Verifikasi sholat: [Aladhan API](https://aladhan.com/prayer-times-api) metode 20 (KEMENAG RI).
- Formula astronomi: [NOAA Solar Calculator](https://gml.noaa.gov/grad/solcalc/).

## ⚠️ Catatan

- **Waktu legal** mengikuti Keppres 41/1987 (WIB UTC+7, WITA UTC+8, WIT UTC+9).
- **Waktu matahari sejati** bersifat astronomis/ilustratif — bukan waktu resmi.
- Jadwal sholat murni astronomis, dapat berbeda ±2 menit dari publikasi resmi Kemenag (perbedaan konvensi ihtiyat/pembulatan); gunakan tombol verifikasi online untuk membandingkan.
- Keystore `keystore/debug.keystore` (pass: `localtime`) hanya untuk demo — ganti sebelum rilis publik.

## 📄 Lisensi

MIT
