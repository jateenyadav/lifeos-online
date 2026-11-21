/**
 * Reimbursements: money I paid (often on someone's add-on card) that the office / insurance will
 * pay back. Port of SpendSense lib/domain/reimburse/reimburse.dart.
 *
 *   1. Pay ₹1,000 → "I'll get this back": not counted as my spending.
 *   2. ₹1,200 comes in → it pays the claim: ₹1,000 is not income, the extra ₹200 is.
 *   3. If only ₹800 comes back, the missing ₹200 counts as my spending again.
 */

/**
 * Shares `receivedMinor` over `claims` [{id, amountMinor}] in the given order (oldest first).
 * → {covered: {id: minor}, matchedMinor, extraMinor, shortMinor}
 */
export function allocate(receivedMinor, claims) {
  let left = Math.max(0, receivedMinor);
  let claimed = 0;
  const covered = {};
  for (const claim of claims) {
    const want = Math.max(0, claim.amountMinor);
    claimed += want;
    const take = Math.min(want, left);
    covered[claim.id] = take;
    left -= take;
  }
  const matched = Math.max(0, receivedMinor) - left;
  return {
    covered,
    matchedMinor: matched,
    extraMinor: left,
    shortMinor: claimed - matched,
  };
}
