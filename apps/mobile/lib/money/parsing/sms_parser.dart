import '../core/money.dart';
import '../models.dart';
import 'bank_registry.dart';
import 'date_extractor.dart';
import 'field_extractors.dart';
import 'message_classifier.dart';

/// Result of running a message through the engine.
class SmsParseOutcome {
  final ClassificationResult classification;
  final ParsedTransaction? transaction;
  const SmsParseOutcome(this.classification, this.transaction);
  bool get isTransaction => transaction != null;
}

/// A bank-specific parser. Patterns use named groups:
/// amount, acct, merchant, ref, upi, date. Missing groups are filled in by
/// the generic extractors.
class BankSmsParser {
  final String bankId;
  final List<BankPattern> patterns;
  const BankSmsParser(this.bankId, this.patterns);
}

class BankPattern {
  final RegExp regex;
  final TxnDirection direction;
  final TxnChannel? channel;
  const BankPattern(this.regex, this.direction, {this.channel});
}

RegExp _r(String p) => RegExp(p, caseSensitive: false, multiLine: true);

const _amt = r'(?:rs\.?|inr|₹)?\s*(?<amount>[\d,]+(?:\.\d{1,2})?)';
const _acct = r'[x*.]*(?<acct>\d{3,6})';
const _ref = r'(?<ref>\d{9,16})';
const _name = r'(?<merchant>[^\n.;]{2,60}?)';

/// Bank-specific formats observed in the wild. Order matters: first match
/// wins within a bank.
final List<BankSmsParser> bankParsers = [
  BankSmsParser('hdfc', [
    BankPattern(
      _r(
        'sent\\s+$_amt\\s*\\n?\\s*from hdfc bank a\\/c\\s*$_acct\\s*\\n?\\s*to\\s+$_name\\s*\\n',
      ),
      TxnDirection.debit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        '$_amt\\s+credited to hdfc bank a\\/c\\s*$_acct.*?by (?:vpa )?(?<upi>[\\w.\\-]+@[a-z]+)?\\s*(?:$_name)?\\s*\\(upi\\s*$_ref\\)',
      ),
      TxnDirection.credit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        'spent\\s+$_amt\\s+on hdfc bank (?:credit |debit )?card\\s*$_acct\\s+at\\s+$_name\\s+on',
      ),
      TxnDirection.debit,
      channel: TxnChannel.card,
    ),
    BankPattern(
      _r('$_amt\\s+deposited in hdfc bank a\\/c\\s*$_acct'),
      TxnDirection.credit,
    ),
    BankPattern(
      _r('$_amt\\s+debited from (?:hdfc bank )?a\\/c\\s*$_acct'),
      TxnDirection.debit,
    ),
  ]),
  BankSmsParser('sbi', [
    BankPattern(
      _r(
        'a\\/c\\s*$_acct\\s+debited by\\s+$_amt\\s+on date\\s+\\S+\\s+trf to\\s+$_name\\s+ref\\s*no\\s*$_ref',
      ),
      TxnDirection.debit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        'a\\/c\\s*$_acct-?\\s*credited by\\s+$_amt\\s+on\\s+\\S+\\s+transfer from\\s+$_name\\s+ref\\s*no\\s*$_ref',
      ),
      TxnDirection.credit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        'a\\/c\\s*$_acct\\s+(?:has been\\s+)?debited (?:by|for|with)\\s+$_amt',
      ),
      TxnDirection.debit,
    ),
    BankPattern(
      _r(
        'a\\/c\\s*$_acct\\s*-?\\s*(?:has been\\s+)?credited (?:by|with)\\s+$_amt',
      ),
      TxnDirection.credit,
    ),
  ]),
  BankSmsParser('icici', [
    BankPattern(
      _r(
        'acct\\s*$_acct\\s+debited for\\s+$_amt\\s+on\\s+\\S+;\\s*$_name\\s+credited\\.\\s*upi:?\\s*$_ref',
      ),
      TxnDirection.debit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        'acct\\s*$_acct\\s+is credited with\\s+$_amt\\s+on\\s+\\S+\\s+from\\s+$_name\\.\\s*upi:?\\s*$_ref',
      ),
      TxnDirection.credit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        '$_amt\\s+spent (?:using|on) icici bank card\\s*$_acct\\s+on\\s+\\S+\\s+(?:on|at)\\s+$_name\\.',
      ),
      TxnDirection.debit,
      channel: TxnChannel.card,
    ),
  ]),
  BankSmsParser('axis', [
    BankPattern(
      _r(
        '$_amt\\s+debited\\s*\\n?\\s*a\\/c no\\.\\s*$_acct[\\s\\S]*?upi\\/p2[am]\\/$_ref\\/$_name\\s*(?:\\n|\$)',
      ),
      TxnDirection.debit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        '$_amt\\s+credited\\s*\\n?\\s*a\\/c no\\.\\s*$_acct[\\s\\S]*?upi\\/p2[am]\\/$_ref\\/$_name\\s*(?:\\n|\$)',
      ),
      TxnDirection.credit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r('$_amt\\s+debited\\s*\\n?\\s*a\\/c no\\.\\s*$_acct'),
      TxnDirection.debit,
    ),
    BankPattern(
      _r('$_amt\\s+credited\\s*\\n?\\s*a\\/c no\\.\\s*$_acct'),
      TxnDirection.credit,
    ),
  ]),
  BankSmsParser('kotak', [
    BankPattern(
      _r(
        'sent\\s+$_amt\\s+from kotak bank ac\\s*$_acct\\s+to\\s+(?<upi>[\\w.\\-]+@[a-z]+)\\s+on\\s+\\S+?\\.?\\s*upi ref:?\\s*$_ref',
      ),
      TxnDirection.debit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        'received\\s+$_amt\\s+in your kotak bank ac\\s*$_acct\\s+from\\s+(?<upi>[\\w.\\-]+@[a-z]+)\\s+on\\s+\\S+?\\.?\\s*upi ref:?\\s*$_ref',
      ),
      TxnDirection.credit,
      channel: TxnChannel.upi,
    ),
  ]),
  BankSmsParser('pnb', [
    BankPattern(
      _r('a\\/c\\s*$_acct\\s+debited\\s+$_amt\\s+dt\\s+(?<date>\\S+)'),
      TxnDirection.debit,
    ),
    BankPattern(
      _r('a\\/c\\s*$_acct\\s+credited\\s+$_amt\\s+dt\\s+(?<date>\\S+)'),
      TxnDirection.credit,
    ),
  ]),
  BankSmsParser('bob', [
    BankPattern(
      _r('$_amt\\s+transferred from a\\/c\\s*$_acct\\s+to:?\\s*upi\\/$_ref'),
      TxnDirection.debit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r(
        '$_amt\\s+credited to a\\/c\\s*$_acct\\s+thru upi\\/$_ref\\s+by\\s+(?<upi>[\\w.\\-]+@[a-z]+)',
      ),
      TxnDirection.credit,
      channel: TxnChannel.upi,
    ),
    BankPattern(
      _r('$_amt\\s+(?:dr\\.?|debited) (?:from|to) a\\/c\\s*$_acct'),
      TxnDirection.debit,
    ),
  ]),
];

