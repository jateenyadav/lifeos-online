package com.lifeos.lifeos_mobile

import android.Manifest
import android.app.Notification
import android.content.ComponentName
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.util.concurrent.Executors

/** Payment-app notifications go into the same encrypted queue as SMS. */
class SpendingNotificationListener : NotificationListenerService() {
    private val executor = Executors.newSingleThreadExecutor()
    private val recent = LinkedHashMap<String, Long>()

    override fun onListenerConnected() {
        try { NotificationStore.change(this) { it.put("connected", true) } } catch (_: Exception) { }
    }

    override fun onListenerDisconnected() {
        try {
            NotificationStore.change(this) { it.put("connected", false) }
            requestRebind(ComponentName(this, SpendingNotificationListener::class.java))
        } catch (_: Exception) { }
    }

    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (notification.packageName == packageName || notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        executor.execute {
            try {
                val state = NotificationStore.snapshot(this)
                val displayedTime = notification.notification.`when`
                if (!NotificationCapturePolicy.accepts(state.optBoolean("enabled"), state.optLong("since"), notification.postTime, displayedTime)) return@execute
                if (state.optString("userId").isBlank() || !NotificationAccess.granted(this)) return@execute
                val extras = notification.notification.extras
                val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
                val body = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.takeIf { it.isNotBlank() }
                    ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.lastOrNull()?.toString()?.takeIf { it.isNotBlank() }
                    ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
                val combined = "$title\n$body"
                val smsPermission = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED && state.optBoolean("smsEnabled")
                val pkg = notification.packageName
                val decision = CapturePolicy.decide(pkg, packageName, combined, smsPermission)
                if (decision == null) return@execute
                val at = displayedTime.takeIf { it > 0 } ?: notification.postTime
                // Notification updates re-post the same content: skip repeats for 10 minutes.
                val key = "$pkg|${combined.hashCode()}"
                synchronized(recent) {
                    val now = System.currentTimeMillis()
                    recent.entries.removeAll { now - it.value > 600_000 }
                    if (recent.containsKey(key)) return@execute
                    recent[key] = now
                }
                if (decision == "sms") {
                    CaptureQueue.append(this, CaptureQueue.smsEvent(title, body, at))
                } else {
                    CaptureQueue.append(this, CaptureQueue.notificationEvent(pkg, title, body, at))
                }
                NotificationStore.markCaptured(this)
                Log.i("LifeOSCapture", "notification from $pkg: queued")
                QuickParser.parse(combined)?.let { quick ->
                    PaymentReviewBanner.show(this, state.optString("userId"), JSONObject()
                        .put("amountMinor", quick.amountPaise)
                        .put("title", quick.merchant ?: if (quick.isDebit) "Payment" else "Money received"))
                }
            } catch (_: Exception) {
                getSharedPreferences("notification_tracking_health", MODE_PRIVATE).edit().putBoolean("captureError", true).apply()
            }
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
