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

    /** Only the signed-in user id is kept natively (no tokens): switching users clears everything. */
    @Synchronized fun configure(context: Context, userId: String?): Boolean {
        val state = read(context)
        val changed = userId == null || state.optString("userId") != userId
        if (changed) state.keys().asSequence().toList().forEach { state.remove(it) }
        if (userId != null) state.put("userId", userId)
        // Older versions kept a session token and raw pending items here.
        state.remove("token"); state.remove("pending"); state.remove("seen"); state.remove("baseUrl")
        write(context, state)
        return changed
    }

    @Synchronized fun markCaptured(context: Context) {
        val state = read(context)
        state.put("lastCapturedAt", System.currentTimeMillis())
        write(context, state)
    }
}
