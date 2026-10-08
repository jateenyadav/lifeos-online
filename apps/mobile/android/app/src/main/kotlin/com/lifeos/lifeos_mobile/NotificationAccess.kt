package com.lifeos.lifeos_mobile

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.provider.Settings

object NotificationAccess {
    fun supported(context: Context): Boolean = Build.VERSION.SDK_INT > 29 || !context.getSystemService(ActivityManager::class.java).isLowRamDevice

    fun granted(context: Context): Boolean {
        val component = ComponentName(context, SpendingNotificationListener::class.java)
        return if (Build.VERSION.SDK_INT >= 27) {
            context.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component)
        } else {
            Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
                ?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
        }
    }
}
