package com.lifeos.lifeos_mobile

import org.junit.Assert.*
import org.junit.Test

class NotificationCapturePolicyTest {
    @Test fun acceptsOnlyNewNotificationsAfterConsent() {
        assertTrue(NotificationCapturePolicy.accepts(true, 1000, 1001, 1001))
        assertTrue(NotificationCapturePolicy.accepts(true, 1000, 1000, 0))
        assertFalse(NotificationCapturePolicy.accepts(false, 1000, 1001, 1001))
        assertFalse(NotificationCapturePolicy.accepts(true, 0, 1001, 1001))
        assertFalse(NotificationCapturePolicy.accepts(true, 1000, 999, 999))
        assertFalse(NotificationCapturePolicy.accepts(true, 1000, 1100, 999))
    }

    @Test fun reenablingUsesNewConsentBoundary() {
        assertFalse(NotificationCapturePolicy.accepts(true, 2000, 1500, 1500))
        assertTrue(NotificationCapturePolicy.accepts(true, 2000, 2001, 2001))
    }
}