/// The SMS parsing engine: classifier -> bank-specific parser -> generic
/// fallback -> confidence scoring.
class SmsParserEngine {
  final MessageClassifier _classifier = MessageClassifier();

  SmsParseOutcome parse({
    required String sender,
    required String body,
    required DateTime receivedAt,
  }) {
    final cls = _classifier.classify(sender, body);
    if (cls.kind != MessageClass.transaction) return SmsParseOutcome(cls, null);

    final bankBySender = BankRegistry.fromSender(sender);
    final bank = bankBySender ?? BankRegistry.fromBody(body);

    ParsedTransaction? txn;
    if (bank != null) {
      txn = _parseWithBank(
        bank,
        body,
        receivedAt,
        senderKnown: bankBySender != null,
        sender: sender,
      );
    }
    txn ??= _parseGeneric(
      bank,
      body,
      receivedAt,
      senderKnown: bankBySender != null,
      sender: sender,
    );
    if (txn == null) {
      return const SmsParseOutcome(
        ClassificationResult(MessageClass.unknown, 'no amount/direction'),
        null,
      );
    }
    return SmsParseOutcome(cls, txn);
  }

  ParsedTransaction? _parseWithBank(
    BankProfile bank,
    String body,
    DateTime receivedAt, {
    required bool senderKnown,
    required String sender,
  }) {
    for (final parser in bankParsers.where((p) => p.bankId == bank.id)) {
      for (final pattern in parser.patterns) {
        final m = pattern.regex.firstMatch(body);
        if (m == null) continue;
        String? g(String name) {
          try {
            return m.namedGroup(name);
          } catch (_) {
            return null;
          }
        }

        final amount = g('amount') != null
            ? Money.parseToPaise(g('amount')!)
            : null;
        if (amount == null || amount <= 0) continue;
        return _assemble(
          body: body,
          receivedAt: receivedAt,
          bank: bank,
          amount: amount,
          direction: pattern.direction,
          channel: pattern.channel,
          acct: g('acct'),
          merchant: g('merchant') != null
              ? FieldExtractors.cleanMerchant(g('merchant')!)
              : null,
          ref: g('ref'),
          upi: g('upi'),
          dateText: g('date'),
          parserId: 'bank:${bank.id}',
          bankPatternMatched: true,
          senderKnown: senderKnown,
          sender: sender,
        );
      }
    }
    return null;
  }

