package com.lpvontop.localtime

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews

/**
 * WidgetAlarmReceiver — dipanggil alarm menit-an; render ulang semua widget.
 */
class WidgetAlarmReceiver : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: android.content.Intent) {
        super.onReceive(context, intent)
        if (intent.action == WidgetUpdater.ACTION_TICK) {
            WidgetUpdater.renderAll(context)
        }
    }
}

/**
 * BootReceiver — pasang ulang alarm setelah perangkat menyala.
 */
class BootReceiver : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: android.content.Intent) {
        super.onReceive(context, intent)
        if (intent.action == android.content.Intent.ACTION_BOOT_COMPLETED) {
            WidgetUpdater.scheduleMinuteTick(context)
            WidgetUpdater.renderAll(context)
        }
    }
}

/**
 * TimeWidgetProvider — Widget 1: jam legal (TextClock, selalu tepat) +
 * waktu matahari sejati + EoT (dihitung Kotlin tiap menit).
 */
class TimeWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
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
            val tzId = if (off == 8) "Asia/Makassar" else if (off == 9) "Asia/Jayapura" else "Asia/Jakarta"
            val label = if (off == 8) "WITA" else if (off == 9) "WIT" else "WIB"

            val now = System.currentTimeMillis()
            val tst = AstroCalc.trueSolarTimeMinutes(now, lon)
            val eot = AstroCalc.equationOfTime(now)
            val solarStr = AstroCalc.minutesToHM(tst)
            val eotStr = (if (eot >= 0) "+" else "") + String.format("%.1f", eot)

            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_time)
                rv.setTextViewText(R.id.wtLoc, name)
                rv.setTextViewText(R.id.wtSolar, "☀ $solarStr  (EoT $eotStr)")
                rv.setTextViewText(R.id.wtDate, "waktu matahari sejati · $label")
                // TextClock: set zona waktu via setTimeZone (method setter String)
                rv.setString(R.id.wtClock, "setTimeZone", tzId)
                mgr.updateAppWidget(id, rv)
            }
        }
    }
}

/**
 * PrayerWidgetProvider — Widget 2: jadwal sholat hari ini (Kemenag).
 */
class PrayerWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
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
            val now = System.currentTimeMillis()
            val t = AstroCalc.prayerTimes(now, lat, lon, off)
            val minsNow = AstroCalc.localMinutesNow(now,
                if (off == 8) "Asia/Makassar" else if (off == 9) "Asia/Jayapura" else "Asia/Jakarta")

            // sholat berikutnya (abaikan Terbit sebagai "sholat")
            var nextName = "Subuh"; var nextMin = t.fajr
            val list = t.asArray().filter { it.first != "Terbit" }
            for ((nm, mn) in list) {
                if (mn > minsNow) { nextName = nm; nextMin = mn; break }
            }
            val diff = if (nextMin <= minsNow) 1440 - minsNow + t.fajr else nextMin - minsNow
            val nextStr = String.format("%d jam %d mnt", diff.toInt() / 60, (diff % 60).toInt())

            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_prayer)
                rv.setTextViewText(R.id.wpLoc, name)
                rv.setTextViewText(R.id.wpNextName, "Berikutnya: $nextName")
                rv.setTextViewText(R.id.wpNextTime, "${AstroCalc.minutesToHM(nextMin)} · $nextStr lagi")
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
 * MiniWidgetProvider — Widget 3: mini 2×1, jam legal + matahari.
 */
class MiniWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        render(context, mgr, ids)
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
            val tzId = if (off == 8) "Asia/Makassar" else if (off == 9) "Asia/Jayapura" else "Asia/Jakarta"
            val label = if (off == 8) "WITA" else if (off == 9) "WIT" else "WIB"
            val solarStr = AstroCalc.minutesToHM(AstroCalc.trueSolarTimeMinutes(System.currentTimeMillis(), lon))

            for (id in ids) {
                val rv = RemoteViews(context.packageName, R.layout.widget_mini)
                rv.setString(R.id.wmClock, "setTimeZone", tzId)
                rv.setTextViewText(R.id.wmZone, label)
                rv.setTextViewText(R.id.wmSolar, "☀ $solarStr")
                mgr.updateAppWidget(id, rv)
            }
        }
    }
}
