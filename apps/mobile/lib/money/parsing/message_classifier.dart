import '../models.dart';

/// Decides whether a message is a completed financial transaction, an OTP,
/// a promotion or an informational notice. Runs before field extraction so
/// OTPs/promotions are never turned into transactions.
class MessageClassifier {
  static final _otp = RegExp(
    r'\b(otp|one[\s-]?time[\s-]?pass(word|code)?|verification code|security code|auth(entication)? code|login code)\b',
    caseSensitive: false,
  );
  static final _otpStrong = RegExp(
    r'(\b\d{4,8}\b[^.\n]{0,30}\b(is|as)\s+(your|the)\s+(otp|one[\s-]?time|verification|code))|((otp|code)\s*(is|:)\s*\d{4,8})|(otp\s+for\b)|(use\s+\d{4,8}\b)',
    caseSensitive: false,
  );
  static final _completedVerb = RegExp(
    r'\b(debited|credited|spent|sent|received|withdrawn|deposited|transferred|paid|purchase(d)?|refunded|reversed|used for|used at|dr\.?|cr\.?|(was|is|has been) successful|successfully)\b',
    caseSensitive: false,
  );
  static final _futureOrModal = RegExp(
    r'\b(will be|can be|to be|could be|shall be|may be|would be|get)\s+(debited|credited|transferred|paid|refunded)\b',
    caseSensitive: false,
  );
  static final _amount = RegExp(
    r'((rs\.?|inr|₹)\s*:?\s*[\d,]+(\.\d{1,2})?)|((debited|credited)\s+(by|with|for)?\s*[\d,]+(\.\d{1,2})?)',
    caseSensitive: false,
  );
  static final _promo = RegExp(
    r'\b(offer|offers|cashback (of )?up\s?to|upto|win|won|congratulations|congrats|pre-?approved|apply now|apply|click|limited period|hurry|instant loan|personal loan|loan|eligible|avail|discount|% off|voucher|coupon|exclusive|lowest|emi starting|free|gift|claim|lucky|reward points (will )?expire|upgrade now|insurance|policy|invest|mutual fund|sip)\b',
    caseSensitive: false,
  );
  static final _link = RegExp(
    r'(https?://|www\.|bit\.ly)',
    caseSensitive: false,
  );
  static final _informational = RegExp(
    r'\b(due on|due date|minimum amount due|min amt due|total amt due|statement (is )?generated|statement for|bill (of|for|is)|outstanding|cheque book|standing instruction|e-?mandate|autopay (is )?(set|registered|scheduled)|will be auto[- ]?debited|kyc|is due|payment reminder|balance is|avl bal is|available balance is)\b',
    caseSensitive: false,
  );
  static final _acct = RegExp(
    r'\b(a\/c|acct|account|ac|card)\b\s*(no\.?|number|ending)?\s*[:\-]?\s*[x*.\s]*\d{3,6}',
    caseSensitive: false,
  );

  ClassificationResult classify(String sender, String body) {
    final text = body.trim();
    if (text.isEmpty) {
      return const ClassificationResult(MessageClass.unknown, 'empty');
    }
    final hasAmount = _amount.hasMatch(text);
    final hasAcct = _acct.hasMatch(text);
    final verbMatches = _completedVerb.allMatches(text).toList();
    final futureMatches = _futureOrModal.allMatches(text).toList();
    // Completed verbs that are not part of a future/modal phrase.
    final completedVerbs = verbMatches.where((v) {
      for (final f in futureMatches) {
        if (v.start >= f.start && v.end <= f.end) return false;
      }
      return true;
    }).toList();
    final hasCompletedVerb = completedVerbs.isNotEmpty;

    // 1. OTP.
    if (_otpStrong.hasMatch(text)) {
      return const ClassificationResult(MessageClass.otp, 'otp code pattern');
    }
    if (_otp.hasMatch(text) && !hasCompletedVerb) {
      return const ClassificationResult(MessageClass.otp, 'otp keyword');
    }

    // 2. Promotions.
    final promoHits = _promo.allMatches(text).length;
    final hasLink = _link.hasMatch(text);
    if (!hasAcct && (promoHits >= 2 || (promoHits >= 1 && hasLink))) {
      return ClassificationResult(
        MessageClass.promotional,
        'promo signals=$promoHits link=$hasLink',
      );
    }
    if (!hasCompletedVerb && promoHits >= 1) {
      return const ClassificationResult(
        MessageClass.promotional,
        'promo without completed transaction',
      );
    }

    // 3. Informational (bill reminders, mandates, balance enquiries).
    if (_informational.hasMatch(text) && !_strongCompleted(text)) {
      return const ClassificationResult(
        MessageClass.informational,
        'reminder/notice',
      );
    }

    if (hasAmount && hasCompletedVerb) {
      return const ClassificationResult(
        MessageClass.transaction,
        'amount+verb',
      );
    }
    if (hasAmount && futureMatches.isNotEmpty) {
      return const ClassificationResult(
        MessageClass.informational,
        'future/modal transaction',
      );
    }
    return const ClassificationResult(
      MessageClass.unknown,
      'no transaction signal',
    );
  }

  static final _strong = RegExp(
    r'\b(debited|credited|spent|withdrawn|deposited|refunded)\b',
    caseSensitive: false,
  );
  bool _strongCompleted(String text) {
    if (!_strong.hasMatch(text)) return false;
    return !_futureOrModal.hasMatch(text);
  }
}
