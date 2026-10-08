export const paymentLabels = {
  expense: 'Spending',
  self_transfer: 'Self transfer',
  lent: 'I lent money',
  borrowed: 'I borrowed money',
  repayment_received: 'Someone paid me back',
  repayment_paid: 'I paid someone back',
  income: 'Income',
};
export const personKinds = [
  'lent',
  'borrowed',
  'repayment_received',
  'repayment_paid',
];
export const incomingKinds = ['borrowed', 'repayment_received', 'income'];
export function peopleBalances(payments) {
  const rows = new Map();
  for (const payment of payments) {
    if (payment.status !== 'confirmed' || !personKinds.includes(payment.kind))
      continue;
    const key = payment.person.trim().toLowerCase();
    const row = rows.get(key) ?? {
      person: payment.person,
      gave: 0,
      received: 0,
      balance: 0,
    };
    const outgoing = ['lent', 'repayment_paid'].includes(payment.kind);
    row[outgoing ? 'gave' : 'received'] += payment.amountMinor;
    row.balance += outgoing ? payment.amountMinor : -payment.amountMinor;
    rows.set(key, row);
  }
  return [...rows.values()];
}
export function splitBalances(trip, items) {
  const balances = Object.fromEntries(
    trip.members.map((member) => [member, 0]),
  );
  for (const item of items.filter((entry) => entry.tripId === trip.id)) {
    balances[item.payer] += item.amountMinor;
    const share = Math.floor(item.amountMinor / item.participants.length);
    item.participants.forEach((member, index) => {
      balances[member] -=
        share + (index < item.amountMinor % item.participants.length ? 1 : 0);
    });
  }
  return balances;
}
