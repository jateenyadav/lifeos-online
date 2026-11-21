/**
 * Khata (personal ledger) maths. Port of SpendSense lib/domain/khata/khata.dart.
 *
 * Sign: balance > 0 ⇒ the person owes me; < 0 ⇒ I owe them. gave = +amount, got = −amount.
 * Adjustments are stored separately and never change the real entries.
 */

export const adjustmentTypes = [
  'on_me',
  'waived',
  'disputed',
  'pending_confirmation',
  'shared_expense',
  'discount',
  'custom',
];
const reducing = new Set([
  'on_me',
  'waived',
  'disputed',
  'pending_confirmation',
  'discount',
]);
/** Types that move the balance toward zero unless the user says otherwise. */
export const reducesByDefault = (type) => reducing.has(type);

export const signedEntry = (entry) =>
  entry.direction === 'gave' ? entry.amountMinor : -entry.amountMinor;

export function khataBalance(entries, adjustments = []) {
  let actual = 0;
  let given = 0;
  let received = 0;
  for (const entry of entries) {
    actual += signedEntry(entry);
    if (entry.direction === 'gave') given += entry.amountMinor;
    else received += entry.amountMinor;
  }
  let adjustment = 0;
  let disputed = 0;
  let pending = 0;
  for (const item of adjustments) {
    if (item.active === false) continue;
    adjustment += item.deltaMinor;
    if (item.type === 'disputed') disputed += Math.abs(item.deltaMinor);
    if (item.type === 'pending_confirmation')
      pending += Math.abs(item.deltaMinor);
  }
  return {
    actualMinor: actual,
    adjustedMinor: actual + adjustment,
    adjustmentMinor: adjustment,
    givenMinor: given,
    receivedMinor: received,
    disputedMinor: disputed,
    pendingConfirmationMinor: pending,
  };
}

/**
 * Signed delta for an adjustment. `reduce` moves the current balance toward zero; otherwise it
 * moves it away (shared expenses, custom).
 */
export function adjustmentDelta({ currentMinor, amountMinor, reduce }) {
  const towardZero = currentMinor >= 0 ? -amountMinor : amountMinor;
  return reduce ? towardZero : -towardZero;
}

export function khataSummary(adjustedBalances) {
  let owedToMe = 0;
  let iOwe = 0;
  for (const balance of adjustedBalances) {
    if (balance > 0) owedToMe += balance;
    if (balance < 0) iOwe -= balance;
  }
  return {
    owedToMeMinor: owedToMe,
    iOweMinor: iOwe,
    netMinor: owedToMe - iOwe,
  };
}

const byNewest = (a, b) =>
  b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id));

/**
 * Display order for one person: entries recorded in the app newest first, then the opening
 * balance (old khata) entries, whatever their dates. Each row gets the running balance,
 * computed oldest → newest in the reversed display order.
 */
export function ledgerRows(entries) {
  const rows = [
    ...entries.filter((entry) => !entry.isOpening).sort(byNewest),
    ...entries.filter((entry) => entry.isOpening).sort(byNewest),
  ];
  let running = 0;
  const withRunning = new Array(rows.length);
  for (let index = rows.length - 1; index >= 0; index--) {
    running += signedEntry(rows[index]);
    withRunning[index] = { ...rows[index], runningMinor: running };
  }
  return withRunning;
}
