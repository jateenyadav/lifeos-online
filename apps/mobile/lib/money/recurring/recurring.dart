/// Finds repeating payments (subscriptions, rent, EMIs, phone/OTT bills)
/// from transaction history, and predicts the next one.
library;

class RecurringInput {
  final String key; // merchant key (id or normalised name)
  final String name;
  final int amountPaise;
  final DateTime at;
  const RecurringInput(this.key, this.name, this.amountPaise, this.at);
}

enum Cadence { weekly, monthly, quarterly, yearly }

class RecurringPayment {
  final String key;
  final String name;
  final int typicalPaise;
  final Cadence cadence;
  final DateTime lastAt;
  final DateTime nextAt;
  final int count;
  const RecurringPayment(
    this.key,
    this.name,
    this.typicalPaise,
    this.cadence,
    this.lastAt,
    this.nextAt,
    this.count,
  );

  /// Cost per month, for the "subscriptions cost you ₹X a month" total.
  int get monthlyPaise => switch (cadence) {
    Cadence.weekly => (typicalPaise * 52 / 12).round(),
    Cadence.monthly => typicalPaise,
    Cadence.quarterly => (typicalPaise / 3).round(),
    Cadence.yearly => (typicalPaise / 12).round(),
  };

  String get cadenceLabel => switch (cadence) {
    Cadence.weekly => 'Weekly',
    Cadence.monthly => 'Monthly',
    Cadence.quarterly => 'Every 3 months',
    Cadence.yearly => 'Yearly',
  };
}

class RecurringDetector {
  RecurringDetector._();

  static const _cadences = {
    Cadence.weekly: (7, 2),
    Cadence.monthly: (30, 4),
    Cadence.quarterly: (91, 8),
    Cadence.yearly: (365, 15),
  };

  /// Payments to the same merchant, similar amount (±15%), at a regular
  /// interval, seen at least [minCount] times (2 for yearly/quarterly).
  /// Stale ones (missed more than 1.5 periods) are dropped.
  static List<RecurringPayment> detect(
    List<RecurringInput> txns, {
    required DateTime now,
    int minCount = 3,
  }) {
    final byKey = <String, List<RecurringInput>>{};
    for (final t in txns) {
      byKey.putIfAbsent(t.key, () => []).add(t);
    }
    final out = <RecurringPayment>[];
    for (final entry in byKey.entries) {
      final list = entry.value..sort((a, b) => a.at.compareTo(b.at));
      if (list.length < 2) continue;
      // Use the most recent run of similar amounts.
      final last = list.last;
      final similar = list
          .where(
            (t) =>
                (t.amountPaise - last.amountPaise).abs() <=
                last.amountPaise * 0.15,
          )
          .toList();
      if (similar.length < 2) continue;
      final gaps = <int>[];
      for (var i = 1; i < similar.length; i++) {
        gaps.add(similar[i].at.difference(similar[i - 1].at).inDays);
      }
      gaps.sort();
      final median = gaps[gaps.length ~/ 2];
      Cadence? cadence;
      for (final c in _cadences.entries) {
        final (days, tol) = c.value;
        if ((median - days).abs() <= tol) {
          cadence = c.key;
          break;
        }
      }
      if (cadence == null) continue;
      final (period, tol) = _cadences[cadence]!;
      final need = (cadence == Cadence.yearly || cadence == Cadence.quarterly)
          ? 2
          : minCount;
      if (similar.length < need) continue;
      // Most gaps must fit the cadence (not just the median).
      final fitting = gaps.where((g) => (g - period).abs() <= tol * 2).length;
      if (fitting < (gaps.length * 0.7).ceil()) continue;
      final next = _advance(similar.last.at, cadence);
      if (now.difference(similar.last.at).inDays > period * 1.5) continue;
      final amounts = similar.map((t) => t.amountPaise).toList()..sort();
      out.add(
        RecurringPayment(
          entry.key,
          last.name,
          amounts[amounts.length ~/ 2],
          cadence,
          similar.last.at,
          next,
          similar.length,
        ),
      );
    }
    out.sort((a, b) => a.nextAt.compareTo(b.nextAt));
    return out;
  }

  static DateTime _advance(DateTime d, Cadence c) => switch (c) {
    Cadence.weekly => d.add(const Duration(days: 7)),
    Cadence.monthly => DateTime(
      d.year,
      d.month + 1,
      d.day.clamp(1, DateTime(d.year, d.month + 2, 0).day),
    ),
    Cadence.quarterly => DateTime(
      d.year,
      d.month + 3,
      d.day.clamp(1, DateTime(d.year, d.month + 4, 0).day),
    ),
    Cadence.yearly => DateTime(d.year + 1, d.month, d.day),
  };
}
