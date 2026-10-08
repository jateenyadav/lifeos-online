package com.lifeos.lifeos_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import java.net.URI
import android.net.Uri
import android.os.Handler
import android.os.Looper

class MainActivity : FlutterActivity() {
    companion object {
        private var notificationChannel: MethodChannel? = null
        fun notifyPaymentsChanged() { Handler(Looper.getMainLooper()).post { notificationChannel?.invokeMethod("paymentsChanged", null) } }
    }
    override fun onResume() { super.onResume(); PaymentReviewBanner.appVisible = true; PaymentReviewBanner.dismiss() }
    override fun onPause() { PaymentReviewBanner.appVisible = false; super.onPause() }
    override fun onDestroy() { notificationChannel = null; super.onDestroy() }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("open_spending", false)) notificationChannel?.invokeMethod("reviewRequested", null)
    }
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        notificationChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "lifeos/notification_tracking")
        notificationChannel!!.setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "configure" -> {
                            val baseUrl = call.argument<String>("baseUrl") ?: ""
                            val uri = URI(baseUrl)
                            require(uri.host != null && (uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http")))
                            val userId = call.argument<String>("userId")
                            if (userId == null || NotificationStore.snapshot(this).optString("userId") != userId) {
                                PaymentReviewBanner.dismiss()
                                NotificationSyncJob.cancel(this)
                            }
                            NotificationStore.configure(this, userId, call.argument<String>("token"), baseUrl)
                            NotificationSyncJob.schedule(this)
                            result.success(null)
                        }
                        "status" -> {
                            val state = NotificationStore.snapshot(this)
                            val health = getSharedPreferences("notification_tracking_health", MODE_PRIVATE)
                            result.success(mapOf(
                                "supported" to NotificationAccess.supported(this),
                                "permission" to NotificationAccess.granted(this),
                                "enabled" to state.optBoolean("enabled"),
                                "connected" to state.optBoolean("connected"),
                                "pending" to (state.optJSONArray("pending")?.length() ?: 0),
                                "saved" to state.optInt("saved"),
                                "bannerEnabled" to state.optBoolean("bannerEnabled"),
                                "bannerPermission" to Settings.canDrawOverlays(this),
                                "error" to (if (health.getBoolean("captureError", false)) "Some notifications could not be saved on this phone. Check storage and restart the app." else state.optString("error").takeIf { it.isNotBlank() })
                            ))
                        }
                        "enable" -> {
                            require(NotificationAccess.supported(this)) { "Notification access is not supported on this phone." }
                            NotificationStore.change(this) {
                                check(it.optString("token").isNotBlank()) { "Please sign in again before enabling tracking." }
                                if (!it.optBoolean("enabled")) it.put("since", System.currentTimeMillis())
                                it.put("enabled", true).remove("error")
                            }
                            getSharedPreferences("notification_tracking_health", MODE_PRIVATE).edit().remove("captureError").apply()
                            if (!NotificationAccess.granted(this)) startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                            else NotificationListenerService.requestRebind(ComponentName(this, SpendingNotificationListener::class.java))
                            NotificationSyncJob.schedule(this)
                            result.success(null)
                        }
                        "disable" -> {
                            PaymentReviewBanner.dismiss()
                            NotificationStore.change(this) { it.put("enabled", false) }
                            NotificationSyncJob.cancel(this)
                            result.success(null)
                        }
                        "settings" -> {
                            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                            result.success(null)
                        }
                        "sync" -> {
                            NotificationSyncJob.schedule(this)
                            result.success(null)
                        }
                        "enableBanner" -> {
                            NotificationStore.change(this) { check(it.optString("token").isNotBlank()); it.put("bannerEnabled", true) }
                            if (!Settings.canDrawOverlays(this)) startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                            result.success(null)
                        }
                        "disableBanner" -> {
                            NotificationStore.change(this) { it.put("bannerEnabled", false) }
                            PaymentReviewBanner.dismiss()
                            result.success(null)
                        }
                        "takeReviewRequest" -> {
                            val requested = intent.getBooleanExtra("open_spending", false)
                            intent.removeExtra("open_spending")
                            result.success(requested)
                        }
                        else -> result.notImplemented()
                    }
                } catch (failure: Exception) {
                    result.error("notification_tracking", failure.message ?: "Could not access notification tracking.", null)
                }
            }
    }
}
