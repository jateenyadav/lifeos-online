package com.lifeos.lifeos_mobile

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class SpendingNotificationListener : NotificationListenerService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onListenerConnected() {
        try {
            NotificationStore.change(this) { it.put("connected", true) }
            NotificationSyncJob.schedule(this)
        } catch (_: Exception) {
            return
        }
    }

    override fun onListenerDisconnected() {
        try {
            NotificationStore.change(this) { it.put("connected", false) }
            requestRebind(ComponentName(this, SpendingNotificationListener::class.java))
        } catch (_: Exception) {
            return
        }
    }

    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (notification.packageName == packageName || notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        executor.execute {
            try {
                val state = NotificationStore.snapshot(this)
                val displayedTime = notification.notification.`when`
                if (!NotificationCapturePolicy.accepts(state.optBoolean("enabled"), state.optLong("since"), notification.postTime, displayedTime)) return@execute
                if (state.optString("token").isBlank() || !NotificationAccess.granted(this)) return@execute
                val extras = notification.notification.extras
                val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
                val body = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.takeIf { it.isNotBlank() }
                    ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.lastOrNull()?.toString()?.takeIf { it.isNotBlank() }
                    ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
                val text = "$title\n$body"
                val transaction = TransactionParser.parse(text, allowIncoming = true) ?: return@execute
                val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(notification.postTime))
                val key = TransactionParser.fingerprint(transaction, notification.packageName, notification.key, displayedTime.takeIf { it > 0 } ?: notification.postTime, date, text)
                NotificationStore.enqueue(this, JSONObject()
                    .put("notificationKey", key).put("sourceApp", notification.packageName)
                    .put("currency", "INR").put("amountMinor", transaction.amountMinor)
                    .put("recipientKey", transaction.recipientKey).put("direction", transaction.direction)
                    .put("title", transaction.title).put("date", date).put("category", "Other")
                    .put("payment", transaction.payment).put("note", "Detected from a new notification. Review before saving."), notification.postTime)
                NotificationSyncJob.schedule(this)
            } catch (_: Exception) {
                getSharedPreferences("notification_tracking_health", MODE_PRIVATE).edit()
                    .putBoolean("captureError", true).apply()
            }
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
