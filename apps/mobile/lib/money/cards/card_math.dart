/// Credit-card numbers: outstanding, available limit, utilisation, billing
/// cycle and due date. Pure logic, no database.
library;

enum DueState { none, upcoming, dueSoon, dueToday, overdue, paid }

class CardSettings {
  final int? creditLimitPaise;
  final int? statementDay; // 1..28
  final int? dueDay; // 1..31
  final int? lastStatementPaise;
  final int? lastMinDuePaise;
  final DateTime? lastStatementAt;
  final DateTime? lastDueDate;
  final DateTime? billPaidAt;
  const CardSettings({
    this.creditLimitPaise,
    this.statementDay,
    this.dueDay,
    this.lastStatementPaise,
    this.lastMinDuePaise,
    this.lastStatementAt,
    this.lastDueDate,
    this.billPaidAt,
  });
}

class CardTxn {
  final int amountPaise;
  final bool isCredit; // payment / refund to the card
  final DateTime at;
  const CardTxn(this.amountPaise, this.isCredit, this.at);
}

class CardSummary {
  /// What you owe the bank now (≥ 0). Negative balances (overpaid) show as 0 owed.
  final int outstandingPaise;
  final int? limitPaise;
  final int? availablePaise;

  /// 0..100+ (can exceed 100 when over limit). Null without a limit.
  final double? utilisation;

  /// Spends since the last statement date (the bill being built now).
  final int cycleSpendPaise;
  final DateTime? cycleStart;
  final DateTime? nextStatementDate;

  /// Bill to pay and when.
  final int? billPaise;
  final int? minDuePaise;
  final DateTime? dueDate;
  final DueState dueState;
  final int? daysToDue;

  /// Payments made to the card since the statement.
  final int paidSinceStatementPaise;
  const CardSummary({
    required this.outstandingPaise,
    required this.limitPaise,
    required this.availablePaise,
    required this.utilisation,
    required this.cycleSpendPaise,
    required this.cycleStart,
    required this.nextStatementDate,
    required this.billPaise,
    required this.minDuePaise,
    required this.dueDate,
    required this.dueState,
    required this.daysToDue,
    required this.paidSinceStatementPaise,
  });

  /// Plain advice line for the card screen.
  String get advice {
    if (dueState == DueState.overdue) {
      return 'Bill overdue: pay now to avoid late fees and interest.';
    }
    if (dueState == DueState.dueToday) return 'Bill due today.';
    if (dueState == DueState.dueSoon) {
      return 'Bill due in $daysToDue day${daysToDue == 1 ? '' : 's'}: pay the full amount to avoid interest.';
    }
    final u = utilisation;
    if (u != null && u >= 90) {
      return 'Card almost maxed out. High use can lower your credit score.';
    }
    if (u != null && u > 30) {
      return 'Using over 30% of the limit can affect your credit score.';
    }
    if (dueState == DueState.paid) return 'Bill paid. Nice!';
    return 'All good.';
  }
}

class CardMath {
  CardMath._();

  static DateTime _date(DateTime d) => DateTime(d.year, d.month, d.day);

  /// Day [day] of the month containing [ref], clamped to the month length.
  static DateTime dayInMonth(int year, int month, int day) {
    final last = DateTime(year, month + 1, 0).day;
    return DateTime(year, month, day.clamp(1, last));
  }

  /// Most recent statement date on or before [now].
  static DateTime? lastStatementDate(int? statementDay, DateTime now) {
    if (statementDay == null) return null;
    final thisMonth = dayInMonth(now.year, now.month, statementDay);
    if (!_date(now).isBefore(thisMonth)) return thisMonth;
    return dayInMonth(now.year, now.month - 1, statementDay);
  }

  /// Due date for the statement generated on [statement]: the next [dueDay]
  /// after it (banks give ~15-20 days).
  static DateTime? dueDateFor(DateTime? statement, int? dueDay) {
    if (statement == null || dueDay == null) return null;
    var d = dayInMonth(statement.year, statement.month, dueDay);
    if (!d.isAfter(statement)) {
      d = dayInMonth(statement.year, statement.month + 1, dueDay);
    }
    return d;
  }

