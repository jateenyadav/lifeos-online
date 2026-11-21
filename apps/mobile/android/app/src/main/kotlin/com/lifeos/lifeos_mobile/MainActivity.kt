package com.lifeos.lifeos_mobile

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.notification.NotificationListenerService
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

/**
 * One channel ("lifeos/capture") for phone capture: SMS + notification
 * settings, the encrypted queue, inbox import and shared screenshots.
 */
class MainActivity : FlutterActivity() {
    companion object {
        private const val REQ_SMS = 4201
        private var channel: MethodChannel? = null
        private val main = Handler(Looper.getMainLooper())
        fun signal(method: String) { main.post { channel?.invokeMethod(method, null) } }
    }

    private val io = Executors.newSingleThreadExecutor()
    private var pendingSms: MethodChannel.Result? = null
    private val sharedImages = ArrayList<String>()

    override fun onResume() { super.onResume(); PaymentReviewBanner.appVisible = true; PaymentReviewBanner.dismiss() }
    override fun onPause() { PaymentReviewBanner.appVisible = false; super.onPause() }
    override fun onDestroy() { channel = null; CaptureQueue.listener = null; super.onDestroy() }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("open_spending", false)) signal("reviewRequested")
        if (takeShare(intent)) signal("sharedImagesAvailable")
    }

    /** Copies shared images into app-private cache (OCR runs on the phone). */
    private fun takeShare(intent: Intent?): Boolean {
        if (intent == null) return false
        val uris = when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(
                if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
            )
            Intent.ACTION_SEND_MULTIPLE ->
                (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()
            else -> emptyList()
        }
        if (uris.isEmpty() || intent.type?.startsWith("image/") != true) return false
        val dir = File(cacheDir, "shared").apply { mkdirs() }
        var added = false
        for (uri in uris.take(10)) {
            try {
                val out = File(dir, "shot-${System.nanoTime()}.img")
                contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
                if (out.length() in 1..(25L * 1024 * 1024)) { synchronized(sharedImages) { sharedImages.add(out.absolutePath) }; added = true } else out.delete()
            } catch (_: Exception) { }
        }
        intent.action = null
        return added
    }

    private fun granted(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    private fun smsGranted() = granted(Manifest.permission.RECEIVE_SMS) && granted(Manifest.permission.READ_SMS)

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_SMS) {
            val ok = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (ok) NotificationStore.change(this) { it.put("smsEnabled", true) }
            pendingSms?.success(ok)
            pendingSms = null
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        takeShare(intent)
        CaptureQueue.listener = { channel?.invokeMethod("eventsAvailable", null) }
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "lifeos/capture")
        channel!!.setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "configure" -> {
                        val userId = call.argument<String>("userId")
                        if (NotificationStore.configure(this, userId)) {
                            PaymentReviewBanner.dismiss()
                            CaptureQueue.clear(this)
                        }
                        result.success(null)
                    }
                    "status" -> {
                        val state = NotificationStore.snapshot(this)
                        val health = getSharedPreferences("notification_tracking_health", MODE_PRIVATE)
                        result.success(mapOf(
                            "supported" to true,
                            "smsPermission" to smsGranted(),
                            "smsEnabled" to state.optBoolean("smsEnabled"),
                            "notificationSupported" to NotificationAccess.supported(this),
                            "notificationPermission" to NotificationAccess.granted(this),
                            "notificationEnabled" to state.optBoolean("enabled"),
                            "connected" to state.optBoolean("connected"),
                            "pending" to CaptureQueue.count(this),
                            "lastCapturedAt" to state.optLong("lastCapturedAt"),
                            "bannerEnabled" to state.optBoolean("bannerEnabled"),
                            "bannerPermission" to Settings.canDrawOverlays(this),
                            "error" to (if (health.getBoolean("captureError", false)) "Some messages could not be saved on this phone. Check storage and restart the app." else null),
                        ))
                    }
                    "enableSms" -> {
                        check(NotificationStore.snapshot(this).optString("userId").isNotBlank()) { "Please sign in again before turning on tracking." }
                        getSharedPreferences("notification_tracking_health", MODE_PRIVATE).edit().remove("captureError").apply()
                        if (smsGranted()) {
                            NotificationStore.change(this) { it.put("smsEnabled", true) }
                            result.success(true)
                        } else {
                            pendingSms?.success(false)
                            pendingSms = result
                            requestPermissions(arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS), REQ_SMS)
                        }
                    }
                    "disableSms" -> {
                        NotificationStore.change(this) { it.put("smsEnabled", false) }
                        result.success(null)
                    }
                    "enableNotifications" -> {
                        require(NotificationAccess.supported(this)) { "Notification access is not supported on this phone." }
                        NotificationStore.change(this) {
                            check(it.optString("userId").isNotBlank()) { "Please sign in again before turning on tracking." }
                            if (!it.optBoolean("enabled")) it.put("since", System.currentTimeMillis())
                            it.put("enabled", true)
                        }
                        if (!NotificationAccess.granted(this)) startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        else NotificationListenerService.requestRebind(ComponentName(this, SpendingNotificationListener::class.java))
                        result.success(null)
                    }
                    "disableNotifications" -> {
                        PaymentReviewBanner.dismiss()
                        NotificationStore.change(this) { it.put("enabled", false) }
                        result.success(null)
                    }
                    "openNotificationSettings" -> {
                        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        result.success(null)
                    }
                    "openAppSettings" -> {
                        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                        result.success(null)
                    }
                    "enableBanner" -> {
                        NotificationStore.change(this) { it.put("bannerEnabled", true) }
                        if (!Settings.canDrawOverlays(this)) startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                        result.success(null)
                    }
                    "disableBanner" -> {
                        NotificationStore.change(this) { it.put("bannerEnabled", false) }
                        PaymentReviewBanner.dismiss()
                        result.success(null)
                    }
                    "peekEvents" -> {
                        val limit = call.argument<Number>("limit")?.toInt() ?: 200
                        io.execute {
                            val list = try { CaptureQueue.peek(this, limit) } catch (_: Exception) { null }
                            main.post { if (list == null) result.error("queue", "Could not read the capture queue.", null) else result.success(list) }
                        }
                    }
                    "ackEvents" -> {
                        val ids = (call.argument<List<String>>("ids") ?: emptyList()).toSet()
                        io.execute {
                            try { CaptureQueue.ack(this, ids) } catch (_: Exception) { }
                            main.post { result.success(null) }
                        }
                    }
                    "readSmsInbox" -> {
                        val since = call.argument<Number>("sinceMillis")?.toLong() ?: 0L
                        if (!granted(Manifest.permission.READ_SMS)) { result.success(emptyList<Any>()); return@setMethodCallHandler }
                        io.execute {
                            val list = try { readInbox(since) } catch (_: Exception) { null }
                            main.post { if (list == null) result.error("sms_read_failed", "Could not read SMS.", null) else result.success(list) }
                        }
                    }
                    "takeSharedImages" -> result.success(synchronized(sharedImages) { ArrayList(sharedImages).also { sharedImages.clear() } })
                    "takeReviewRequest" -> {
                        val requested = intent.getBooleanExtra("open_spending", false)
                        intent.removeExtra("open_spending")
                        result.success(requested)
                    }
                    else -> result.notImplemented()
                }
            } catch (failure: Exception) {
                result.error("capture", failure.message ?: "Could not reach phone capture.", null)
            }
        }
    }

    /** Past bank SMS. Filtered natively; only finance-looking ones go to Dart (in memory). */
    private fun readInbox(since: Long): List<Map<String, Any>> {
        val out = ArrayList<Map<String, Any>>()
        contentResolver.query(Uri.parse("content://sms/inbox"), arrayOf("address", "body", "date"), "date > ?", arrayOf(since.toString()), "date DESC")?.use { c ->
            val ia = c.getColumnIndex("address"); val ib = c.getColumnIndex("body"); val id = c.getColumnIndex("date")
            while (c.moveToNext() && out.size < 5000) {
                val sender = c.getString(ia) ?: continue
                val body = c.getString(ib) ?: continue
                if (!QuickParser.shouldQueueSms(sender, body)) continue
                out.add(mapOf("type" to "sms", "sender" to sender, "text" to body, "timestamp" to c.getLong(id)))
            }
        }
        return out
    }
}
