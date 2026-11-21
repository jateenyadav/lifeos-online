package com.lifeos.lifeos_mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickParserTest {
    @Test fun parsesHdfcUpiDebit() {
        val q = QuickParser.parse("Sent Rs.450.00\nFrom HDFC Bank A/C *1234\nTo SHARMA STORE\nOn 15/11/26\nRef 432109876543", "VM-HDFCBK")!!
        assertEquals(45000L, q.amountPaise)
        assertTrue(q.isDebit)
        assertEquals("SHARMA STORE", q.merchant)
        assertEquals("HDFC Bank", q.bank)
    }

    @Test fun parsesCredit() {
        val q = QuickParser.parse("Dear SBI User, your A/c X5678-credited by Rs.2000 on 15Nov26 transfer from RAHUL KUMAR Ref No 432109876222 -SBI", "JD-SBIINB")!!
        assertEquals(200000L, q.amountPaise)
        assertFalse(q.isDebit)
        assertEquals("SBI", q.bank)
    }

    @Test fun parsesPhonePeNotification() {
        val q = QuickParser.parse("Payment successful\nPaid ₹450 to Sharma Grocery")!!
        assertEquals(45000L, q.amountPaise)
        assertTrue(q.isDebit)
        assertEquals("Sharma Grocery", q.merchant)
    }

    @Test fun ignoresBalanceAmount() {
        val q = QuickParser.parse("INR 1,299.00 spent using ICICI Bank Card XX5678 on 15-Nov-26 on AMAZON. Avl Limit: INR 98,701.00.")!!
        assertEquals(129900L, q.amountPaise)
    }

    @Test fun rejectsOtpPromoAndRequests() {
        assertNull(QuickParser.parse("123456 is your OTP for txn of Rs.450.00 at AMAZON. Do not share."))
        assertFalse(QuickParser.looksFinancial("Congratulations! Pre-approved loan of Rs 5,00,000. Apply now"))
        assertFalse(QuickParser.looksFinancial("Rahul is requesting ₹500 on Google Pay"))
        assertFalse(QuickParser.looksFinancial("Rs 499 will be debited from your account on 20-Nov for NETFLIX"))
        assertFalse(QuickParser.looksFinancial("Hey, dinner at 8?"))
    }

    @Test fun formatsIndianRupees() {
        assertEquals("₹450", QuickParser.formatInr(45000))
        assertEquals("₹1,23,456.78", QuickParser.formatInr(12345678))
        assertEquals("₹•••", QuickParser.formatInr(45000, hide = true))
    }

    @Test fun merchantKeyMatchesDartNormalizer() {
        assertEquals("SHARMA STORE", QuickParser.merchantKey("Sharma Stores Pvt Ltd"))
        assertEquals("SHARMA STORE", QuickParser.merchantKey("sharma.store@ybl"))
        assertEquals("SWIGGY", QuickParser.merchantKey("SWIGGY 4455667788"))
    }

    @Test fun hashMatchesDartFormula() {
        assertEquals("8e85abb46b9b364e81e7921ced9213ea20814a1c178c3c115a82e2fb9d6765e6",
            QuickParser.smsHash("VM-HDFCBK", "Rs.100 debited"))
    }

    @Test fun toPaiseExact() {
        assertEquals(45050L, QuickParser.toPaise("450.5"))
        assertEquals(100000000L, QuickParser.toPaise("10,00,000"))
        assertNotNull(QuickParser.toPaise("Rs 1"))
    }

    @Test fun personOrShopForTheFriendButton() {
        assertTrue(QuickParser.looksLikePerson("Rahul Kumar"))
        assertTrue(QuickParser.looksLikePerson("PRIYA SINGH"))
        assertTrue(QuickParser.looksLikePerson("9876543210@ybl"))
        assertFalse(QuickParser.looksLikePerson("Maiz Mexican Kitchen"))
        assertFalse(QuickParser.looksLikePerson("ZOMATO LTD"))
        assertFalse(QuickParser.looksLikePerson("paytm.s1100nz@pty"))
        assertFalse(QuickParser.looksLikePerson(null))
    }

    @Test fun cardStatementsAreQueuedButNotPayments() {
        val stmt = "Your HDFC Bank Credit Card XX4521 statement is generated. Total Amt Due: Rs 1,299.00, Min Amt Due: Rs 200.00, Due Date: 21-11-2026."
        assertTrue(QuickParser.looksCardBill(stmt))
        assertNull(QuickParser.parse(stmt))
        assertFalse(QuickParser.looksCardBill("Get a pre-approved loan on your card. Apply now, offer ends today, win cashback up to Rs 500"))
        assertFalse(QuickParser.looksCardBill("Your OTP for card XX4521 statement download is 482913"))
    }
}
