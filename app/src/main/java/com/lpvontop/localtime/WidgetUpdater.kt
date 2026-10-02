package com.lpvontop.localtime

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * WidgetUpdater — menyiapkan alarm menit-per-menit & merender semua widget.
 * Alarm pakai setAndAllowWhileIdle (tanpa izin khusus); TextClock di widget
 * tetap berdetak tepat secara native walau alarm tertunda (doze).
 */
object WidgetUpdater {

    const val ACTION_TICK = "com.lpvontop.localtime.ACTION_TICK"
    private const val REQ_TICK = 1001

    fun tickPendingIntent(context: Context): PendingIntent {
        val i = Intent(context, WidgetAlarmReceiver::class.java).setAction(ACTION_TICK)
        return PendingIntent.getBroadcast(
            context, REQ_TICK, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** Jadwalkan tick berulang tiap 60 detik. */
    fun scheduleMinuteTick(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setRepeating(
            AlarmManager.RTC,
            System.currentTimeMillis() + 5000,
            60_000L,
            tickPendingIntent(context)
        )
    }

    fun cancelMinuteTick(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(tickPendingIntent(context))
    }

    /** Render ketiga jenis widget. */
    fun renderAll(context: Context) {
        val mgr = android.appwidget.AppWidgetManager.getInstance(context)
        TimeWidgetProvider.render(context, mgr, mgr.getAppWidgetIds(
            android.content.ComponentName(context, TimeWidgetProvider::class.java)))
        PrayerWidgetProvider.render(context, mgr, mgr.getAppWidgetIds(
            android.content.ComponentName(context, PrayerWidgetProvider::class.java)))
        MiniWidgetProvider.render(context, mgr, mgr.getAppWidgetIds(
            android.content.ComponentName(context, MiniWidgetProvider::class.java)))
    }
}
