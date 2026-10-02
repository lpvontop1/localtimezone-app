package com.lpvontop.localtime

import java.util.Calendar
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * AstroCalc — mirror Kotlin dari js/astro.js + js/prayer.js.
 * Widget menghitung waktu matahari & sholat secara mandiri
 * tanpa perlu membuka aplikasi.
 * Formula: NOAA Solar Calculator.
 */
object AstroCalc {

    private const val RAD = Math.PI / 180.0
    private const val DEG = 180.0 / Math.PI

    fun mod(x: Double, m: Double): Double {
        val r = x % m
        return if (r < 0) r + m else r
    }

    /** Nomor hari dalam tahun (1–366) berdasarkan tanggal UTC. */
    fun dayOfYear(millis: Long): Int {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = millis
        val y = cal.get(Calendar.YEAR)
        val start = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { clear(); set(y, 0, 1, 0, 0, 0) }
        return ((cal.timeInMillis - start.timeInMillis) / 86400000L).toInt() + 1
    }

    private fun gamma(millis: Long, hourUTC: Double): Double {
        val n = dayOfYear(millis) - 1 + (hourUTC - 12.0) / 24.0
        return 2.0 * Math.PI / 365.0 * n
    }

    /** Equation of Time (menit). */
    fun equationOfTime(millis: Long, hourUTC: Double = 12.0): Double {
        val g = gamma(millis, hourUTC)
        return 229.18 * (
            0.000075 +
            0.001868 * cos(g) -
            0.032077 * sin(g) -
            0.014615 * cos(2 * g) -
            0.040849 * sin(2 * g)
        )
    }

    /** Deklinasi matahari (derajat). */
    fun solarDeclination(millis: Long, hourUTC: Double = 12.0): Double {
        val g = gamma(millis, hourUTC)
        val rad = 0.006918 -
            0.399912 * cos(g) + 0.070257 * sin(g) -
            0.006758 * cos(2 * g) + 0.000907 * sin(2 * g) -
            0.002697 * cos(3 * g) + 0.001480 * sin(3 * g)
        return rad * DEG
    }

    /** Waktu matahari sejati (menit sejak tengah malam, 0–1440). */
    fun trueSolarTimeMinutes(millis: Long, lon: Double): Double {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = millis
        val utcMin = cal.get(Calendar.HOUR_OF_DAY) * 60.0 +
            cal.get(Calendar.MINUTE) + cal.get(Calendar.SECOND) / 60.0
        val eot = equationOfTime(millis, utcMin / 60.0)
        return mod(utcMin + lon * 4.0 + eot, 1440.0)
    }

    /** Noon matahari dalam menit jam lokal (offset jam tz). */
    fun solarNoonMinutes(millis: Long, lon: Double, tzOffsetHours: Int): Double {
        val noonUTC = 720.0 - lon * 4.0 - equationOfTime(millis)
        return mod(noonUTC + tzOffsetHours * 60.0, 1440.0)
    }

    /** Sudut jam (derajat) utk ketinggian tertentu; null jika tak tercapai. */
    fun hourAngleDeg(altitudeDeg: Double, latDeg: Double, declDeg: Double): Double? {
        val cosH = (sin(altitudeDeg * RAD) - sin(latDeg * RAD) * sin(declDeg * RAD)) /
            (cos(latDeg * RAD) * cos(declDeg * RAD))
        if (cosH > 1 || cosH < -1) return null
        return acos(cosH) * DEG
    }

    data class SunTimes(val sunrise: Double, val sunset: Double, val dayLength: Double)

    fun sunTimes(millis: Long, lat: Double, lon: Double, tzOffsetHours: Int): SunTimes? {
        val decl = solarDeclination(millis)
        val h = hourAngleDeg(-0.833, lat, decl) ?: return null
        val noonUTC = 720.0 - lon * 4.0 - equationOfTime(millis)
        return SunTimes(
            sunrise = mod(noonUTC - h * 4.0 + tzOffsetHours * 60.0, 1440.0),
            sunset = mod(noonUTC + h * 4.0 + tzOffsetHours * 60.0, 1440.0),
            dayLength = h * 8.0
        )
    }

