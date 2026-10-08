package com.lifeos.lifeos_mobile

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.util.Locale

object PaymentReviewBanner {
    private val handler = Handler(Looper.getMainLooper())
    private var view: View? = null
    private var windowManager: WindowManager? = null
    private var timeout: Runnable? = null
    @Volatile var appVisible = false

    fun dismiss() {
        handler.post {
            timeout?.let { handler.removeCallbacks(it) }
            try { view?.let { windowManager?.removeView(it) } } catch (_: Exception) { }
            view = null
            timeout = null
        }
    }

    fun show(context: Context, userId: String, payment: JSONObject) {
        val application = context.applicationContext
        handler.post {
            try {
                val state = NotificationStore.snapshot(application)
                if (appVisible || state.optString("userId") != userId || !state.optBoolean("enabled") || !state.optBoolean("bannerEnabled") || !Settings.canDrawOverlays(application)) return@post
                if (application.getSystemService(KeyguardManager::class.java).isDeviceLocked) return@post
                timeout?.let { handler.removeCallbacks(it) }
                view?.let { windowManager?.removeView(it) }
                val density = application.resources.displayMetrics.density
                val padding = (16 * density).toInt()
                val card = LinearLayout(application).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(padding, padding, padding, padding)
                    background = GradientDrawable().apply { setColor(Color.rgb(255, 254, 250)); cornerRadius = 14 * density }
                }
                val amount = String.format(Locale.US, "₹%.2f", payment.getLong("amountMinor") / 100.0)
                card.addView(TextView(application).apply { text = application.getString(R.string.payment_review_title, amount, payment.optString("title")); textSize = 17f; setTextColor(Color.rgb(38, 62, 52)) })
                card.addView(TextView(application).apply { setText(R.string.payment_review_question); setTextColor(Color.rgb(60, 80, 65)) })
                val buttons = LinearLayout(application)
                buttons.addView(Button(application).apply {
                    setText(R.string.payment_review_open)
                    setOnClickListener {
                        dismiss()
                        application.startActivity(Intent(application, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("open_spending", true))
                    }
                })
                buttons.addView(Button(application).apply { setText(R.string.payment_review_later); setOnClickListener { dismiss() } })
                card.addView(buttons)
                val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
                val parameters = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.BOTTOM; y = (40 * density).toInt() }
                windowManager = application.getSystemService(WindowManager::class.java)
                windowManager!!.addView(card, parameters)
                view = card
                timeout = Runnable { dismiss() }.also { handler.postDelayed(it, 20000) }
            } catch (_: Exception) {
                try { NotificationStore.change(application) { it.put("error", "The floating banner could not open. Review payments inside LifeOS.") } } catch (_: Exception) { }
            }
        }
    }
}
