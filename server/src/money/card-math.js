/**
 * Credit-card numbers: outstanding, available limit, usage, billing cycle and due date.
 * Port of SpendSense lib/domain/cards/card_math.dart. Dates are 'YYYY-MM-DD' strings.
 */
import { dayInMonth, daysBetween, parts } from './dates.js';

/** Most recent statement date on or before `now`. */
export function lastStatementDate(statementDay, now) {
  if (!statementDay) return null;
  const { year, month } = parts(now);
  const thisMonth = dayInMonth(year, month, statementDay);
  return now >= thisMonth
    ? thisMonth
    : dayInMonth(year, month - 1, statementDay);
}

/** Due date for the statement made on `statement`: the next `dueDay` after it. */
export function dueDateFor(statement, dueDay) {
  if (!statement || !dueDay) return null;
  const { year, month } = parts(statement);
  const due = dayInMonth(year, month, dueDay);
  return due > statement ? due : dayInMonth(year, month + 1, dueDay);
}

/** Typical Indian card minimum due: 5% of the bill (min ₹200, never above the bill). */
function estimateMinDue(bill) {
  if (bill <= 0) return 0;
  return Math.min(bill, Math.max(20000, Math.round((bill * 5) / 100)));
}

/**
 * `ledgerBalanceMinor` is the card's computed balance (negative when money is owed).
 * settings: {creditLimitMinor, statementDay, dueDay, lastStatementMinor, lastMinDueMinor,
 *            lastStatementAt, lastDueDate, billPaidAt}
 * txns: [{amountMinor, isCredit, date}]
 */
export function summariseCard({ ledgerBalanceMinor, settings, txns, now }) {
  const owed = ledgerBalanceMinor < 0 ? -ledgerBalanceMinor : 0;
  const limit = settings.creditLimitMinor || null;
  const available = limit === null ? null : limit - owed;
  const usage = !limit || limit <= 0 ? null : (owed * 100) / limit;

  // Statement: prefer the bank's own statement, else the statement day.
  const computed = lastStatementDate(settings.statementDay, now);
  let statement = computed;
  const bankStatement = settings.lastStatementAt ?? null;
  if (bankStatement && (!statement || bankStatement >= statement))
    statement = bankStatement;
  const cycleStart = statement;
  let nextStatementDate = null;
  if (settings.statementDay) {
    const base = parts(statement ?? now);
    nextStatementDate = dayInMonth(
      base.year,
      base.month + 1,
      settings.statementDay,
    );
  }

  let cycleSpend = 0;
  let paidSince = 0;
  for (const txn of txns) {
    if (cycleStart && txn.date < cycleStart) continue;
    if (txn.isCredit) paidSince += txn.amountMinor;
    else cycleSpend += txn.amountMinor;
  }
  const billFromLedger = cycleStart
    ? Math.max(0, owed - cycleSpend + paidSince)
    : null;
  const usingBankBill =
    settings.lastStatementMinor != null &&
    Boolean(bankStatement) &&
    (!computed || bankStatement >= computed);
  const bill = usingBankBill ? settings.lastStatementMinor : billFromLedger;
  const minDue = usingBankBill
    ? (settings.lastMinDueMinor ?? null)
    : bill === null
      ? null
      : estimateMinDue(bill);
  const due =
    (usingBankBill ? settings.lastDueDate : null) ??
    dueDateFor(statement, settings.dueDay);

  let dueState = 'none';
  let daysToDue = null;
  if (due && bill !== null && bill > 0) {
    daysToDue = daysBetween(now, due);
    const paidAfterStatement =
      settings.billPaidAt && (!cycleStart || settings.billPaidAt >= cycleStart);
    if (paidAfterStatement || paidSince >= bill) dueState = 'paid';
    else if (daysToDue < 0) dueState = 'overdue';
    else if (daysToDue === 0) dueState = 'due_today';
    else if (daysToDue <= 5) dueState = 'due_soon';
    else dueState = 'upcoming';
  } else if (bill === 0) dueState = 'paid';

  return {
    outstandingMinor: owed,
    limitMinor: limit,
    availableMinor: available,
    usagePct: usage === null ? null : Math.round(usage * 10) / 10,
    cycleSpendMinor: cycleSpend,
    cycleStart,
    nextStatementDate,
    billMinor: bill,
    minDueMinor: minDue,
    dueDate: due,
    dueState,
    daysToDue,
    paidSinceStatementMinor: paidSince,
  };
}

/** Plain advice line for the card screen. */
export function cardAdvice(summary) {
  const { dueState, daysToDue, usagePct } = summary;
  if (dueState === 'overdue')
    return 'Bill overdue: pay now to avoid late fees and interest.';
  if (dueState === 'due_today') return 'Bill due today.';
  if (dueState === 'due_soon')
    return `Bill due in ${daysToDue} day${daysToDue === 1 ? '' : 's'}: pay the full amount to avoid interest.`;
  if (usagePct !== null && usagePct >= 90)
    return 'Card almost maxed out. High use can lower your credit score.';
  if (usagePct !== null && usagePct > 30)
    return 'Using over 30% of the limit can affect your credit score.';
  if (dueState === 'paid') return 'Bill paid. Nice!';
  return 'All good.';
}
