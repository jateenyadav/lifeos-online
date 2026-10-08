package com.lifeos.lifeos_mobile

import java.math.BigDecimal
import java.security.MessageDigest
import java.util.Locale

data class ParsedTransaction(
    val amountMinor: Long,
    val title: String,
    val payment: String,
    val reference: String?,
    val recipientKey: String = "",
    val direction: String = "outgoing"
)

object TransactionParser {
    private val excluded = Regex(
        "\\b(failed|declined|pending|processing|cancelled|canceled|unsuccessful|reversed|reversal|refunded|refund|cashback|OTP|verification code)\\b|" +
            "\\b(?:payment|collect|money)\\s+request\\b|\\brequest(?:ed)?\\s+(?:a\\s+)?payment\\b|" +
            "\\b(?:will|would|may|to be|scheduled to be)\\s+(?:be\\s+)?(?:debited|paid|deducted|transferred)\\b|" +
            "\\b(?:due|reminder|offer|pay now|scheduled)\\b|" +
            "\\bnot\\s+(?:paid|debited|spent|sent|transferred|withdrawn|deducted)\\b|" +
            "\\b(?:sent|paid|transferred)\\b[^\\n]{0,100}\\bto you\\b",
        RegexOption.IGNORE_CASE
    )
    private val completed = Regex(
        "\\b(debited|paid|spent|sent|transferred|withdrawn|deducted)\\b|" +
            "\\b(?:payment|purchase)\\s+(?:was\\s+)?successful\\b",
        RegexOption.IGNORE_CASE
    )
    private val amount = Regex(
        "(?:₹|\\bINR\\b|\\bRs\\.?)[\\s:]*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9,]|\\.[0-9])",
        RegexOption.IGNORE_CASE
    )
    private val reference = Regex(
        "\\b(?:UTR|RRN|UPI\\s+(?:ref(?:erence)?|txn(?:\\s+id)?)|" +
            "(?:txn|transaction)\\s*(?:id|no\\.?|number)|ref(?:erence)?(?:\\s*(?:no\\.?|number))?)" +
            "[\\s:#.-]*([a-zA-Z0-9-]{6,64})\\b",
        RegexOption.IGNORE_CASE
    )

    fun parse(text: String, allowIncoming: Boolean = false): ParsedTransaction? {
        val incoming = Regex("\\b(credited|received)\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)
        if (text.length > 12000 || excluded.containsMatchIn(text) || (incoming && !allowIncoming) || (!incoming && !completed.containsMatchIn(text))) return null
        if (incoming && Regex("\\b(debited|spent|deducted|withdrawn)\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)) return null
        val candidates = amount.findAll(text).filter { match ->
            val prefix = text.substring(maxOf(0, match.range.first - 40), match.range.first)
            !Regex("(?:bal(?:ance)?|avl|available balance|limit)[\\s.:=-]*$", RegexOption.IGNORE_CASE).containsMatchIn(prefix)
        }.mapNotNull { match ->
            val number = match.groupValues[1]
            val whole = number.substringBefore('.')
            if (whole.contains(',') &&
                !Regex("[0-9]{1,3}(?:,[0-9]{3})+").matches(whole) &&
                !Regex("[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3}").matches(whole)) return@mapNotNull null
            try {
                BigDecimal(number.replace(",", "")).multiply(BigDecimal(100)).longValueExact()
                    .takeIf { it in 1..9999999999L }
            } catch (_: ArithmeticException) {
                null
            } catch (_: NumberFormatException) {
                null
            }
        }.distinct().toList()
        if (candidates.size != 1) return null
        val merchant = Regex(
            "\\b(?:to|at)\\s+([\\p{L}][\\p{L}0-9 &'._-]{1,70}?)(?=\\s+(?:on|via|using|ref|UPI|UTR|RRN|txn|transaction|from|a/c|account)\\b|[.;\\n]|$)",
            RegexOption.IGNORE_CASE
        ).find(text)?.groupValues?.get(1)?.trim()
        val safeMerchant = merchant?.takeUnless {
            Regex("\\b(account|card|bank|a/c)\\b|[0-9]{5,}", RegexOption.IGNORE_CASE).containsMatchIn(it)
        }
        val method = when {
            Regex("\\bUPI\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "UPI"
            Regex("\\bcard\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "Card"
            Regex("\\bwallet\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "Wallet"
            else -> "Other"
        }
        val recipientWord = if (incoming) "from" else "to|at"
        val upi = Regex("\\b(?:$recipientWord)\\s+([a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,})", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trimEnd('.')?.lowercase(Locale.ROOT)?.takeIf { it.length <= 120 }
        val phone = if (method == "UPI") Regex("\\b(?:$recipientWord)\\s+(\\+?[0-9]{10,15})(?![0-9])", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.let { if (it.startsWith('+')) it else "+$it" }
            else null
        return ParsedTransaction(
            candidates.single(),
            if (incoming) "Money received" else safeMerchant?.let { "Payment to $it" } ?: "Notification payment",
            method,
            reference.findAll(text).map { it.groupValues[1] }
                .firstOrNull { value -> value.any { it.isDigit() } }?.uppercase(Locale.ROOT),
            upi ?: phone ?: "",
            if (incoming) "incoming" else "outgoing"
        )
    }

    fun fingerprint(transaction: ParsedTransaction, packageName: String, key: String, postedAt: Long, date: String, text: String): String {
        val identity = transaction.reference?.let { "ref:$it:${transaction.amountMinor}:$date:INR" }
            ?: "notification:$packageName:$key:$postedAt:${transaction.amountMinor}:${text.trim()}"
        val directionalIdentity = if (transaction.direction == "incoming") "incoming:$identity" else identity
        return MessageDigest.getInstance("SHA-256").digest(directionalIdentity.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
