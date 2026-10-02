# 🧪 Dokumentasi Testing — Zona Waktu Lokal Indonesia

Tanggal: 2026-10-02 · Lingkungan: Node v24 (mesin build), headless Chromium (UI), JDK 21/17 (APK)

## 1. Strategi

Pengujian dilakukan berlapis:

1. **Unit test** — formula astronomi & pemetaan zona diuji terhadap referensi eksternal (NOAA, Aladhan/Kemenag, tabel solstis/ekuinoks).
2. **Integritas data** — setiap baris dataset kecamatan divalidasi.
3. **Stress test** — beban maksimum: seluruh kecamatan × setahun.
4. **Black box test** — alur pengguna end-to-end dari API modul yang sama dengan yang dipakai UI.
5. **UI test headless browser** — aplikasi web sesungguhnya dijalankan, diklik, dan dipfoto.
6. **Self-test in-app** — pengguna dapat menjalankan 10 diagnostik dari menu Lainnya.

## 2. Unit test

### test-astro.js (23 asersi)
- EoT diverifikasi pada 8 titik referensi NOAA tahun 2026: minimum −14,2 mnt (11 Feb) → hasil −14,20; maksimum +16,4 mnt (3 Nov) → hasil +16,37; empat titik nol (15 Apr, 13 Jun, 1 Sep, 25 Des) semuanya < 0,4 mnt.
- Batas fisik |EoT| ≤ 16,9 mnt untuk 365 hari.
- Deklinasi: solstis Juni +23,45°, Desember −23,42°, ekuinoks Maret −0,46° (momen ekuinoks 20 Mar 14:46 UTC — dalam toleransi).
- Terbit/terbenam Jakarta 21 Jun: 06:01 & 17:47 WIB, simetris terhadap noon ±2 mnt.
- Posisi matahari: noon Juni di Jakarta az≈1° (utara — matahari di belahan utara saat Juni) ✓; Desember az≈187° (selatan) ✓.

### test-zones.js (51 asersi)
- 38 provinsi dipetakan ke zona legal sesuai Keppres 41/1987 (17 WIB, 13 WITA, 8 WIT).
- Heuristik bujur untuk 9 kota acuan (Banda Aceh → WIB … Jayapura → WIT).
- Seluruh 6.916 kecamatan pada dataset terpetakan 100%.

### test-data.js (12 aserti)
- 6.916 kecamatan; semua koordinat dalam bbox Indonesia (94–141,2 BT; −11,5–7,0 LS); semua indeks valid; Menteng → Kota Jakarta Pusat / DKI Jakarta pada (−6,1944, 106,8333); setiap provinsi ≥ 5 kecamatan.

### test-prayer.js (26 asersi)
- Invarian urutan Subuh<Terbit<Dzuhur<Ashar<Maghrib<Isya untuk 8 lokasi × 53 tanggal (424 kombinasi) — 0 pelanggaran.
- Gap antar-waktu dalam rentang fisik tropis.
- **Validasi live api.aladhan.com metode 20 (KEMENAG RI), 2 Okt 2026:**

| Waktu | Aladhan | Aplikasi | Selisih |
|-------|---------|----------|---------|
| Subuh | 04:20 | 04:18 | 2 mnt |
| Terbit | 05:37 | 05:39 | 2 mnt |
| Dzuhur | 11:42 | 11:44 | 2 mnt |
| Ashar | 14:47 | 14:48 | 1 mnt |
| Maghrib | 17:47 | 17:49 | 2 mnt |
| Isya | 18:56 | 18:58 | 2 mnt |

  Selisih konstan ±2 mnt berasal dari konvensi ihtiyat/pembulatan; Makassar & Jayapura juga ≤ 2 mnt.
- Prediksi lintas tahun: Dzuhur 2 Okt 2026 vs 2027 selisih 0,0 mnt (murni astronomis).

## 3. Stress test

