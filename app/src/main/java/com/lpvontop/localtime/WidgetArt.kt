package com.lpvontop.localtime

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.sin

/**
 * WidgetArt — pelukis bitmap untuk seni widget (RemoteViews tak mendukung
 * View kustom, jadi indikator matahari digambar ke Bitmap lalu dipasang
 * via setImageViewBitmap).
 *
 * Bahasa desain "almanak": garis tipis, warna tinta hangat, tanpa emoji.
 */
object WidgetArt {

    // Palet
    private const val INK_0 = 0xFF0E1219.toInt()   // latar tergelap
    private const val INK_1 = 0xFF171E2E.toInt()
    private const val LINE = 0x22FFFFFF            // hairline
    private const val TXT_DIM = 0xFF97A2BC.toInt()
    private const val AMBER = 0xFFFFC46B.toInt()
    private const val AMBER_DIM = 0x66FFC46B
    private const val MOON = 0xFFD7DEEF.toInt()

    /**
     * Busur matahari: sumbu horizon, busur terbit→terbenam, titik matahari
     * pada posisi hari ini (atau bulan + bintang saat malam).
     * Ukuran logis dpx × hdp; bitmap di-render 2× agar tajam.
     */
    fun sunArc(wDp: Int, hDp: Int, phase: AstroCalc.SunPhase, scale: Float = 2f): Bitmap {
        val w = (wDp * scale).toInt()
        val h = (hDp * scale).toInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val pad = 2f * scale
        val horizon = h - 10f * scale
        val arcTop = 4f * scale
        val left = 6f * scale
        val right = w - 6f * scale

        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            strokeWidth = 1.2f * scale; color = LINE; style = Paint.Style.STROKE
        }

        // gradient langit tipis di atas horizon (siang: hangat, malam: tinta)
        val skyTop = if (phase.isNight) 0x141C2A3F.toInt() else 0x18FFC46B.toInt()
        val sky = Paint().apply {
            shader = LinearGradient(0f, arcTop, 0f, horizon, skyTop, 0x00000000, Shader.TileMode.CLAMP)
        }
        c.drawRect(left, arcTop, right, horizon, sky)

        // garis horizon + tick
        c.drawLine(left, horizon, right, horizon, line)
        val tick = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            strokeWidth = 1.2f * scale; color = 0x33FFFFFF; style = Paint.Style.STROKE
        }
        c.drawLine(left, horizon + 3f * scale, left, horizon - 3f * scale, tick)
        c.drawLine(right, horizon + 3f * scale, right, horizon - 3f * scale, tick)
        c.drawLine(w / 2f, horizon + 3.4f * scale, w / 2f, horizon - 1.5f * scale, tick)

        // busur (semi-elips) terbit → terbenam
        val arcRect = RectF(left, arcTop + 8f * scale, right, horizon + 26f * scale)
        val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            strokeWidth = 1.4f * scale; color = AMBER_DIM; style = Paint.Style.STROKE
        }
        c.drawArc(arcRect, 180f, 180f, false, arc)

        if (!phase.isNight && !phase.dayFrac.isNaN()) {
            // posisi matahari pada busur (parametrik elips dari kiri ke kanan)
            val t = phase.dayFrac.coerceIn(0.0, 1.0).toFloat()
            val cx = arcRect.centerX()
            val a = arcRect.width() / 2f
            val b = arcRect.height() / 2f
            val ang = Math.PI * (1.0 - t) // π = kiri, 0 = kanan
            val x = cx + (a * cos(ang)).toFloat()
            val y = arcRect.centerY() - (b * sin(ang)).toFloat()
            // halo
            val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = RadialGradient(x, y, 11f * scale,
                    0x55FFC46B, 0x00FFC46B, Shader.TileMode.CLAMP)
            }
            c.drawCircle(x, y, 11f * scale, halo)
            // disk matahari
            val sun = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = AMBER }
            c.drawCircle(x, y, 4.2f * scale, sun)
            val sunCore = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFE9BF.toInt() }
            c.drawCircle(x, y, 2.1f * scale, sunCore)
        } else {
            // malam: bulan sabit + bintang kecil
            val mx = w * 0.30f
            val my = arcTop + 12f * scale
            val moon = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = MOON }
            c.drawCircle(mx, my, 5.0f * scale, moon)
            val cut = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = INK_1; setShadowLayer(0f, 0f, 0f, 0)
            }
            c.drawCircle(mx + 3.1f * scale, my - 2.1f * scale, 4.4f * scale, cut)
            val star = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x88FFFFFF.toInt() }
            listOf(0.14f to 0.38f, 0.62f to 0.22f, 0.80f to 0.46f, 0.47f to 0.16f).forEach { (fx, fy) ->
                c.drawCircle(w * fx, arcTop + h * fy, 1.1f * scale, star)
            }
        }
        return bmp
    }

    /** Latar kartu vertikal yang halus (dipakai bila ingin latar dinamis). */
    fun skyCard(wDp: Int, hDp: Int, phase: AstroCalc.SunPhase, scale: Float = 2f): Bitmap {
        val w = (wDp * scale).toInt()
        val h = (hDp * scale).toInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val (top, bot) = when {
            phase.isNight -> INK_0 to INK_1
            phase.altitudeDeg > 25.0 -> 0xFF12203A.toInt() to 0xFF0E1219.toInt()
            else -> 0xFF1A1E30.toInt() to 0xFF0E1219.toInt()
        }
        val p = Paint().apply {
            shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(), top, bot, Shader.TileMode.CLAMP)
        }
        c.drawPaint(p)
        return bmp
    }

    /** Ring donat kecil untuk widget mini: progress hari matahari. */
    fun solarRing(sizeDp: Int, frac: Float, scale: Float = 2f): Bitmap {
        val s = (sizeDp * scale).toInt()
        val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val rect = RectF(2f * scale, 2f * scale, s - 2f * scale, s - 2f * scale)
        val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = 2f * scale; color = LINE
        }
        c.drawArc(rect, 0f, 360f, false, track)
        val prog = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = 2f * scale
            color = AMBER; strokeCap = Paint.Cap.ROUND
        }
        val f = if (frac.isNaN()) 0f else frac.coerceIn(0f, 1f)
        c.drawArc(rect, -90f, 360f * f, false, prog)
        return bmp
    }
}
