/// Money sent to / received from people (friends, family), as opposed to
/// shops. Decides when to ask "Does Rahul owe you?" and what each answer means.
library;

enum PeerAnswer {
  /// I paid for them / lent it: they owe me the full amount.
  lent,

  /// I paid the whole bill; they owe me their share.
  split,

  /// I was paying back money I owed them.
  repaid,

  /// They gave me money that I now owe back.
  borrowed,

  /// They were paying me back.
  gotBack,

  /// Normal payment / gift: counts as my own spending or income.
  personal,

  /// Paid with someone else's card or money (e.g. an add-on card on my
  /// brother's account): it is my spending, and I owe them the amount.
  owedToOwner,

  /// "Just leave it": no khata entry, counts as my own spending / income, and
  /// kept in the separate "Left" list so it can be decided later.
  left,
}

extension PeerAnswerX on PeerAnswer {
  String get tag => switch (this) {
    PeerAnswer.lent => 'lent',
    PeerAnswer.split => 'split',
    PeerAnswer.repaid => 'repaid',
    PeerAnswer.borrowed => 'borrowed',
    PeerAnswer.gotBack => 'got_back',
    PeerAnswer.personal => 'personal',
    PeerAnswer.owedToOwner => 'owe_owner',
    PeerAnswer.left => 'left',
  };

  static PeerAnswer? fromTag(String? t) {
    for (final a in PeerAnswer.values) {
      if (a.tag == t) return a;
    }
    return null;
  }

  /// True when the money moved out of my account.
  bool get isOutgoing =>
      this == PeerAnswer.lent ||
      this == PeerAnswer.split ||
      this == PeerAnswer.repaid ||
      this == PeerAnswer.owedToOwner;
}

class PeerOutcome {
  /// Khata direction: 'gave' (I gave money) or 'got' (I received money). Null = no khata entry.
  final String? khataDirection;

  /// Amount written to the khata.
  final int khataPaise;

  /// Part of the transaction excluded from my income/expense.
  final int peerSharePaise;
  const PeerOutcome(this.khataDirection, this.khataPaise, this.peerSharePaise);
}

class PeerRules {
  PeerRules._();

  static final _business = RegExp(
    r'\b(store|stores|shop|mart|kitchen|restaurant|cafe|caf[eé]|hotel|foods?|bakery|sweets|dhaba|medical|medicals|pharma|pharmacy|chemist|hospital|clinic|pvt|private|ltd|limited|llp|inc|enterprises?|traders?|trading|services?|solutions?|technologies|tech|retail|industries|agency|agencies|company|co\b|corp|motors|petrol|fuel|filling|station|electricals?|electronics|mobiles?|garments?|fashion|textiles?|salon|parlour|gym|fitness|travels?|tours|cabs?|taxi|school|college|academy|institute|classes|tuition|society|apartments?|rent|bank|finance|insurance|recharge|bill|bills|payments?|pay|wallet|merchant|zomato|swiggy|amazon|flipkart|blinkit|zepto|uber|ola|rapido|irctc|jio|airtel|vodafone|vi|bsnl|paytm|phonepe|google|cred|myntra|ajio|nykaa|bigbasket|dmart|reliance|tata|bescom|electricity|gas|water|broadband|dth|netflix|spotify|hotstar|prime|youtube|apple|microsoft)\b',
    caseSensitive: false,
  );

  /// Personal UPI handles: phone numbers or name-like ids on personal PSP handles.
  static final _phoneUpi = RegExp(r'^[6-9]\d{9}(-\d)?@', caseSensitive: false);
  static final _merchantUpi = RegExp(
    r'(^(paytm|bharatpe|q\d|mab|gpay-|pay|merchant|razorpay|cf\.|rzp|billdesk|payu|ccavenue|juspay|bqr)|@(paytm|pty|ptybl|ptys|ptyes|ptaxis|bharatpe|mairtel|axisbank|hdfcbank|icici)$)',
    caseSensitive: false,
  );

  /// True when [name]/[upiId] looks like a private person rather than a shop.
  /// [knownContact] wins: if the user already has a khata contact with this name.
  static bool looksLikePerson(
    String? name, {
    String? upiId,
    bool knownContact = false,
  }) {
    if (knownContact) return true;
    final upi = upiId?.trim() ?? '';
    if (upi.isNotEmpty && _merchantUpi.hasMatch(upi)) return false;
    final n = (name ?? '').trim();
    if (n.isEmpty || n.contains('@')) {
      return upi.isNotEmpty && _phoneUpi.hasMatch(upi);
    }
    if (_business.hasMatch(n)) return false;
    if (RegExp(r'\d').hasMatch(n)) return false;
    final words = n.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty || words.length > 4) return false;
    // Personal names: letters only, each word 2..15 chars ("Rahul", "Priya Singh", "MR RAHUL K").
    final alpha = words.every((w) => RegExp(r"^[A-Za-z.']{1,15}$").hasMatch(w));
    if (!alpha) return false;
    if (_phoneUpi.hasMatch(upi)) return true;
    return words.length >= 2 || words.first.length >= 3;
  }

  /// What a [answer] means for a payment of [amountPaise].
  /// For [PeerAnswer.split], [people] is the total number of people sharing
  /// the bill including me (≥ 2); the others owe me their shares.
  /// [credit] = money came in (only matters for [PeerAnswer.owedToOwner]:
  /// a refund on their card means I owe them less).
  static PeerOutcome outcome(
    PeerAnswer answer,
    int amountPaise, {
    int people = 2,
    bool credit = false,
  }) {
    switch (answer) {
      case PeerAnswer.lent:
      case PeerAnswer.repaid:
        return PeerOutcome('gave', amountPaise, amountPaise);
      case PeerAnswer.split:
        final n = people < 2 ? 2 : people;
        final mine = amountPaise ~/ n;
        final others = amountPaise - mine;
        return PeerOutcome('gave', others, others);
      case PeerAnswer.borrowed:
      case PeerAnswer.gotBack:
        return PeerOutcome('got', amountPaise, amountPaise);
      case PeerAnswer.personal:
      case PeerAnswer.left:
        return const PeerOutcome(null, 0, 0);
      case PeerAnswer.owedToOwner:
        // Still my own spending (share 0); the khata records the debt.
        return PeerOutcome(credit ? 'gave' : 'got', amountPaise, 0);
    }
  }

  /// Cleans a payee label for use as a contact name ("MR RAHUL KUMAR" → "Rahul Kumar").
  static String contactName(String raw) {
    var s = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
    s = s.replaceFirst(
      RegExp(r'^(mr|mrs|ms|miss|shri|smt|dr)\.?\s+', caseSensitive: false),
      '',
    );
    if (s == s.toUpperCase() || s == s.toLowerCase()) {
      s = s
          .split(' ')
          .map(
            (w) => w.isEmpty
                ? w
                : w[0].toUpperCase() + w.substring(1).toLowerCase(),
          )
          .join(' ');
    }
    return s.length > 80 ? s.substring(0, 80) : s;
  }
}
