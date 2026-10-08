package com.lifeos.lifeos_mobile

import org.junit.Assert.*
import org.junit.Test

class TransactionParserTest {
    @Test fun detectsConfirmedSpendingInPaise() {
        val examples = mapOf(
            "You paid ₹125.50 to Lunch shop via UPI. Ref 123456789012" to 12550L,
            "INR 1,234.56 debited from a/c XX1234. Avl bal INR 9,876.00" to 123456L,
            "Your card was spent at Store for Rs. 1,23,456.78" to 12345678L,
            "You sent INR 250 to Jatin. UTR 123456789012" to 25000L,
            "Payment successful\n₹99.5 paid to Cafe." to 9950L,
            "INR 5 withdrawn at ATM. Available balance INR 100" to 500L,
            "Rs.100/- has been deducted from your account." to 10000L,
            "You paid INR 120." to 12000L,
            "INR 999.99 debited. Balance: INR 4,000" to 99999L
        )
        examples.forEach { (message, expected) -> assertEquals(message, expected, TransactionParser.parse(message)?.amountMinor) }
    }

    @Test fun recognisesWalletPaymentsWithoutGuessingRecipients() {
        val transaction = TransactionParser.parse("INR 125.50 deducted from your wallet at Cafe. Ref 123456789012")!!
        assertEquals(12550L, transaction.amountMinor)
        assertEquals("Wallet", transaction.payment)
        assertEquals("", transaction.recipientKey)
        assertNull(TransactionParser.parse("INR 125.50 wallet refund received", allowIncoming = true))
    }

    @Test fun skipsUnrelatedAmbiguousAndUnfinishedTransactions() {
        listOf(
            "A friend sent you a photo", "Your balance is INR 5000",
            "INR 500 credited to your account", "You received ₹200 from a friend",
            "You paid INR 500. Payment failed", "Payment pending: INR 500",
            "Collect request: Pay INR 500", "Payment request for INR 500",
            "Payment of INR 500 will be debited tomorrow", "Payment reminder: INR 500 due",
            "OTP 123456 for payment of INR 500", "INR 500 refund received",
            "INR 500 debited but reversed", "You paid USD 50 to Cafe",
            "You paid INR 10.123", "You paid INR 0", "You paid INR 100000000",
            "You paid INR 1,2,3", "You paid INR 100 plus INR 5 fee",
            "Transaction successful INR 500", "You have not paid INR 500",
            "INR 500 was not transferred", "A friend sent INR 500 to you",
            "Offer: spend INR 500 to save more", "INR 500 may be deducted"
        ).forEach { assertNull(it, TransactionParser.parse(it)) }
    }

    @Test fun extractsOnlyMerchantPaymentAndReference() {
        val transaction = TransactionParser.parse("You paid ₹125.50 to Lunch shop via UPI. Ref 123456789012")!!
        assertEquals("Payment to Lunch shop", transaction.title)
        assertEquals("UPI", transaction.payment)
        assertEquals("123456789012", transaction.reference)
        assertEquals("Card", TransactionParser.parse("Your credit card was debited INR 99")!!.payment)
        assertEquals("Notification payment", TransactionParser.parse("INR 500 transferred to account 1234567890")!!.title)
        assertNull(TransactionParser.parse("You paid INR 500. Reference unavailable")!!.reference)
    }

    @Test fun sameReferenceAcrossAppsProducesOneIdentity() {
        val transaction = TransactionParser.parse("You paid INR 500. UTR 123456789012")!!
        val first = TransactionParser.fingerprint(transaction, "com.bank", "first", 1000, "2026-10-07", "bank message")
        val second = TransactionParser.fingerprint(transaction, "com.wallet", "second", 2000, "2026-10-07", "wallet message")
        assertEquals(first, second)
        assertTrue(first.matches(Regex("[a-f0-9]{64}")))
        assertNotEquals(first, TransactionParser.fingerprint(transaction, "com.bank", "first", 1000, "2026-10-08", "bank message"))
    }

    @Test fun differentNotificationsWithoutReferenceRemainSeparate() {
        val transaction = TransactionParser.parse("You paid INR 500")!!
        val first = TransactionParser.fingerprint(transaction, "com.bank", "first", 1000, "2026-10-07", "same amount")
        assertEquals(first, TransactionParser.fingerprint(transaction, "com.bank", "first", 1000, "2026-10-07", "same amount"))
        assertNotEquals(first, TransactionParser.fingerprint(transaction, "com.bank", "second", 2000, "2026-10-07", "same amount"))
    }

    @Test fun extractsRecipientWithoutReusingAmountOrReadingAccountNumbers() {
        assertEquals("amit@upi", TransactionParser.parse("You paid INR 50 to Amit@upi via UPI")!!.recipientKey)
        assertEquals("+919876543210", TransactionParser.parse("You paid INR 50 to +919876543210 via UPI")!!.recipientKey)
        assertEquals("", TransactionParser.parse("INR 50 debited from account 123456789012")!!.recipientKey)
    }

    @Test fun incomingPaymentsAreReviewableOnlyWhenRequested() {
        val message = "You received INR 50 from Amit@upi. UTR 123456789012"
        assertNull(TransactionParser.parse(message))
        val payment = TransactionParser.parse(message, allowIncoming = true)!!
        assertEquals("incoming", payment.direction)
        assertEquals("amit@upi", payment.recipientKey)
        assertEquals(5000L, payment.amountMinor)
        assertNull(TransactionParser.parse("INR 50 credited and INR 50 debited", allowIncoming = true))
        assertNull(TransactionParser.parse("INR 50 credited. Payment failed", allowIncoming = true))
    }
}
