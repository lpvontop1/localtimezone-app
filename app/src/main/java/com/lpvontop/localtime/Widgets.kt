package com.lpvontop.localtime

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews

/**
 * WidgetAlarmReceiver — dipanggil alarm terjadwal; render ulang semua widget
 * lalu pasang alarm berikutnya (rantai).
 */
class WidgetAlarmReceiver : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: android.content.Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetUpdater.ACTION_TICK) {
            WidgetUpdater.renderAll(context)
            WidgetUpdater.armNextTick(context)
        }
    }
}

/**
 * BootReceiver — pasang ulang alarm setelah perangkat menyala
 * atau aplikasi diperbarui (MY_PACKAGE_REPLACED).
 */
class BootReceiver : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: android.content.Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            android.content.Intent.ACTION_BOOT_COMPLETED,
            android.content.Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                WidgetUpdater.armNextTick(context, 8_000L)
                WidgetUpdater.renderAll(context)
            }
        }
    }
}

/**
 * TimeWidgetProvider — Widget "Jam Zona":
 *  • Jam legal: TextClock zona Asia/… (detak native launcher — TIDAK beku).
 *  • Jam matahari: TextClock dengan zona GMT custom (bujur×4 mnt + EoT)
 *    sehingga ikut berdetak native tanpa alarm.
 *  • Busur matahari digambar runtime (WidgetArt).
 */
class TimeWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
        WidgetUpdater.armNextTick(context)
    }

    companion object {
        fun render(context: Context, mgr: AppWidgetManager, ids: IntArray) {
            if (ids.isEmpty()) return
            val prefs = context.getSharedPreferences("lta_widget", Context.MODE_PRIVATE)
            val name = prefs.getString("name", "Jakarta") ?: "Jakarta"
            val prov = prefs.getString("prov", "") ?: ""
            val lat = prefs.getString("lat", "-6.2")?.toDoubleOrNull() ?: -6.2
            val lon = prefs.getString("lon", "106.8")?.toDoubleOrNull() ?: 106.8

            val off = AstroCalc.zoneOffsetForProvince(prov).let {
                if (it < 0) AstroCalc.zoneOffsetForLon(lon, lat) else it
            }
            val tzId = AstroCalc.zoneTzId(off)
            val label = AstroCalc.zoneLabel(off)

            val now = System.currentTimeMillis()
            val solarId = AstroCalc.solarGmtId(now, lon)
            val eot = AstroCalc.equationOfTime(now)
            val eotStr = (if (eot >= 0) "+" else "−") + String.format("%.1f", kotlin.math.abs(eot))
            val dateStr = AstroCalc.dateString(now, tzId)
            val phase = AstroCalc.sunPhase(now, lat, lon, off)
            val arc = WidgetArt.sunArc(104, 52, phase)

            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_time)
                rv.setTextViewText(R.id.wtLoc, "KEC. " + name.uppercase())
                rv.setString(R.id.wtClock, "setTimeZone", tzId)
                rv.setString(R.id.wtSolarClock, "setTimeZone", solarId)
                rv.setTextViewText(R.id.wtDate, dateStr)
                rv.setTextViewText(R.id.wtEot, "EoT " + eotStr)
                rv.setTextViewText(R.id.wtZone, "WAKTU MATAHARI · $label")
                rv.setImageViewBitmap(R.id.wtArc, arc)
                mgr.updateAppWidget(id, rv)
            }
        }
    }
}

/**
 * PrayerWidgetProvider — Widget "Jadwal Sholat":
 * waktu berikutnya + bar progres, grid 2×3, tanpa emoji.
 */
class PrayerWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
        WidgetUpdater.armNextTick(context)
    }

    companion object {
        fun render(context: Context, mgr: AppWidgetManager, ids: IntArray) {
            if (ids.isEmpty()) return
            val prefs = context.getSharedPreferences("lta_widget", Context.MODE_PRIVATE)
            val name = prefs.getString("name", "Jakarta") ?: "Jakarta"
            val prov = prefs.getString("prov", "") ?: ""
            val lat = prefs.getString("lat", "-6.2")?.toDoubleOrNull() ?: -6.2
            val lon = prefs.getString("lon", "106.8")?.toDoubleOrNull() ?: 106.8

            val off = AstroCalc.zoneOffsetForProvince(prov).let {
                if (it < 0) AstroCalc.zoneOffsetForLon(lon, lat) else it
            }
            val tzId = AstroCalc.zoneTzId(off)
            val now = System.currentTimeMillis()
            val t = AstroCalc.prayerTimes(now, lat, lon, off)
            val minsNow = AstroCalc.localMinutesNow(now, tzId)

            // waktu berikutnya (abaikan Terbit) & sebelumnya (untuk progres)
            val list = t.asArray().filter { it.first != "Terbit" }
            var nextName = "Subuh"; var nextMin = t.fajr; var prevMin = t.isha
            for ((nm, mn) in list) {
                if (mn > minsNow) { nextName = nm; nextMin = mn; break }
                prevMin = mn
            }
            val diff = if (nextMin <= minsNow) 1440 - minsNow + t.fajr else nextMin - minsNow
            val nextStr = String.format("%d jam %02d mnt", diff.toInt() / 60, (diff % 60).toInt())

            // progres antar waktu (aturan "sebelumnya → berikutnya", melewati tengah malam)
            val span = if (nextMin > prevMin) nextMin - prevMin else 1440 - prevMin + nextMin
            val gone = if (minsNow >= prevMin) minsNow - prevMin else 1440 - prevMin + minsNow
            val progress = if (span > 0) ((gone / span) * 1000).toInt().coerceIn(0, 1000) else 0

            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_prayer)
                rv.setTextViewText(R.id.wpLoc, name)
                rv.setString(R.id.wpClock, "setTimeZone", tzId)
                rv.setTextViewText(R.id.wpNextName, nextName)
                rv.setTextViewText(R.id.wpNextCount, "$nextStr lagi")
                rv.setProgressBar(R.id.wpBar, 1000, progress, false)
                rv.setTextViewText(R.id.wpFajr, AstroCalc.minutesToHM(t.fajr))
                rv.setTextViewText(R.id.wpSunrise, AstroCalc.minutesToHM(t.sunrise))
                rv.setTextViewText(R.id.wpDhuhr, AstroCalc.minutesToHM(t.dhuhr))
                rv.setTextViewText(R.id.wpAsr, AstroCalc.minutesToHM(t.asr))
                rv.setTextViewText(R.id.wpMaghrib, AstroCalc.minutesToHM(t.maghrib))
                rv.setTextViewText(R.id.wpIsha, AstroCalc.minutesToHM(t.isha))
                mgr.updateAppWidget(id, rv)
            }
        }
    }
}

/**
 * MiniWidgetProvider — Widget "Mini Solar": jam legal + chip zona +
 * jam matahari (detak native) + cincin progres hari.
 */
class MiniWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
        WidgetUpdater.armNextTick(context)
    }

    companion object {
        fun render(context: Context, mgr: AppWidgetManager, ids: IntArray) {
            if (ids.isEmpty()) return
            val prefs = context.getSharedPreferences("lta_widget", Context.MODE_PRIVATE)
            val prov = prefs.getString("prov", "") ?: ""
            val lat = prefs.getString("lat", "-6.2")?.toDoubleOrNull() ?: -6.2
            val lon = prefs.getString("lon", "106.8")?.toDoubleOrNull() ?: 106.8
            val off = AstroCalc.zoneOffsetForProvince(prov).let {
                if (it < 0) AstroCalc.zoneOffsetForLon(lon, lat) else it
            }
            val tzId = AstroCalc.zoneTzId(off)
            val label = AstroCalc.zoneLabel(off)
            val now = System.currentTimeMillis()
            val solarId = AstroCalc.solarGmtId(now, lon)
            val phase = AstroCalc.sunPhase(now, lat, lon, off)
            val ring = WidgetArt.solarRing(30, phase.dayFrac.toFloat())
            val eot = AstroCalc.equationOfTime(now)
            val eotStr = (if (eot >= 0) "+" else "−") +
                String.format("%.1f", kotlin.math.abs(eot))

            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_mini)
                rv.setString(R.id.wmClock, "setTimeZone", tzId)
                rv.setString(R.id.wmSolarClock, "setTimeZone", solarId)
                rv.setTextViewText(R.id.wmZone, label)
                rv.setTextViewText(R.id.wmSolarEot, "EoT $eotStr")
                rv.setImageViewBitmap(R.id.wmRing, ring)
                mgr.updateAppWidget(id, rv)
            }
        }
    }
}