| Skenario | Target | Hasil | Status |
|----------|--------|-------|--------|
| S1: 6.916 kec × 1 hari (astro+sholat) | < 4 s | **19 ms** | ✅ |
| S2: 6.916 kec × 365 hari (EoT+TST) = 2.524.340 hitungan | < 20 s | **1,23 s** | ✅ |
| S3: 25 kec × 365 hari × 6 waktu (prediksi tahunan) | < 3 s | **10 ms** | ✅ |
| S4: autocomplete 5.000 kueri | < 2 s total | **1,05 s (0,21 ms/query)** | ✅ |
| S5: tick UI penuh | < 5 ms | **< 0,1 ms** | ✅ |

Asumsi perangkat Android kelas bawah ~5× lebih lambat: semua masih jauh di bawah target (S2 ≈ 6 s di perangkat terlemah — sekali pakai saat inisialisasi, tidak di jalur 60 fps).

## 4. Black box test (26 asersi, 10 skenario)

- **FB1–FB2** Pencarian "menteng" (variasi huruf besar/prefiks/spasi) → hasil teratas selalu Kec. Menteng, Kota Jakarta Pusat, DKI Jakarta, koordinat benar.
- **FB3** Kueri tak valid (`""`, `null`, "zzzzqqqq") → 0 hasil tanpa crash; nama ambigu ("sukamaju") ditemukan di Sulawesi Selatan.
- **FB4** Distribusi zona seluruh dataset: WIB=4.089, WITA=1.844, WIT=983 — ketiganya terpakai.
- **FB5** Jam berjalan: pada 12:00 WIB, waktu matahari 12:18 (+18,0 mnt = LMT +7,3 + EoT +10,8) — konsisten dengan teori.
- **FB6** Prediksi sholat Bali 90 hari ke depan — urutan selalu valid.
- **FB7** Kontrak JSON JS→Kotlin untuk widget: field lengkap, tipe benar, zona DKI=7.
- **FB8** Parser cuaca Open-Meteo: kode WMO 80/95/9999 diterjemahkan benar.
- **FB9** Robustness: bujur 179,9°, lintang kutub (sunTimes null, sholat fallback), query numerik — tidak ada crash/NaN.
- **FB10** Heuristik bujur vs zona provinsi: mismatch 1,8% (< 8% batas) — kasus perbatasan (Kalteng, Jatim) hanya terjadi saat GPS tanpa internet.

## 5. UI test (headless Chromium, viewport 412×915)

| Langkah | Hasil |
|---------|-------|
| Buka aplikasi (splash → Beranda) | Jam 10:55:05 WIB, Hijriah 21 Rabiulakhir 1448 H (konsisten dgn Aladhan), waktu matahari 11:13:06, kurva EoT tergambar |
| Peta → cari "menteng" → pilih hasil | Boundary Kec. Menteng ter-highlight (poligon relasi OSM 7212895, 210 titik), popup waktu legal+matahari+EoT+cuaca live Open-Meteo (32,8 °C Cerah) |
| Tab Sholat | 6 waktu tampil, Dzuhur 11:44 WIB ditandai berikutnya dengan hitung mundur "≈ 0 jam 48 menit" |
| Tab Lainnya → Self-Test | 10/10 lulus (29 ms) |
| Konsol & error halaman | **0 error** sepanjang sesi |

Bug yang ditemukan & diperbaiki selama UI test:
1. **LMT salah offset** — "waktu matahari rata-rata" menambah offset zona legal (18:02; harusnya 11:02). Diperbaiki: LMT = UTC + bujur×4.
2. **Boundary tertukar** — Nominatim mengembalikan Puskesmas Kecamatan Menteng (klinik) sebagai hasil pertama. Diperbaiki: kueri tanpa prefiks "Kecamatan" + filter `osm_type=relation` & `type=administrative` + pencocokan nama kabupaten, fallback Overpass, bump cache v2.

## 6. Self-test in-app (menu Lainnya)

10 diagnostik ringan yang dijalankan pengguna: EoT maks/min/4-titik-nol, batas fisik, urutan sholat 200 kecamatan acak, 38 provinsi terpetakan, benchmark 9.125 hitungan. Hasil terakhir: **10 lulus / 0 gagal (29 ms)**.

## 7. Menjalankan ulang

```bash
node tests/run-all.js          # seluruh suite
node tests/test-astro.js       # per-suite
```
Test online (Aladhan) otomatis dilewati dengan aman bila offline.
