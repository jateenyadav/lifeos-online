/// Khata (personal ledger) calculations.
///
/// Sign convention: a positive balance means the contact owes you
/// (receivable); negative means you owe the contact (payable).
///  - gave: you gave money (lent, or repaid them)  -> +amount
///  - got:  you received money (borrowed, or they repaid) -> -amount
/// Adjustments are stored separately and never modify actual entries.
library;

enum KhataDirection { gave, got }

enum AdjustmentType {
  onMe,
  waived,
  disputed,
  pendingConfirmation,
  sharedExpense,
  discount,
  custom,
}

extension AdjustmentTypeLabel on AdjustmentType {
  String get label => switch (this) {
    AdjustmentType.onMe => 'On me',
    AdjustmentType.waived => 'Waived',
    AdjustmentType.disputed => 'Disputed',
    AdjustmentType.pendingConfirmation => 'Pending confirmation',
    AdjustmentType.sharedExpense => 'Shared expense',
    AdjustmentType.discount => 'Discount',
    AdjustmentType.custom => 'Custom adjustment',
  };

  /// Types that by default reduce the outstanding amount toward zero.
  bool get reducesByDefault => switch (this) {
    AdjustmentType.onMe ||
    AdjustmentType.waived ||
    AdjustmentType.disputed ||
    AdjustmentType.pendingConfirmation ||
    AdjustmentType.discount => true,
    AdjustmentType.sharedExpense || AdjustmentType.custom => false,
  };
}

class KhataEntryLite {
  final KhataDirection direction;
  final int amountPaise;
  const KhataEntryLite(this.direction, this.amountPaise);
  int get signed =>
      direction == KhataDirection.gave ? amountPaise : -amountPaise;
}

class KhataAdjustmentLite {
  final AdjustmentType type;

  /// Signed effect on the balance (+ = they owe you more).
  final int deltaPaise;
  final bool active;
  const KhataAdjustmentLite(this.type, this.deltaPaise, {this.active = true});
}

class KhataBalance {
  final int actualPaise;
  final int adjustmentPaise;
  final int disputedPaise;
  final int pendingConfirmationPaise;
  final int totalGivenPaise;
  final int totalReceivedPaise;
  const KhataBalance({
    required this.actualPaise,
    required this.adjustmentPaise,
    required this.disputedPaise,
    required this.pendingConfirmationPaise,
    required this.totalGivenPaise,
    required this.totalReceivedPaise,
  });

  int get adjustedPaise => actualPaise + adjustmentPaise;
  bool get isSettled => adjustedPaise == 0;
  bool get theyOweMe => adjustedPaise > 0;
}

class KhataCalculator {
  KhataCalculator._();

  static KhataBalance balance(
    List<KhataEntryLite> entries,
    List<KhataAdjustmentLite> adjustments,
  ) {
    var actual = 0, given = 0, received = 0;
    for (final e in entries) {
      actual += e.signed;
      if (e.direction == KhataDirection.gave) {
        given += e.amountPaise;
      } else {
        received += e.amountPaise;
      }
    }
    var adj = 0, disputed = 0, pending = 0;
    for (final a in adjustments) {
      if (!a.active) continue;
      adj += a.deltaPaise;
      if (a.type == AdjustmentType.disputed) disputed += a.deltaPaise.abs();
      if (a.type == AdjustmentType.pendingConfirmation) {
        pending += a.deltaPaise.abs();
      }
    }
    return KhataBalance(
      actualPaise: actual,
      adjustmentPaise: adj,
      disputedPaise: disputed,
      pendingConfirmationPaise: pending,
      totalGivenPaise: given,
      totalReceivedPaise: received,
    );
  }

  /// Signed delta for an adjustment of [amountPaise]. Reducing adjustments
  /// move the current balance toward zero; [increase] flips the direction
  /// for shared expenses / custom adjustments.
  static int deltaFor({
    required int currentBalancePaise,
    required int amountPaise,
    required bool reduce,
  }) {
    final towardZero = currentBalancePaise >= 0 ? -amountPaise : amountPaise;
    return reduce ? towardZero : -towardZero;
  }

  /// Amount needed to fully settle (positive = they should pay you).
  static int settlementAmount(KhataBalance b) => b.adjustedPaise;
}

class KhataSummary {
  final int receivablePaise;
  final int payablePaise;
  const KhataSummary(this.receivablePaise, this.payablePaise);
  int get netPaise => receivablePaise - payablePaise;

  static KhataSummary fromBalances(Iterable<int> adjustedBalances) {
    var r = 0, p = 0;
    for (final b in adjustedBalances) {
      if (b > 0) r += b;
      if (b < 0) p += -b;
    }
    return KhataSummary(r, p);
  }
}