  /// [ledgerBalancePaise] is the account's computed balance (opening + credits − debits);
  /// for a card it is negative when money is owed.
  static CardSummary summarise({
    required int ledgerBalancePaise,
    required CardSettings settings,
    required List<CardTxn> txns,
    required DateTime now,
  }) {
    final owed = ledgerBalancePaise < 0 ? -ledgerBalancePaise : 0;
    final limit = settings.creditLimitPaise;
    final available = limit == null ? null : limit - owed;
    final util = (limit == null || limit <= 0) ? null : owed * 100 / limit;

    // Statement: prefer the bank's own statement (SMS), else from the statement day.
    final computedStmt = lastStatementDate(settings.statementDay, now);
    DateTime? stmt = computedStmt;
    final bankStmt = settings.lastStatementAt;
    if (bankStmt != null && (stmt == null || !_date(bankStmt).isBefore(stmt))) {
      stmt = _date(bankStmt);
    }

    final cycleStart = stmt;
    DateTime? nextStmt;
    if (settings.statementDay != null) {
      final base = stmt ?? now;
      nextStmt = dayInMonth(base.year, base.month + 1, settings.statementDay!);
    }

    var cycleSpend = 0, paidSince = 0, billFromLedger = 0;
    for (final t in txns) {
      final afterStmt = cycleStart == null || !t.at.isBefore(cycleStart);
      if (afterStmt) {
        if (t.isCredit) {
          paidSince += t.amountPaise;
        } else {
          cycleSpend += t.amountPaise;
        }
      }
    }
    if (cycleStart != null) {
      // Owed before this cycle = current owed − this cycle's spends + payments since.
      billFromLedger = owed - cycleSpend + paidSince;
      if (billFromLedger < 0) billFromLedger = 0;
    }

    final usingBankBill =
        settings.lastStatementPaise != null &&
        bankStmt != null &&
        (computedStmt == null || !_date(bankStmt).isBefore(computedStmt));
    final bill = usingBankBill
        ? settings.lastStatementPaise
        : (cycleStart != null ? billFromLedger : null);
    final minDue = usingBankBill
        ? settings.lastMinDuePaise
        : (bill == null ? null : _estimateMinDue(bill));

    DateTime? due = usingBankBill ? settings.lastDueDate : null;
    due ??= dueDateFor(stmt, settings.dueDay);

    var state = DueState.none;
    int? days;
    if (due != null && bill != null && bill > 0) {
      days = _date(due).difference(_date(now)).inDays;
      final paidAfterStmt =
          settings.billPaidAt != null &&
          (cycleStart == null || !settings.billPaidAt!.isBefore(cycleStart));
      if (paidAfterStmt || paidSince >= bill) {
        state = DueState.paid;
      } else if (days < 0) {
        state = DueState.overdue;
      } else if (days == 0) {
        state = DueState.dueToday;
      } else if (days <= 5) {
        state = DueState.dueSoon;
      } else {
        state = DueState.upcoming;
      }
    } else if (bill == 0) {
      state = DueState.paid;
    }

    return CardSummary(
      outstandingPaise: owed,
      limitPaise: limit,
      availablePaise: available,
      utilisation: util,
      cycleSpendPaise: cycleSpend,
      cycleStart: cycleStart,
      nextStatementDate: nextStmt,
      billPaise: bill,
      minDuePaise: minDue,
      dueDate: due,
      dueState: state,
      daysToDue: days,
      paidSinceStatementPaise: paidSince,
    );
  }

  /// Typical Indian card minimum due: 5% of the bill (min ₹200, never above the bill).
  static int _estimateMinDue(int bill) {
    if (bill <= 0) return 0;
    final five = (bill * 5 / 100).round();
    final m = five < 20000 ? 20000 : five;
    return m > bill ? bill : m;
  }
}
