package com.lpvontop.localtime

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * WidgetUpdater v1.1 — strategi anti-beku:
 *
 * 1. Jam legal & jam matahari memakai TextClock → berdetak oleh LAUNCHER
 *    sendiri (TIME_TICK), kebal Doze maupun optimasi baterai Samsung.
 * 2. Teks turunan (tanggal, EoT, countdown, busur) disegarkan oleh RANTAI
 *    alarm one-shot setAndAllowWhileIdle tiap 15 menit — ramah baterai,
 *    tetap jalan saat idle, dipasang ulang tiap: widget ditambah, aplikasi
 *    dibuka, boot, dan MY_PACKAGE_REPLACED.
 */
object WidgetUpdater {

    const val ACTION_TICK = "com.lpvontop.localtime.ACTION_TICK"
    const val TICK_MS = 15 * 60_000L
    private const val REQ_TICK = 1001

    fun tickPendingIntent(context: Context): PendingIntent {
        val i = Intent(context, WidgetAlarmReceiver::class.java).setAction(ACTION_TICK)
        return PendingIntent.getBroadcast(
            context, REQ_TICK, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** Pasang satu alarm berikutnya (rantai); aman doze & Android 12+. */
    fun armNextTick(context: Context, delayMs: Long = TICK_MS) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val at = ((System.currentTimeMillis() + delayMs) / 60_000L + 1) * 60_000L // ratakan ke menit
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, tickPendingIntent(context))
    }

    /** Kompatibilitas pemanggil lama. */
    fun scheduleMinuteTick(context: Context) = armNextTick(context, 8_000L)

    fun cancelTick(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(tickPendingIntent(context))
    }

    /** Render ketiga jenis widget. */
    fun renderAll(context: Context) {
        val mgr = android.appwidget.AppWidgetManager.getInstance(context)
        TimeWidgetProvider.render(context, mgr, mgr.getAppWidgetIds(
            ComponentName(context, TimeWidgetProvider::class.java)))
        PrayerWidgetProvider.render(context, mgr, mgr.getAppWidgetIds(
            ComponentName(context, PrayerWidgetProvider::class.java)))
        MiniWidgetProvider.render(context, mgr, mgr.getAppWidgetIds(
            ComponentName(context, MiniWidgetProvider::class.java)))
    }
}
