import '../merchant/merchant_matcher.dart';
import '../models.dart';

/// Minimal view of a transaction used by the pure financial algorithms.
/// Mapped from database rows so the logic is unit-testable without a DB.
class LedgerEntry {
  final int id;
  final int? accountId;
  final int amountPaise; // always positive
  final TxnDirection direction;
  final TxnStatus status;
  final TxnSource source;
  final DateTime occurredAt;
  final bool isTransfer;

  /// Already paired with its counterpart (has a transfer group).
  final bool isLinkedTransfer;
  final bool isRefund;
  final String? reference;
  final String? merchant;
  final String? accountSuffix;
  final String? counterpartySuffix;
  final int? categoryId;
  final bool hasSmsSource;
  final bool hasNotificationSource;

  /// Portion that belongs to a friend (lent / split share / repayment).
  final int peerPaise;

  /// Amount that counts as your own income/expense.
  int get ownPaise => (amountPaise - peerPaise).clamp(0, amountPaise);

  const LedgerEntry({
    required this.id,
    required this.accountId,
    required this.amountPaise,
    required this.direction,
    this.status = TxnStatus.cleared,
    this.source = TxnSource.manual,
    required this.occurredAt,
    this.isTransfer = false,
    this.isLinkedTransfer = false,
    this.isRefund = false,
    this.reference,
    this.merchant,
    this.accountSuffix,
    this.counterpartySuffix,
    this.categoryId,
    this.hasSmsSource = false,
    this.hasNotificationSource = false,
    this.peerPaise = 0,
  });

  int get signed =>
      direction == TxnDirection.credit ? amountPaise : -amountPaise;
  bool get countsInBalance => status == TxnStatus.cleared;
}

class BalanceCalculator {
  BalanceCalculator._();

  /// Current balance = opening + cleared credits - cleared debits.
  /// Pending, failed and reversed transactions never affect the balance.
  /// Transfers DO affect individual account balances (money really moved).
  static int balance(int openingPaise, Iterable<LedgerEntry> entries) {
    var total = openingPaise;
    for (final e in entries) {
      if (e.countsInBalance) total += e.signed;
    }
    return total;
  }

  static int pendingDelta(Iterable<LedgerEntry> entries) {
    var total = 0;
    for (final e in entries) {
      if (e.status == TxnStatus.pending) total += e.signed;
    }
    return total;
  }

  /// Net worth across accounts: simple sum of ledger balances. Credit card
  /// balances are negative (outstanding), so limits are never counted, and
  /// self-transfers cancel out (debit in one account, credit in another).
  static int netWorth(Iterable<int> accountBalances) =>
      accountBalances.fold(0, (a, b) => a + b);
}

class PeriodTotals {
  final int incomePaise;
  final int expensePaise;
  final int refundPaise;
  final int transferPaise;
  const PeriodTotals(
    this.incomePaise,
    this.expensePaise,
    this.refundPaise,
    this.transferPaise,
  );
  int get netPaise => incomePaise - expensePaise;
}

class PeriodCalculator {
  PeriodCalculator._();

  /// Income = cleared non-transfer, non-refund credits.
  /// Expense = cleared non-transfer debits minus refunds.
  /// Transfers are reported separately and never inflate either figure.
  static PeriodTotals totals(Iterable<LedgerEntry> entries) {
    var income = 0, expense = 0, refunds = 0, transfers = 0;
    for (final e in entries) {
      if (!e.countsInBalance) continue;
      if (e.isTransfer) {
        if (e.direction == TxnDirection.debit) transfers += e.amountPaise;
        continue;
      }
      if (e.direction == TxnDirection.credit) {
        if (e.isRefund) {
          refunds += e.ownPaise;
        } else {
          income += e.ownPaise;
        }
      } else {
        expense += e.ownPaise;
      }
    }
    final netExpense = expense - refunds;
    return PeriodTotals(
      income,
      netExpense < 0 ? 0 : netExpense,
      refunds,
      transfers,
    );
  }
}

enum DuplicateKind { none, exact, crossSourceSame, possible }

