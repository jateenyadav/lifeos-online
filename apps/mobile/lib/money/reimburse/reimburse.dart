/// Reimbursements: money I paid (often on someone's add-on card) that the
/// office / insurance will pay back.
///
///   1. Pay ₹1,000 → mark "I'll get this back": not counted as my spending.
///   2. ₹1,200 comes in → mark it as the reimbursement for that payment:
///      ₹1,000 is not income (it only pays the claim back), the extra ₹200 is.
///   3. If only ₹800 comes back, the missing ₹200 counts as my spending again.
library;

class ReimburseClaim {
  final int id;

  /// Amount expected back.
  final int amountPaise;
  const ReimburseClaim(this.id, this.amountPaise);
}

class ReimburseSplit {
  /// Claim id → part of it the money covered.
  final Map<int, int> covered;

  /// Part of the incoming money that paid claims (not income).
  final int matchedPaise;

  /// Incoming money beyond the claims: my income.
  final int extraPaise;

  /// Claimed but not paid back: counts as my spending.
  final int shortPaise;
  const ReimburseSplit(
    this.covered,
    this.matchedPaise,
    this.extraPaise,
    this.shortPaise,
  );
}

class Reimburse {
  Reimburse._();

  /// Shares [receivedPaise] over [claims] in the given order (oldest first).
  static ReimburseSplit allocate(
    int receivedPaise,
    List<ReimburseClaim> claims,
  ) {
    var left = receivedPaise < 0 ? 0 : receivedPaise;
    var claimed = 0;
    final covered = <int, int>{};
    for (final c in claims) {
      final want = c.amountPaise < 0 ? 0 : c.amountPaise;
      claimed += want;
      final take = want < left ? want : left;
      covered[c.id] = take;
      left -= take;
    }
    final matched = receivedPaise - left;
    return ReimburseSplit(covered, matched, left, claimed - matched);
  }
}
