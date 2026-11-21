/** Exact equal split for trip costs: whole paise, extra paise go to the first people. */
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