class DuplicateVerdict {
  final DuplicateKind kind;
  final LedgerEntry? match;
  final String reason;
  const DuplicateVerdict(this.kind, this.match, this.reason);
  static const none = DuplicateVerdict(DuplicateKind.none, null, '');
}

/// Duplicate detection. Only exact matches (same reference, or the same
/// payment seen via a different channel) are merged; weak matches are kept
/// and flagged for review so a valid transaction is never silently dropped.
class DuplicateDetector {
  final Duration crossSourceWindow;
  final Duration weakWindow;
  const DuplicateDetector({
    this.crossSourceWindow = const Duration(minutes: 10),
    this.weakWindow = const Duration(minutes: 30),
  });

  DuplicateVerdict check({
    required int amountPaise,
    required TxnDirection direction,
    required DateTime occurredAt,
    required TxnSource source,
    String? reference,
    String? accountSuffix,
    String? merchant,
    required Iterable<LedgerEntry> existing,
  }) {
    LedgerEntry? possible;
    for (final e in existing) {
      if (e.amountPaise != amountPaise || e.direction != direction) continue;
      final diff = e.occurredAt.difference(occurredAt).abs();

      // 1. Same bank reference = same transaction (any time window).
      if (reference != null &&
          e.reference != null &&
          _normRef(reference) == _normRef(e.reference!)) {
        if (accountSuffix == null ||
            e.accountSuffix == null ||
            accountSuffix == e.accountSuffix) {
          return DuplicateVerdict(DuplicateKind.exact, e, 'same reference');
        }
      }
      // Both have different refs -> definitely different transactions.
      final bothHaveDifferentRefs =
          reference != null &&
          e.reference != null &&
          _normRef(reference) != _normRef(e.reference!);
      if (bothHaveDifferentRefs) continue;

      // 2. Same payment arriving via SMS and via app notification.
      final crossSource =
          (source == TxnSource.notification &&
              !e.hasNotificationSource &&
              e.hasSmsSource) ||
          (source == TxnSource.sms &&
              !e.hasSmsSource &&
              e.hasNotificationSource);
      if (crossSource && diff <= crossSourceWindow) {
        final merchantOk =
            merchant == null ||
            e.merchant == null ||
            MerchantMatcher.similarity(
                  MerchantNormalizer.normalize(merchant),
                  MerchantNormalizer.normalize(e.merchant!),
                ) >=
                60 ||
            _upiUserMatches(merchant, e.merchant!);
        final acctOk =
            accountSuffix == null ||
            e.accountSuffix == null ||
            accountSuffix == e.accountSuffix;
        if (merchantOk && acctOk) {
          return DuplicateVerdict(
            DuplicateKind.crossSourceSame,
            e,
            'same payment via ${e.source.name} and ${source.name}',
          );
        }
      }

      // 3. Same source, same amount, same account, close in time, no refs to
      // disambiguate -> possible duplicate (kept, flagged for review).
      final acctSame =
          accountSuffix != null && accountSuffix == e.accountSuffix;
      if (diff <= weakWindow &&
          (acctSame || accountSuffix == null || e.accountSuffix == null)) {
        possible ??= e;
      }
    }
    if (possible != null) {
      return DuplicateVerdict(
        DuplicateKind.possible,
        possible,
        'same amount close in time',
      );
    }
    return DuplicateVerdict.none;
  }

  static String _normRef(String r) =>
      r.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

  static bool _upiUserMatches(String a, String b) {
    String user(String s) =>
        s.contains('@') ? s.split('@').first.toLowerCase() : s.toLowerCase();
    return user(a).replaceAll(RegExp(r'[^a-z]'), '') ==
        user(b).replaceAll(RegExp(r'[^a-z]'), '');
  }
}

class OwnedAccount {
  final int id;
  final String? suffix;
  final String bankName;
  const OwnedAccount(this.id, this.suffix, this.bankName);
}

class TransferMatch {
  final LedgerEntry counterpart;
  final int score;
  final List<String> reasons;
  const TransferMatch(this.counterpart, this.score, this.reasons);

  /// Linked automatically only when evidence is strong.
  bool get autoLink => score >= 80;
}

