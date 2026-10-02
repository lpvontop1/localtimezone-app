package com.lpvontop.localtime

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * NativeBridge — jembatan JavaScript (WebView) → Kotlin.
 * Dipanggil dari JS sebagai window.AndroidBridge.<metode>()
 */
class NativeBridge(private val context: Context) {

    companion object {
        @JvmStatic var mainActivity: Activity? = null
    }

    private val prefs: android.content.SharedPreferences
        get() = context.getSharedPreferences("lta_widget", Context.MODE_PRIVATE)

    /** JS menyimpan status lokasi; widget Android akan membaca ini. */
    @JavascriptInterface
    fun saveState(json: String) {
        try {
            val o = JSONObject(json)
            prefs.edit()
                .putString("name", o.optString("name", ""))
                .putString("kab", o.optString("kab", ""))
                .putString("prov", o.optString("prov", ""))
                .putString("lat", o.optString("lat", "0"))
                .putString("lon", o.optString("lon", "0"))
                .apply()
            WidgetUpdater.renderAll(context)
        } catch (_: Exception) { }
    }

    /** JS membaca status tersimpan (JSON). */
    @JavascriptInterface
    fun loadState(): String {
        return try {
            val o = JSONObject()
            o.put("name", prefs.getString("name", ""))
            o.put("kab", prefs.getString("kab", ""))
            o.put("prov", prefs.getString("prov", ""))
            o.put("lat", prefs.getString("lat", ""))
            o.put("lon", prefs.getString("lon", ""))
            o.toString()
        } catch (_: Exception) { "{}" }
    }

    @JavascriptInterface
    fun updateWidgets() {
        WidgetUpdater.renderAll(context)
    }

    /** JS meminta keluar aplikasi (dipanggil dari window.onNativeBack). */
    @JavascriptInterface
    fun exitApp() {
        val act = mainActivity
        act?.runOnUiThread { act.finishAffinity() }
    }

    @JavascriptInterface
    fun vibrate(ms: Int) {
        try {
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= 26) {
                v?.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") v?.vibrate(ms.toLong())
            }
        } catch (_: Exception) { }
    }

    @JavascriptInterface
    fun shareText(text: String) {
        val i = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(i, "Bagikan").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    @JavascriptInterface
    fun appInfo(): String {
        val o = JSONObject()
        try {
            o.put("model", Build.MODEL)
            o.put("brand", Build.BRAND)
            o.put("android", Build.VERSION.RELEASE)
            o.put("sdk", Build.VERSION.SDK_INT)
        } catch (_: Exception) { }
        return o.toString()
    }
}
