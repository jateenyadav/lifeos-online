package com.lifeos.lifeos_mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureFilterTest {
    private val hdfc = "Rs.450.00 debited from a/c **1234 on 21-11-26 to VPA rahul@okaxis (UPI Ref No 123456789012). Not you? Call 18002586161"

    @Test fun queuesBankDebitFromBankSender() {
        assertTrue(QuickParser.shouldQueueSms("HDFCBK", hdfc))
        assertTrue(QuickParser.shouldQueueSms("VM-HDFCBK-S", hdfc))
    }

    @Test fun dropsOtpPromoAndPersonal() {
        assertFalse(QuickParser.shouldQueueSms("VM-HDFCBK", "482913 is your OTP for a txn of Rs 2,000 at AMAZON. Do not share it."))
        assertFalse(QuickParser.shouldQueueSms("VK-OFFERS", "Congratulations! Pre-approved loan of Rs 5,00,000. Apply now"))
        assertFalse(QuickParser.shouldQueueSms("+919876543210", "Sent you Rs 500 for dinner, paid via UPI"))
        assertFalse(QuickParser.shouldQueueSms("9876543210", hdfc))
        assertFalse(QuickParser.shouldQueueSms("JD-AIRTEL", "Your bill of Rs 499 is due on 25 Nov. Pay now"))
        assertFalse(QuickParser.shouldQueueSms("HDFCBK", ""))
    }

    @Test fun keepsCardBillsForDueDates() {
        assertTrue(QuickParser.shouldQueueSms("AX-HDFCBK", "Your HDFC Bank Credit Card XX4521 statement is generated. Total Amt Due: Rs 1,299.00, Min Amt Due: Rs 200.00, Due Date: 21-11-2026."))
    }

    @Test fun personalSendersAreNumbers() {
        assertTrue(QuickParser.isPersonalSender("+91 98765 43210"))
        assertTrue(QuickParser.isPersonalSender("09876543210"))
        assertFalse(QuickParser.isPersonalSender("HDFCBK"))
        assertFalse(QuickParser.isPersonalSender("AD-SBIUPI"))
    }

    @Test fun notificationPolicy() {
        val own = "com.lifeos.lifeos_mobile"
        assertEquals("queue", CapturePolicy.decide("com.phonepe.app", own, "Payment successful\nPaid ₹450 to Sharma Grocery", false))
        assertNull(CapturePolicy.decide("com.phonepe.app", own, "Get 10% cashback up to ₹100 on your next recharge. Offer ends today, win voucher", false))
        assertNull(CapturePolicy.decide("org.telegram.messenger", own, "Paid ₹450 to Sharma via UPI ref 1234", false))
        assertNull(CapturePolicy.decide(own, own, "Paid ₹450 to Sharma", false))
        // SMS apps are only a fallback when the SMS permission is missing.
        assertEquals("sms", CapturePolicy.decide("com.google.android.apps.messaging", own, hdfc, false))
        assertNull(CapturePolicy.decide("com.google.android.apps.messaging", own, hdfc, true))
        // Unknown apps need strong payment wording.
        assertNull(CapturePolicy.decide("com.example.game", own, "You won 500 coins", false))
    }
}
