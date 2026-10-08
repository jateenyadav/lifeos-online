package com.lifeos.lifeos_mobile

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONObject

class NotificationSyncJob : JobService() {
    private val running = ConcurrentHashMap<Int, AtomicBoolean>()

    override fun onStartJob(parameters: JobParameters): Boolean {
        val stopped = AtomicBoolean(false)
        running[parameters.jobId] = stopped
        Thread {
            var retry = false
            try {
                var processed = 0
                while (processed < 100) {
                    if (stopped.get()) return@Thread
                    val state = NotificationStore.snapshot(this)
                    val token = state.optString("token")
                    if (!state.optBoolean("enabled") || token.isBlank() || !NotificationAccess.granted(this)) break
                    val pending = state.optJSONArray("pending")
                    if (pending == null || pending.length() == 0) break
                    val expense = pending.getJSONObject(0)
                    val userId = state.getString("userId")
                    val url = URI(state.getString("baseUrl") + "/workspaces/money/notifications").toURL()
                    val connection = url.openConnection() as HttpURLConnection
                    try {
                        connection.requestMethod = "POST"
                        connection.connectTimeout = 15000
                        connection.readTimeout = 15000
                        connection.instanceFollowRedirects = false
                        connection.doOutput = true
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.setRequestProperty("X-Client-Type", "mobile")
                        connection.setRequestProperty("Authorization", "Bearer $token")
                        val latest = NotificationStore.snapshot(this)
                        if (stopped.get() || latest.optString("userId") != userId || latest.optString("token") != token || !latest.optBoolean("enabled") || !NotificationAccess.granted(this)) return@Thread
                        connection.outputStream.use { it.write(expense.toString().toByteArray(Charsets.UTF_8)) }
                        val status = connection.responseCode
                        if (status in 200..299) {
                            val response = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                            val entry = response.optJSONObject("entry")
                            NotificationStore.acknowledge(this, userId, expense.getString("notificationKey"))
                            if (entry?.optString("status") == "pending") PaymentReviewBanner.show(this, userId, entry)
                            MainActivity.notifyPaymentsChanged()
                            processed += 1
                        } else {
                            NotificationStore.change(this) {
                                if (it.optString("userId") == userId && it.optString("token") == token) {
                                    it.put("error", if (status == 401) "Sign in again to resume notification saving." else "Could not save notifications (HTTP $status). Check the server and retry.")
                                    if (status == 401) it.remove("token")
                                }
                            }
                            retry = status != 401
                            return@Thread
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
                val finalState = NotificationStore.snapshot(this)
                retry = finalState.optBoolean("enabled") && finalState.optString("token").isNotBlank() && NotificationAccess.granted(this) && (finalState.optJSONArray("pending")?.length() ?: 0) > 0
            } catch (_: Exception) {
                retry = true
                try {
                    NotificationStore.change(this) { it.put("error", "Waiting for a connection to the server. New expenses stay on this phone.") }
                } catch (_: Exception) {
                    retry = false
                }
            } finally {
                running.remove(parameters.jobId, stopped)
                if (!stopped.get()) jobFinished(parameters, retry)
            }
        }.start()
        return true
    }

    override fun onStopJob(parameters: JobParameters): Boolean {
        running.remove(parameters.jobId)?.set(true)
        return true
    }

    companion object {
        private const val jobId = 4107
        private const val recoveryJobId = 4108
        fun schedule(context: Context) {
            val state = NotificationStore.snapshot(context)
            if (!state.optBoolean("enabled") || state.optString("token").isBlank() || !NotificationAccess.granted(context)) return
            val scheduler = context.getSystemService(JobScheduler::class.java)
            if (scheduler.getPendingJob(recoveryJobId) == null) {
                check(scheduler.schedule(JobInfo.Builder(recoveryJobId, ComponentName(context, NotificationSyncJob::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
                    .setPeriodic(15 * 60 * 1000L).build()) == JobScheduler.RESULT_SUCCESS)
            }
            if ((state.optJSONArray("pending")?.length() ?: 0) == 0) return
            if (scheduler.getPendingJob(jobId) != null) return
            check(scheduler.schedule(JobInfo.Builder(jobId, ComponentName(context, NotificationSyncJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build()) == JobScheduler.RESULT_SUCCESS)
        }
        fun cancel(context: Context) {
            context.getSystemService(JobScheduler::class.java).cancel(jobId)
            context.getSystemService(JobScheduler::class.java).cancel(recoveryJobId)
        }
    }
}
