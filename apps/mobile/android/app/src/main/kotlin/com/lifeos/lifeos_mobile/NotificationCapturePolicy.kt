package com.lifeos.lifeos_mobile

object NotificationCapturePolicy {
    fun accepts(enabled: Boolean, since: Long, postedAt: Long, displayedAt: Long): Boolean =
        enabled && since > 0 && postedAt >= since && (displayedAt <= 0 || displayedAt >= since)
}