    // ---------------- PRAYER ----------------

    data class PrayerTimes(
        val fajr: Double, val sunrise: Double, val dhuhr: Double,
        val asr: Double, val maghrib: Double, val isha: Double
    ) {
        fun asArray() = listOf(
            "Subuh" to fajr, "Terbit" to sunrise, "Dzuhur" to dhuhr,
            "Ashar" to asr, "Maghrib" to maghrib, "Isya" to isha
        )
    }

    /**
     * Metode Kemenag: Subuh 20°, Isya 18°, Ashar Syafi'i, ihtiyat ±2 menit.
     * @param millis instan pada tanggal (UTC-safe)
     */
    fun prayerTimes(millis: Long, lat: Double, lon: Double, tzOffsetHours: Int): PrayerTimes {
        val decl = solarDeclination(millis)
        val transit = mod(720.0 - lon * 4.0 - equationOfTime(millis) + tzOffsetHours * 60.0, 1440.0)
        val dhuhr = mod(transit + 2.0, 1440.0)

        val h0 = hourAngleDeg(-0.833, lat, decl)
        val sunrise: Double
        val maghrib: Double
        if (h0 == null) {
            sunrise = mod(transit - 360.0, 1440.0)
            maghrib = mod(transit + 360.0, 1440.0)
        } else {
            sunrise = mod(transit - h0 * 4.0 + 2.0, 1440.0)
            maghrib = mod(transit + h0 * 4.0 + 2.0, 1440.0)
        }

        val hf = hourAngleDeg(-20.0, lat, decl)
        val fajr = if (hf == null) mod(sunrise - 75.0, 1440.0) else mod(transit - hf * 4.0 - 2.0, 1440.0)
        val hi = hourAngleDeg(-18.0, lat, decl)
        val isha = if (hi == null) mod(maghrib + 90.0, 1440.0) else mod(transit + hi * 4.0 + 2.0, 1440.0)

        val altAsr = atan(1.0 / (1.0 + tan(abs(lat - decl) * RAD))) * DEG
        val ha = hourAngleDeg(altAsr, lat, decl)
        val asr = if (ha == null) mod(transit + 360.0, 1440.0) else mod(transit + ha * 4.0, 1440.0)

        return PrayerTimes(fajr, sunrise, dhuhr, asr, maghrib, isha)
    }

    /** Zona legal dari nama provinsi (mirror Zones.PROV_ZONE). */
    fun zoneOffsetForProvince(prov: String?): Int = when (prov) {
        "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi",
        "Sumatera Selatan", "Kepulauan Bangka Belitung", "Bengkulu", "Lampung",
        "Banten", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta",
        "Jawa Timur", "Kalimantan Barat" -> 7
        "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Tengah",
        "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara",
        "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan",
        "Sulawesi Tenggara" -> 8
        else -> {
            val p = prov ?: ""
            if (p.startsWith("Papua") || p == "Maluku" || p == "Maluku Utara") 9
            else -1
        }
    }

    fun zoneOffsetForLon(lon: Double, lat: Double): Int = when {
        lon < 110.7 -> 7
        lon < 114.4 -> if (lat < -4.2) 7 else 8
        lon < 125.05 -> 8
        else -> 9
    }

    fun minutesToHM(mins: Double): String {
        val m = mod(mins, 1440.0).toInt()
        val hh = floor(m / 60.0).toInt()
        val mm = m % 60
        return "%02d:%02d".format(hh, mm)
    }

    /** Menit sekarang pada zona tertentu (menit sejak tengah malam lokal). */
    fun localMinutesNow(millis: Long, tzId: String): Double {
        val cal = Calendar.getInstance(TimeZone.getTimeZone(tzId))
        cal.timeInMillis = millis
        return cal.get(Calendar.HOUR_OF_DAY) * 60.0 + cal.get(Calendar.MINUTE) + cal.get(Calendar.SECOND) / 60.0
    }
}
