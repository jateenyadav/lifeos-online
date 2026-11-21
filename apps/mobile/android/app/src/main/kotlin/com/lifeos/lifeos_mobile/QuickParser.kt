package com.lifeos.lifeos_mobile

import java.security.MessageDigest

/**
 * Lightweight native filter (ported from SpendSense). Decides on the phone
 * whether a message is worth queueing (drops OTP / promo / personal text)
 * and renders the floating banner. The real parse runs in Dart; message
 * text never leaves the phone and is never logged.
 */
object QuickParser {
    data class Quick(
        val amountPaise: Long,
        val isDebit: Boolean,
        val merchant: String?,
        val bank: String?,
        val channel: String?,
    )

    private val otp = Regex("""\b(otp|one[\s-]?time[\s-]?pass(word|code)?|verification code)\b""", RegexOption.IGNORE_CASE)
    private val completed = Regex(
        """\b(debited|credited|spent|sent|received|withdrawn|deposited|transferred|paid|refunded|reversed|deducted|used for|used at|successful|successfully)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val modal = Regex("""\b(will be|can be|to be|could be|may be|get)\s+(debited|credited|paid|transferred)\b""", RegexOption.IGNORE_CASE)
    private val promo = Regex("""\b(offer|pre-?approved|apply now|loan|cashback up\s?to|congratulations|win|voucher|discount)\b""", RegexOption.IGNORE_CASE)
    private val request = Regex("""\b(request(ed|ing)?|wants you to pay|reminder|due on|bill due|pay now)\b""", RegexOption.IGNORE_CASE)
    private val amount = Regex("""(?:rs\.?|inr|₹)\s*:?\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)
    private val amountAfterVerb = Regex("""\b(?:debited|credited)\s+(?:by|with|for)?\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)
    private val balanceCtx = Regex("""(bal|balance|limit|lmt|avl|avbl|available)[\s.:a-z]{0,14}$""", RegexOption.IGNORE_CASE)
    private val debitWords = Regex("""\b(debited|spent|paid|sent|withdrawn|deducted|transferred from|used for|used at|purchase|transaction of|payment of|successful)\b""", RegexOption.IGNORE_CASE)
    private val creditWords = Regex("""\b(credited|received|deposited|refunded|refund|reversed)\b""", RegexOption.IGNORE_CASE)
    private val merchantPatterns = listOf(
        Regex("""upi/p2[am]/\d+/([^\n/]+)""", RegexOption.IGNORE_CASE),
        Regex("""(?:paid|sent)\s+(?:₹|rs\.?|inr)\s*[\d,.]+\s+to\s+([^\n.,!]{2,40})""", RegexOption.IGNORE_CASE),
        Regex("""(?:received|got)\s+(?:₹|rs\.?|inr)\s*[\d,.]+\s+from\s+([^\n.,!]{2,40})""", RegexOption.IGNORE_CASE),
        Regex("""\btrf to\s+([A-Za-z0-9&.' -]{2,40}?)(?=\s+(?:ref|on)\b|\.|$)""", RegexOption.IGNORE_CASE),
        Regex("""^\s*to\s+([^\n]{2,40})$""", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE)),
        Regex(""";\s*([A-Za-z0-9&.' -]{2,40}?)\s+credited""", RegexOption.IGNORE_CASE),
        Regex("""\b(?:at|to|from)\s+([A-Za-z0-9@&.'_ -]{2,40}?)(?=\s+(?:on|ref|upi|via|using|thru|txn|avl|for|credited)\b|\s*[.,;(]|\n|$)""", RegexOption.IGNORE_CASE),
    )
    private val banks = linkedMapOf(
        "HDFC" to "HDFC Bank", "SBI" to "SBI", "ICICI" to "ICICI Bank", "AXIS" to "Axis Bank",
        "KOTAK" to "Kotak Bank", "PNB" to "PNB", "BOB" to "Bank of Baroda", "BARODA" to "Bank of Baroda",
        "CANBNK" to "Canara Bank", "UNION" to "Union Bank", "IDFC" to "IDFC FIRST", "YES" to "Yes Bank",
        "INDUS" to "IndusInd Bank", "FEDBNK" to "Federal Bank",
    )

    private val paymentContext = Regex(
        """\b(upi|a/c|acct|account|card|wallet|ref|utr|rrn|txn|transaction|paid to|sent to|received from|bank|debited|credited|vpa)\b""",
        RegexOption.IGNORE_CASE,
    )

    /** Stricter check for apps not on the known list: amount + completed verb + payment wording, no promo. */
    fun looksStrongPayment(text: String): Boolean =
        looksFinancial(text) && paymentContext.containsMatchIn(text) && !promo.containsMatchIn(text)

    private val businessWords = Regex(
        """\b(store|stores|shop|mart|kitchen|restaurant|cafe|hotel|foods?|bakery|sweets|medical|medicals|pharmacy|chemist|hospital|clinic|pvt|private|ltd|limited|llp|enterprises?|traders?|services?|solutions?|technologies|retail|agency|company|motors|petrol|fuel|station|electronics|mobiles?|fashion|salon|gym|travels?|cabs?|taxi|school|college|academy|society|bank|finance|insurance|recharge|bills?|payments?|pay|wallet|merchant|zomato|swiggy|amazon|flipkart|blinkit|zepto|uber|ola|irctc|jio|airtel|netflix|google|cred|card)\b""",
        RegexOption.IGNORE_CASE,
    )

    /** Mirror of the Dart PeerRules: a private person rather than a shop (used to offer "Friend owes me?"). */
    fun looksLikePerson(name: String?): Boolean {
        val n = name?.trim() ?: return false
        if (n.isEmpty() || n.contains('@') || n.any { it.isDigit() }) return Regex("""^[6-9]\d{9}@""").containsMatchIn(n)
        if (businessWords.containsMatchIn(n)) return false
        val words = n.split(Regex("""\s+""")).filter { it.isNotEmpty() }
        if (words.isEmpty() || words.size > 4) return false
        if (!words.all { Regex("""^[A-Za-z.']{1,15}$""").matches(it) }) return false
        return words.size >= 2 || words[0].length >= 3
    }

    private val cardBill = Regex(
        """(total\s*(amount|amt)?\s*(due|payable)|min(imum)?\.?\s*(amount|amt)?\s*due|statement|payment\s+of\s+(rs|inr|₹).{0,60}\bdue\b|avl\.?\s*(lmt|limit)|available\s*(credit\s*)?limit)""",
        RegexOption.IGNORE_CASE,
    )

    /** Credit-card statement / bill reminder / limit update (never shown as a banner). */
    fun looksCardBill(text: String): Boolean =
        Regex("""\bcard\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) &&
            cardBill.containsMatchIn(text) && amount.containsMatchIn(text) &&
            !(otp.containsMatchIn(text)) && promo.findAll(text).count() < 2

    /** Phone numbers send personal SMS; banks use alphanumeric sender ids. */
    private val personalSender = Regex("""^\+?[0-9][0-9 ()-]{6,}$""")

    fun isPersonalSender(sender: String): Boolean = personalSender.matches(sender.trim())

    /** The whole SMS decision: queue only bank-like senders with payment or card-bill text. */
    fun shouldQueueSms(sender: String, body: String): Boolean {
        if (body.isBlank() || body.length > 2000 || isPersonalSender(sender)) return false
        return looksFinancial(body) || looksCardBill(body)
    }

    /** Notifications: known payment apps need a completed movement; other apps a strong one. */
    fun shouldQueueNotification(packageName: String, text: String, knownApp: Boolean): Boolean {
        if (text.isBlank() || text.length > 4000) return false
        return if (knownApp) looksFinancial(text) else looksStrongPayment(text)
    }

    /** True when the text looks like a completed money movement. */
    fun looksFinancial(text: String): Boolean {
        if (otp.containsMatchIn(text) && !completed.containsMatchIn(text)) return false
        if (request.containsMatchIn(text) && !Regex("""\b(debited|credited)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text)) return false
        val hasAmount = amount.containsMatchIn(text) || amountAfterVerb.containsMatchIn(text)
        if (!hasAmount) return false
        val c = completed.findAll(text).filter { m -> modal.findAll(text).none { it.range.first <= m.range.first && it.range.last >= m.range.last } }
        if (c.none()) return false
        if (promo.findAll(text).count() >= 2) return false
        return true
    }

    fun parse(text: String, sender: String? = null): Quick? {
        if (!looksFinancial(text)) return null
        val amt = firstAmount(text) ?: return null
        val d = debitWords.find(text)
        val c = creditWords.find(text)
        val isDebit = when {
            d == null && c == null -> return null
            d == null -> false
            c == null -> true
            else -> d.range.first <= c.range.first
        }
        val merchant = merchantPatterns.asSequence()
            .mapNotNull { it.find(text)?.groupValues?.get(1)?.trim()?.trimEnd('.', ',', ';', ':') }
            .firstOrNull { it.length >= 2 && !it.matches(Regex("""(?i)^(your|a/c|ac|acct|account|card|bank|rs|inr).*""")) && !it.matches(Regex("""^[xX*.\d\s]+$""")) }
        return Quick(amt, isDebit, merchant, bankName(sender ?: "", text), channel(text))
    }

    private fun firstAmount(text: String): Long? {
        for (m in amount.findAll(text)) {
            val before = text.substring(maxOf(0, m.range.first - 22), m.range.first)
            if (balanceCtx.containsMatchIn(before)) continue
            val v = toPaise(m.groupValues[1])
            if (v != null && v > 0) return v
        }
        return amountAfterVerb.find(text)?.let { toPaise(it.groupValues[1]) }
    }

    fun toPaise(s: String): Long? {
        val m = Regex("""(\d[\d,]*)(?:\.(\d{1,2}))?""").find(s) ?: return null
        val rupees = m.groupValues[1].replace(",", "").toLongOrNull() ?: return null
        var p = m.groupValues[2]
        if (p.isEmpty()) p = "0"
        if (p.length == 1) p += "0"
        return rupees * 100 + p.toLong()
    }

    fun bankName(sender: String, text: String): String? {
        val s = sender.uppercase()
        for ((code, name) in banks) if (s.contains(code)) return name
        val t = text.uppercase()
        for ((code, name) in banks) if (Regex("""\b$code\b""").containsMatchIn(t)) return name
        return null
    }

    private fun channel(text: String): String? {
        val t = text.lowercase()
        return when {
            Regex("""\b(upi|vpa)\b""").containsMatchIn(t) || t.contains("@") -> "UPI"
            Regex("""\b(card|pos|spent)\b""").containsMatchIn(t) -> "Card"
            Regex("""\bimps\b""").containsMatchIn(t) -> "IMPS"
            Regex("""\bneft\b""").containsMatchIn(t) -> "NEFT"
            Regex("""\batm\b""").containsMatchIn(t) -> "ATM"
            else -> null
        }
    }

    /** Indian grouping: 1234567.5 -> ₹12,34,567.50 */
    fun formatInr(paise: Long, hide: Boolean = false): String {
        if (hide) return "₹•••"
        val rupees = paise / 100
        val rem = paise % 100
        val s = rupees.toString()
        val grouped = if (s.length <= 3) s else {
            val last3 = s.takeLast(3)
            var rest = s.dropLast(3)
            val parts = mutableListOf<String>()
            while (rest.length > 2) { parts.add(0, rest.takeLast(2)); rest = rest.dropLast(2) }
            if (rest.isNotEmpty()) parts.add(0, rest)
            parts.joinToString(",") + "," + last3
        }
        return "₹" + grouped + if (rem != 0L) "." + rem.toString().padStart(2, '0') else ""
    }

    // ---- Merchant key normalisation: must match MerchantNormalizer + EventPump.simpleKey in Dart.
    private val noise = setOf(
        "PVT", "PRIVATE", "LTD", "LIMITED", "LLP", "INC", "CO", "COMPANY", "THE", "INDIA", "IN", "ONLINE",
        "PAYMENTS", "PAYMENT", "TECHNOLOGIES", "TECHNOLOGY", "SERVICES", "SERVICE", "SOLUTIONS", "ENTERPRISES",
        "ENTERPRISE", "RETAIL", "MS", "M/S", "UPI", "VPA", "POS", "ECOM", "WWW", "COM",
    )
    private val synonyms = mapOf(
        "STORES" to "STORE", "SHOP" to "STORE", "SHOPPE" to "STORE", "MEDICALS" to "MEDICAL", "PHARMACY" to "MEDICAL",
        "CHEMIST" to "MEDICAL", "CHEMISTS" to "MEDICAL", "RESTAURANTS" to "RESTAURANT", "HOTELS" to "HOTEL", "TRADERS" to "TRADER",
    )

    fun merchantKey(raw: String): String {
        var s = raw.uppercase()
        val at = s.indexOf('@')
        if (at > 0 && !s.substring(0, at).contains(' ')) s = s.substring(0, at)
        s = s.replace(Regex("""[._\-/*#&+,()\[\]:]+"""), " ")
        s = s.replace(Regex("""\b\d{4,}\b"""), " ")
        s = s.replace(Regex("""[^A-Z0-9 ]"""), " ")
        return s.split(Regex("""\s+""")).filter { it.isNotEmpty() && it !in noise }.map { synonyms[it] ?: it }.joinToString(" ").trim()
    }

    fun smsHash(sender: String, body: String): String = sha256("sms|${sender.trim()}|${body.trim()}")
    fun notificationHash(pkg: String, title: String, text: String, whenMillis: Long): String =
        sha256("notif|$pkg|$title|$text|$whenMillis")

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
