import 'dart:math';

const paymentLabels = {
  'expense': 'Spending',
  'self_transfer': 'Self transfer',
  'lent': 'I lent money',
  'borrowed': 'I borrowed money',
  'repayment_received': 'Someone paid me back',
  'repayment_paid': 'I paid someone back',
  'income': 'Income',
};
const personKinds = [
  'lent',
  'borrowed',
  'repayment_received',
  'repayment_paid',
];
const incomingKinds = ['borrowed', 'repayment_received', 'income'];
String moneyClientKey() {
  final random = Random.secure();
  return List.generate(
    16,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

List<Map<String, dynamic>> peopleBalances(List<Map<String, dynamic>> payments) {
  final rows = <String, Map<String, dynamic>>{};
  for (final payment in payments) {
    if (payment['status'] != 'confirmed' ||
        !personKinds.contains(payment['kind'])) {
      continue;
    }
    final key = (payment['person'] as String).trim().toLowerCase();
    final row = rows.putIfAbsent(
      key,
      () => {
        'person': payment['person'],
        'gave': 0,
        'received': 0,
        'balance': 0,
      },
    );
    final outgoing = ['lent', 'repayment_paid'].contains(payment['kind']);
    final amount = payment['amountMinor'] as int;
    row[outgoing ? 'gave' : 'received'] += amount;
    row['balance'] += outgoing ? amount : -amount;
  }
  return rows.values.toList();
}

Map<String, int> splitBalances(
  Map<String, dynamic> trip,
  List<Map<String, dynamic>> items,
) {
  final balances = {
    for (final member in trip['members'] as List) member as String: 0,
  };
  for (final item in items.where((entry) => entry['tripId'] == trip['id'])) {
    final participants = List<String>.from(item['participants'] as List);
    final amount = item['amountMinor'] as int;
    balances[item['payer']] = balances[item['payer']]! + amount;
    final share = amount ~/ participants.length;
    for (var index = 0; index < participants.length; index++) {
      final member = participants[index];
      balances[member] =
          balances[member]! -
          share -
          (index < amount % participants.length ? 1 : 0);
    }
  }
  return balances;
}
