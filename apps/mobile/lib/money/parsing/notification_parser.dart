import '../core/money.dart';
import '../models.dart';
import 'field_extractors.dart';
import 'sms_parser.dart';

/// Known payment/bank apps whose notifications may describe transactions.
class PaymentApps {
  static const Map<String, String> apps = {
    'com.google.android.apps.nbu.paisa.user': 'Google Pay',
    'com.phonepe.app': 'PhonePe',
    'net.one97.paytm': 'Paytm',
    'in.org.npci.upiapp': 'BHIM',
    'in.amazon.mShop.android.shopping': 'Amazon Pay',
    'com.whatsapp': 'WhatsApp Pay',
    'com.dreamplug.androidapp': 'CRED',
    'money.super.payments': 'super.money',
    'com.mobikwik_new': 'MobiKwik',
    'com.snapwork.hdfc': 'HDFC Bank',
    'com.hdfcbank.payzapp': 'PayZapp',
    'com.sbi.lotusintouch': 'SBI YONO',
    'com.sbi.upi': 'BHIM SBI Pay',
    'com.csam.icici.bank.imobile': 'ICICI iMobile',
    'com.axis.mobile': 'Axis Mobile',
    'com.msf.kbank.mobile': 'Kotak',
    'com.pnb.pnbone': 'PNB ONE',
    'com.bankofbaroda.mconnect': 'bob World',
    'com.idfcfirstbank.optimus': 'IDFC FIRST',
    'com.tatadigital.tcp': 'Tata Neu',
    'com.naviapp': 'Navi',
    'com.bharatpe.app': 'BharatPe',
    'money.jupiter': 'Jupiter',
    'com.epifi.paisa': 'Fi',
    'indwin.c3.shareapp': 'slice',
    'com.freecharge.android': 'Freecharge',
    'com.myairtelapp': 'Airtel Thanks',
    'com.samsung.android.spay': 'Samsung Wallet',
    'com.google.android.apps.walletnfcrel': 'Google Wallet',
    'com.flipkart.android': 'Flipkart UPI',
    'com.kotak811mobilebankingapp.instantsavingsupiscanandpayrecharge':
        'Kotak 811',
    'com.fss.indus': 'IndusInd',
    'com.fedmobile': 'FedMobile',
    'com.canarabank.mobility': 'Canara ai1',
    'com.sbicard.app': 'SBI Card',
    'com.uni.cards': 'Uni Cards',
  };

  static String? label(String package) => apps[package];
  static bool isPaymentApp(String package) => apps.containsKey(package);
}

class NotificationParser {
  final SmsParserEngine _sms = SmsParserEngine();

  static const _amt = r'(?:₹|rs\.?|inr)\s*(?<amount>[\d,]+(?:\.\d{1,2})?)';
  static const _name = r'(?<name>[^\n.,!]{2,50}?)';

  static final List<(RegExp, TxnDirection)> _patterns = [
    (
      RegExp(
        '(?:you\\s+)?(?:paid|sent)\\s+$_amt\\s+to\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|using|from|on)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.debit,
    ),
    (
      RegExp(
        '$_amt\\s+(?:paid|sent|deducted|debited)\\s+(?:to|for)\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|using|from|on)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.debit,
    ),
    (
      RegExp(
        '(?:payment of\\s+)?$_amt\\s+(?:to|at)\\s+$_name\\s+(?:was\\s+)?(?:successful|completed|done)',
        caseSensitive: false,
      ),
      TxnDirection.debit,
    ),
    (
      RegExp(
        '(?:received|got)\\s+$_amt\\s+from\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|in|on)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.credit,
    ),
    (
      RegExp(
        '$_amt\\s+(?:received|credited)\\s+from\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|in|on)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.credit,
    ),
    (
      RegExp('$_name\\s+(?:sent you|paid you)\\s+$_amt', caseSensitive: false),
      TxnDirection.credit,
    ),
    (
      RegExp(
        '(?:spent|paid)\\s+$_amt\\s+(?:at|for|on)\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|using|from|on|with)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.debit,
    ),
    (
      RegExp(
        '(?:successfully\\s+)?(?:paid|sent)\\s+$_amt\\s+(?:successfully\\s+)?to\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|using|from|on)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.debit,
    ),
    (
      RegExp(
        '$_amt\\s+(?:paid|sent)\\s+successfully\\s+to\\s+$_name(?=\\s*(?:\$|\\n|[.,!]|\\s+(?:via|using|from|on)\\b))',
        caseSensitive: false,
        multiLine: true,
      ),
      TxnDirection.debit,
    ),
    (
      RegExp(
        '(?:your\\s+)?payment of\\s+$_amt\\s+(?:to|at|for)\\s+$_name\\s+(?:was|is|has been)\\s+(?:successful|completed|done)',
        caseSensitive: false,
      ),
      TxnDirection.debit,
    ),
  ];

  static final _ignore = RegExp(
    r'\b(request(ed|ing)?|collect request|wants? (you to pay|money)|reminder|cashback (won|earned)|scratch card|reward|offer|bill (is )?due|due (on|in)|expires?|recharge (now|due)|pay now|otp)\b',
    caseSensitive: false,
  );

  /// Parses an app notification. Returns null for non-transaction content
  /// such as payment requests, rewards and reminders.
  ParsedTransaction? parse({
    required String packageName,
    required String title,
    required String text,
    required DateTime postedAt,
  }) {
    final combined = '$title\n$text'.trim();
    if (combined.isEmpty) return null;
    if (_ignore.hasMatch(combined)) return null;
    final appLabel = PaymentApps.label(packageName);

    for (final (re, dir) in _patterns) {
      final m = re.firstMatch(combined);
      if (m == null) continue;
      final amount = Money.parseToPaise(m.namedGroup('amount')!);
      if (amount == null || amount <= 0) continue;
      final name = FieldExtractors.cleanMerchant(m.namedGroup('name')!);
      final failed = FieldExtractors.isFailed(combined);
      var confidence = 55;
      if (appLabel != null) confidence += 10;
      if (name != null) confidence += 10;
      final ref = FieldExtractors.reference(combined);
      if (ref != null) confidence += 10;
      final suffixes = FieldExtractors.accountSuffixes(combined);
      return ParsedTransaction(
        amountPaise: amount,
        direction: dir,
        channel: TxnChannel.upi,
        status: failed ? TxnStatus.failed : TxnStatus.cleared,
        occurredAt: postedAt,
        bankName: appLabel,
        accountSuffix: suffixes.isNotEmpty ? suffixes.first : null,
        merchant: name,
        upiId: FieldExtractors.upiId(combined),
        reference: ref,
        isRefund: FieldExtractors.isRefund(combined),
        confidence: confidence,
        parserId: 'notif:${appLabel ?? packageName}',
      );
    }
    // Bank apps often mirror SMS wording; reuse the SMS engine.
    final viaSms = _sms
        .parse(sender: packageName, body: combined, receivedAt: postedAt)
        .transaction;
    if (viaSms == null) return null;
    return viaSms.copyWith(
      bankName: viaSms.bankName ?? appLabel,
      confidence: (viaSms.confidence + (appLabel != null ? 20 : 0)).clamp(
        0,
        100,
      ),
    );
  }
}
