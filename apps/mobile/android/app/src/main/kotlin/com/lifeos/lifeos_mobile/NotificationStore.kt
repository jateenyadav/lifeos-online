package com.lifeos.lifeos_mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object NotificationStore {
    private const val alias = "lifeos_notification_tracking_v1"
    private const val preferenceName = "notification_tracking"

    private fun secret(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    private fun read(context: Context): JSONObject {
        val prefs = context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
        val encrypted = prefs.getString("state", null) ?: return JSONObject()
        val bytes = Base64.decode(encrypted, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secret(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    }

    private fun write(context: Context, state: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secret())
        val encoded = Base64.encodeToString(cipher.iv + cipher.doFinal(state.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE).edit().putString("state", encoded).commit())
    }

    @Synchronized fun snapshot(context: Context): JSONObject = read(context)

    @Synchronized fun change(context: Context, action: (JSONObject) -> Unit) {
        val state = read(context)
        action(state)
        write(context, state)
    }

    @Synchronized fun configure(context: Context, userId: String?, token: String?, baseUrl: String) {
        val state = read(context)
        if (userId == null || token == null || state.optString("userId") != userId) {
            state.keys().asSequence().toList().forEach { state.remove(it) }
        }
        if (userId != null && token != null) {
            state.put("userId", userId).put("token", token).put("baseUrl", baseUrl)
        }
        write(context, state)
    }

    @Synchronized fun enqueue(context: Context, expense: JSONObject, postedAt: Long) {
        val state = read(context)
        if (!state.optBoolean("enabled") || postedAt < state.optLong("since") || state.optString("token").isBlank()) return
        val pending = state.optJSONArray("pending") ?: JSONArray()
        val seen = state.optJSONArray("seen") ?: JSONArray()
        val key = expense.getString("notificationKey")
        if ((0 until seen.length()).any { seen.getString(it) == key }) return
        pending.put(expense)
        seen.put(key)
        while (seen.length() > 4000) seen.remove(0)
        state.put("pending", pending).put("seen", seen)
        write(context, state)
    }

    @Synchronized fun acknowledge(context: Context, userId: String, key: String) {
        val state = read(context)
        if (state.optString("userId") != userId) return
        val pending = state.optJSONArray("pending") ?: JSONArray()
        var removed = false
        for (index in pending.length() - 1 downTo 0) {
            if (pending.getJSONObject(index).getString("notificationKey") == key) {
                pending.remove(index)
                removed = true
            }
        }
        state.put("pending", pending).put("saved", state.optInt("saved") + if (removed) 1 else 0).remove("error")
        write(context, state)
    }
}
