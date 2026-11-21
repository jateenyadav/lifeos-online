package com.lifeos.lifeos_mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Durable on-device queue of captured SMS / notifications. Each line is
 * encrypted with an Android Keystore AES-GCM key and stored in app-private
 * storage. Flutter peeks, parses, sends only structured fields, then acks.
 * Nothing here is ever logged or sent anywhere as raw text.
 */
object CaptureQueue {
    private const val FILE = "capture_queue.enc"
    private const val ALIAS = "lifeos_capture_queue_v1"
    private const val MAX_EVENTS = 2000
    private val lock = Any()

    @Volatile var listener: (() -> Unit)? = null

    private fun file(context: Context) = File(context.applicationContext.filesDir, FILE)

    private fun secret(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secret())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    private fun decrypt(line: String): JSONObject? = try {
        val bytes = Base64.decode(line, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secret(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    } catch (_: Exception) { null }

    private fun lines(context: Context): MutableList<String> {
        val f = file(context)
        return if (f.exists()) f.readLines().filter { it.isNotBlank() }.toMutableList() else mutableListOf()
    }

    private fun write(context: Context, lines: List<String>) {
        val f = file(context)
        val tmp = File(f.parentFile, "$FILE.tmp")
        tmp.writeText(if (lines.isEmpty()) "" else lines.joinToString("\n") + "\n")
        if (!tmp.renameTo(f)) { f.writeText(tmp.readText()); tmp.delete() }
    }

    fun append(context: Context, event: JSONObject) {
        synchronized(lock) {
            event.put("id", UUID.randomUUID().toString())
            val all = lines(context)
            all.add(encrypt(event.toString()))
            write(context, if (all.size > MAX_EVENTS) all.takeLast(MAX_EVENTS) else all)
        }
        listener?.let { l -> android.os.Handler(android.os.Looper.getMainLooper()).post { l() } }
    }

    /** Oldest first; events stay until acked. */
    fun peek(context: Context, limit: Int): List<Map<String, Any?>> = synchronized(lock) {
        lines(context).asSequence().mapNotNull { decrypt(it) }.take(limit).map { toMap(it) }.toList()
    }

    fun ack(context: Context, ids: Set<String>) {
        synchronized(lock) {
            val kept = lines(context).filter { line -> decrypt(line)?.optString("id")?.let { it !in ids } ?: false }
            write(context, kept)
        }
    }

    fun count(context: Context): Int = synchronized(lock) { lines(context).size }

    fun clear(context: Context) = synchronized(lock) { file(context).delete(); Unit }

    fun smsEvent(sender: String, body: String, timestamp: Long): JSONObject = JSONObject()
        .put("type", "sms").put("sender", sender).put("text", body).put("timestamp", timestamp)

    fun notificationEvent(pkg: String, title: String, text: String, timestamp: Long): JSONObject = JSONObject()
        .put("type", "notification").put("sender", pkg).put("title", title).put("text", text).put("timestamp", timestamp)

    private fun toMap(o: JSONObject): Map<String, Any?> {
        val m = HashMap<String, Any?>()
        for (k in o.keys()) {
            val v = o.get(k)
            m[k] = when (v) {
                JSONObject.NULL -> null
                is JSONArray -> (0 until v.length()).map { v.get(it) }
                else -> v
            }
        }
        return m
    }
}
