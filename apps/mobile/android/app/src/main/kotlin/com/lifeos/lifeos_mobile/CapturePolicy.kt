package com.lifeos.lifeos_mobile

/** Which apps' notifications are looked at (pure, unit-tested). */
object CapturePolicy {
    /** Known payment / bank / card / wallet apps. */
    val PAYMENT_PACKAGES = setOf(
        "com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm", "in.org.npci.upiapp",
        "in.amazon.mShop.android.shopping", "com.dreamplug.androidapp", "money.super.payments", "com.mobikwik_new",
        "com.snapwork.hdfc", "com.hdfcbank.payzapp", "com.sbi.lotusintouch", "com.sbi.upi",
        "com.csam.icici.bank.imobile", "com.axis.mobile", "com.msf.kbank.mobile", "com.pnb.pnbone",
        "com.bankofbaroda.mconnect", "com.idfcfirstbank.optimus", "com.whatsapp",
        "com.tatadigital.tcp", "com.naviapp", "com.bharatpe.app", "money.jupiter", "com.epifi.paisa",
        "indwin.c3.shareapp", "com.freecharge.android", "com.myairtelapp", "com.samsung.android.spay",
        "com.google.android.apps.walletnfcrel", "com.flipkart.android",
        "com.kotak811mobilebankingapp.instantsavingsupiscanandpayrecharge", "com.fss.indus", "com.fedmobile",
        "com.canarabank.mobility", "com.unionbankofindia.vyom", "com.yesbank", "com.aubank.aubankapp",
        "com.sbicard.app", "com.onecard.app", "com.uni.cards",
    )

    /** SMS apps: only used when the SMS permission is not granted. */
    val SMS_APPS = setOf(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms",
        "com.truecaller", "com.oneplus.mms", "com.coloros.mms", "com.vivo.message", "com.android.messaging",
        "com.miui.smsextra", "com.motorola.messaging", "com.transsion.message", "com.realme.mms",
    )

    /** Chat / social / email / shopping apps: people type amounts there, never read. */
    val NEVER_READ = setOf(
        "com.whatsapp.w4b", "org.telegram.messenger", "com.instagram.android", "com.facebook.orca",
        "com.facebook.katana", "com.snapchat.android", "com.twitter.android", "com.discord",
        "com.linkedin.android", "com.google.android.gm", "com.microsoft.office.outlook",
        "com.google.android.youtube", "com.android.chrome", "com.Slack", "com.microsoft.teams",
        "us.zoom.videomeetings", "com.google.android.apps.dynamite", "com.application.zomato",
        "in.swiggy.android", "com.grofers.customerapp", "com.zeptoconsumerapp", "com.myntra.android",
        "com.ubercab", "com.olacabs.customer", "com.android.vending",
    )

    fun isSmsApp(pkg: String): Boolean =
        pkg in SMS_APPS || (pkg !in NEVER_READ && Regex("""(\.mms\b|messag|\.sms\b)""").containsMatchIn(pkg))

    /** "queue" (payment app), "sms" (SMS app fallback), or null (drop). */
    fun decide(pkg: String, ownPackage: String, text: String, smsPermission: Boolean): String? = when {
        pkg == ownPackage || pkg in NEVER_READ -> null
        isSmsApp(pkg) -> if (!smsPermission && QuickParser.looksFinancial(text)) "sms" else null
        QuickParser.shouldQueueNotification(pkg, text, pkg in PAYMENT_PACKAGES) -> "queue"
        else -> null
    }
}