  ParsedTransaction? _parseGeneric(
    BankProfile? bank,
    String body,
    DateTime receivedAt, {
    required bool senderKnown,
    required String sender,
  }) {
    final amount = FieldExtractors.amount(body);
    final direction = FieldExtractors.direction(body);
    if (amount == null || direction == null) return null;
    return _assemble(
      body: body,
      receivedAt: receivedAt,
      bank: bank,
      amount: amount,
      direction: direction,
      channel: null,
      acct: null,
      merchant: null,
      ref: null,
      upi: null,
      dateText: null,
      parserId: bank == null ? 'generic' : 'generic:${bank.id}',
      bankPatternMatched: false,
      senderKnown: senderKnown,
      sender: sender,
    );
  }

  ParsedTransaction _assemble({
    required String body,
    required DateTime receivedAt,
    required BankProfile? bank,
    required int amount,
    required TxnDirection direction,
    required TxnChannel? channel,
    required String? acct,
    required String? merchant,
    required String? ref,
    required String? upi,
    required String? dateText,
    required String parserId,
    required bool bankPatternMatched,
    required bool senderKnown,
    required String sender,
  }) {
    final suffixes = FieldExtractors.accountSuffixes(body);
    var accountSuffix = acct != null
        ? _last4(acct)
        : (suffixes.isNotEmpty ? suffixes.first : null);
    final counterparty = suffixes.where((s) => s != accountSuffix).firstOrNull;
    ref ??= FieldExtractors.reference(body);
    upi ??= FieldExtractors.upiId(body);
    merchant ??= FieldExtractors.merchant(body);
    // Never use our own account phrase or the bank name as merchant.
    if (merchant != null &&
        bank != null &&
        bank.bodyPattern.hasMatch(merchant) &&
        merchant.toLowerCase().contains('bank')) {
      merchant = null;
    }
    if (merchant == null && upi != null) merchant = upi;

    final refund = FieldExtractors.isRefund(body);
    final effectiveDirection = refund ? TxnDirection.credit : direction;
    final status = FieldExtractors.isFailed(body)
        ? TxnStatus.failed
        : (FieldExtractors.isPending(body)
              ? TxnStatus.pending
              : TxnStatus.cleared);

    // Prefer the precise SMS timestamp unless the body clearly refers to a
    // different day (delayed delivery / historical import).
    DateTime occurredAt = receivedAt;
    final parsedDate = DateExtractor.extract(
      dateText ?? body,
      reference: receivedAt,
    );
    if (parsedDate != null) {
      final sameDay =
          parsedDate.year == receivedAt.year &&
          parsedDate.month == receivedAt.month &&
          parsedDate.day == receivedAt.day;
      if (!sameDay) {
        occurredAt = DateExtractor.hasTime(dateText ?? body)
            ? parsedDate
            : DateTime(
                parsedDate.year,
                parsedDate.month,
                parsedDate.day,
                receivedAt.hour,
                receivedAt.minute,
              );
      }
    }

    var confidence = 40; // amount + direction
    if (bank != null) confidence += 10;
    if (senderKnown) confidence += 10;
    if (accountSuffix != null) confidence += 15;
    if (ref != null) confidence += 10;
    if (merchant != null) confidence += 5;
    if (bankPatternMatched) confidence += 15;
    if (!BankRegistry.isBusinessSender(sender)) confidence -= 20;
    confidence = confidence.clamp(0, 100);

    return ParsedTransaction(
      amountPaise: amount,
      direction: effectiveDirection,
      channel: channel ?? FieldExtractors.channel(body),
      status: status,
      occurredAt: occurredAt,
      bankName: bank?.name,
      accountSuffix: accountSuffix,
      merchant: merchant,
      upiId: upi,
      reference: ref,
      availableBalancePaise: FieldExtractors.availableBalance(body),
      isRefund: refund,
      counterpartySuffix: counterparty,
      mentionsSelfTransfer: FieldExtractors.mentionsSelf(body),
      confidence: confidence,
      parserId: parserId,
    );
  }

  static String _last4(String s) =>
      s.length > 4 ? s.substring(s.length - 4) : s;
}
