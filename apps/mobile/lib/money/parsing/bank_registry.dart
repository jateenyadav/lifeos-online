/// Known Indian banks and how to recognise them from SMS sender IDs
/// (DLT headers such as "VM-HDFCBK") or from the message body.
library;

class BankProfile {
  final String id;
  final String name;
  final List<String> senderCodes;
  final RegExp bodyPattern;
  const BankProfile(this.id, this.name, this.senderCodes, this.bodyPattern);
}

class BankRegistry {
  BankRegistry._();

  static final List<BankProfile> banks = [
    BankProfile('hdfc', 'HDFC Bank', [
      'HDFCBK',
      'HDFCBN',
      'HDFCCC',
      'HDFC',
    ], RegExp(r'\bhdfc\b', caseSensitive: false)),
    BankProfile('sbi', 'SBI', [
      'SBIINB',
      'SBIUPI',
      'SBICRD',
      'CBSSBI',
      'ATMSBI',
      'SBIPSG',
      'SBMSMS',
      'SBI',
    ], RegExp(r'(\bsbi\b|state bank of india)', caseSensitive: false)),
    BankProfile('icici', 'ICICI Bank', [
      'ICICIB',
      'ICICIT',
      'ICICI',
    ], RegExp(r'\bicici\b', caseSensitive: false)),
    BankProfile('axis', 'Axis Bank', [
      'AXISBK',
      'AXISMR',
      'AXISBN',
      'AXIS',
    ], RegExp(r'\baxis\b', caseSensitive: false)),
    BankProfile('kotak', 'Kotak Bank', [
      'KOTAKB',
      'KOTAK',
      'KMBL',
    ], RegExp(r'\bkotak\b', caseSensitive: false)),
    BankProfile('pnb', 'PNB', [
      'PNBSMS',
      'PUNBNK',
      'PNBBNK',
      'PNB',
    ], RegExp(r'(\bpnb\b|punjab national)', caseSensitive: false)),
    BankProfile(
      'bob',
      'Bank of Baroda',
      ['BOBTXN', 'BOBSMS', 'BARODA', 'BOBCRD', 'BOB'],
      RegExp(r'(bank of baroda|\bbob\b)', caseSensitive: false),
    ),
    BankProfile('canara', 'Canara Bank', [
      'CANBNK',
      'CANARA',
    ], RegExp(r'\bcanara\b', caseSensitive: false)),
    BankProfile('union', 'Union Bank', [
      'UNIONB',
      'UBOI',
    ], RegExp(r'union bank', caseSensitive: false)),
    BankProfile('idfc', 'IDFC FIRST Bank', [
      'IDFCFB',
      'IDFCBK',
    ], RegExp(r'\bidfc\b', caseSensitive: false)),
    BankProfile('yes', 'Yes Bank', [
      'YESBNK',
      'YESBK',
    ], RegExp(r'\byes bank\b', caseSensitive: false)),
    BankProfile('indusind', 'IndusInd Bank', [
      'INDUSB',
      'INDUSL',
    ], RegExp(r'\bindusind\b', caseSensitive: false)),
    BankProfile('federal', 'Federal Bank', [
      'FEDBNK',
      'FEDFIB',
    ], RegExp(r'federal bank', caseSensitive: false)),
    BankProfile('idbi', 'IDBI Bank', [
      'IDBIBK',
      'IDBI',
    ], RegExp(r'\bidbi\b', caseSensitive: false)),
    BankProfile('indian', 'Indian Bank', [
      'INDBNK',
      'INDIAN',
    ], RegExp(r'\bindian bank\b', caseSensitive: false)),
    BankProfile('boi', 'Bank of India', [
      'BOIIND',
      'BOISMS',
    ], RegExp(r'bank of india', caseSensitive: false)),
    BankProfile(
      'paytm',
      'Paytm Payments Bank',
      ['PAYTMB', 'PYTMBK'],
      RegExp(r'paytm payments bank', caseSensitive: false),
    ),
    BankProfile(
      'au',
      'AU Small Finance Bank',
      ['AUBANK', 'AUSFBL'],
      RegExp(r'\bau (small finance )?bank\b', caseSensitive: false),
    ),
  ];

  /// Normalises a DLT sender like "VM-HDFCBK-S" -> "HDFCBK".
  static String normaliseSender(String sender) {
    var s = sender.toUpperCase().trim();
    final parts = s.split('-');
    if (parts.length >= 2 && parts[0].length == 2) {
      s = parts[1];
    } else if (parts.length >= 2) {
      s = parts.first;
    }
    return s;
  }

  static BankProfile? fromSender(String sender) {
    final code = normaliseSender(sender);
    if (code.isEmpty || RegExp(r'^\+?\d+$').hasMatch(code)) return null;
    for (final b in banks) {
      for (final c in b.senderCodes) {
        if (code == c || (c.length >= 5 && code.startsWith(c))) return b;
      }
    }
    for (final b in banks) {
      for (final c in b.senderCodes) {
        if (c.length >= 4 && code.contains(c)) return b;
      }
    }
    return null;
  }

  static BankProfile? fromBody(String body) {
    for (final b in banks) {
      if (b.bodyPattern.hasMatch(body)) return b;
    }
    return null;
  }

  static BankProfile? byId(String id) {
    for (final b in banks) {
      if (b.id == id) return b;
    }
    return null;
  }

  /// True when the sender looks like a business/DLT header instead of a
  /// personal phone number (personal numbers are never banks).
  static bool isBusinessSender(String sender) {
    final s = sender.trim();
    return !RegExp(r'^\+?\d{10,13}$').hasMatch(s);
  }
}