/// Self-transfer detection between the user's own accounts.
///
/// Signals: equal amount, opposite direction, different own accounts, close
/// timestamps, shared UTR/reference, the debit message naming the other
/// account's suffix, explicit "self" wording. Amount + time alone is never
/// enough for an automatic link (could be a genuine payment to a friend
/// followed by an unrelated credit).
class SelfTransferMatcher {
  final Duration window;
  const SelfTransferMatcher({this.window = const Duration(hours: 2)});

  TransferMatch? findCounterpart({
    required LedgerEntry entry,
    required Iterable<LedgerEntry> candidates,
    required List<OwnedAccount> ownedAccounts,
    String? userDisplayName,
  }) {
    if (entry.accountId == null) return null;
    final ownedSuffixes = ownedAccounts
        .map((a) => a.suffix)
        .whereType<String>()
        .toSet();
    TransferMatch? best;
    for (final c in candidates) {
      if (c.id == entry.id || c.isLinkedTransfer) continue;
      if (c.accountId == null || c.accountId == entry.accountId) continue;
      if (c.amountPaise != entry.amountPaise ||
          c.direction == entry.direction) {
        continue;
      }
      if (c.status == TxnStatus.failed || c.status == TxnStatus.reversed) {
        continue;
      }
      final diff = c.occurredAt.difference(entry.occurredAt).abs();
      if (diff > window) continue;

      var score = 30; // amount + opposite direction + two own accounts
      final reasons = <String>['same amount, opposite direction'];
      if (diff <= const Duration(minutes: 10)) {
        score += 20;
        reasons.add('within 10 min');
      } else if (diff <= const Duration(minutes: 60)) {
        score += 10;
        reasons.add('within 1 hour');
      }
      if (entry.reference != null &&
          c.reference != null &&
          entry.reference!.replaceAll(RegExp(r'\D'), '') ==
              c.reference!.replaceAll(RegExp(r'\D'), '') &&
          entry.reference!.replaceAll(RegExp(r'\D'), '').length >= 6) {
        score += 40;
        reasons.add('same UTR/reference');
      }
      final debit = entry.direction == TxnDirection.debit ? entry : c;
      final credit = entry.direction == TxnDirection.credit ? entry : c;
      if (debit.counterpartySuffix != null &&
          debit.counterpartySuffix == credit.accountSuffix &&
          ownedSuffixes.contains(debit.counterpartySuffix)) {
        score += 30;
        reasons.add('debit names own account ${debit.counterpartySuffix}');
      }
      if (credit.counterpartySuffix != null &&
          credit.counterpartySuffix == debit.accountSuffix &&
          ownedSuffixes.contains(credit.counterpartySuffix)) {
        score += 30;
        reasons.add('credit names own account ${credit.counterpartySuffix}');
      }
      if (userDisplayName != null && userDisplayName.trim().length >= 3) {
        final me = MerchantNormalizer.normalize(userDisplayName);
        for (final m in [debit.merchant, credit.merchant]) {
          if (m != null &&
              MerchantMatcher.similarity(MerchantNormalizer.normalize(m), me) >=
                  90) {
            score += 15;
            reasons.add('beneficiary is you');
            break;
          }
        }
      }
      score = score.clamp(0, 100);
      if (best == null || score > best.score) {
        best = TransferMatch(c, score, reasons);
      }
    }
    return best;
  }
}

class SplitPart {
  final int? categoryId;
  final int amountPaise;
  final String? note;
  const SplitPart(this.categoryId, this.amountPaise, {this.note});
}

class SplitValidator {
  SplitValidator._();

  /// Splits must be positive and sum exactly to the parent amount.
  static String? validate(int totalPaise, List<SplitPart> parts) {
    if (parts.length < 2) return 'A split needs at least two parts';
    if (parts.any((p) => p.amountPaise <= 0)) {
      return 'Each part must be more than ₹0';
    }
    final sum = parts.fold<int>(0, (a, p) => a + p.amountPaise);
    if (sum != totalPaise) return 'Parts must add up to the total';
    return null;
  }
}
