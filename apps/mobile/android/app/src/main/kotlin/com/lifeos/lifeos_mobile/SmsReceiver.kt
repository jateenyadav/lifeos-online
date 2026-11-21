package com.lifeos.lifeos_mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import org.json.JSONObject

/**
 * Receives incoming SMS. Only bank-like messages that look like completed
 * money movements (or card bills) are queued; OTP, promo and personal SMS are
 * dropped here and never stored. Works while LifeOS is in the background, but
 * not after a "Force stop" until the app is opened again.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = try { Telephony.Sms.Intents.getMessagesFromIntent(intent) } catch (_: Exception) { null } ?: return
        val bySender = LinkedHashMap<String, StringBuilder>()
        for (m in messages) {
            if (m == null) continue
            val sender = m.displayOriginatingAddress ?: m.originatingAddress ?: continue
            bySender.getOrPut(sender) { StringBuilder() }.append(m.displayMessageBody ?: m.messageBody ?: "")
        }
        // Received time, like the inbox "date" column, so re-imports give the same key.
        val now = System.currentTimeMillis()
        for ((sender, body) in bySender) handle(context, sender, body.toString(), now)
    }

    companion object {
        private const val TAG = "LifeOSCapture"

        /** Returns true when queued. Logs only the decision, never the text. */
        fun handle(context: Context, sender: String, body: String, timestamp: Long): Boolean {
            val settings = try { NotificationStore.snapshot(context) } catch (_: Exception) { return false }
            if (!settings.optBoolean("smsEnabled") || settings.optString("userId").isBlank()) return false
            if (!QuickParser.shouldQueueSms(sender, body)) {
                Log.i(TAG, "sms from ${if (QuickParser.isPersonalSender(sender)) "a person" else "a business"}: dropped")
                return false
            }
            return try {
                CaptureQueue.append(context, CaptureQueue.smsEvent(sender, body, timestamp))
                NotificationStore.markCaptured(context)
                Log.i(TAG, "sms from a business: queued")
                QuickParser.parse(body, sender)?.let { quick ->
                    PaymentReviewBanner.show(context, settings.optString("userId"), JSONObject()
                        .put("amountMinor", quick.amountPaise)
                        .put("title", quick.merchant ?: quick.bank ?: if (quick.isDebit) "Payment" else "Money received"))
                }
                true
            } catch (_: Exception) {
                context.getSharedPreferences("notification_tracking_health", Context.MODE_PRIVATE).edit()
                    .putBoolean("captureError", true).apply()
                false
            }
        }
    }
}
