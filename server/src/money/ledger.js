/**
 * Pure money maths over transactions. Port of SpendSense lib/domain/ledger/ledger.dart.
 *
 * Txn fields used: amountMinor, direction, status, deleted, isTransfer, refundOfId,
 * peerShareMinor, reimburseMinor, accountId, date, time, utr, last4, sources, title,
 * counterparty, counterpartyLast4, transferId.
 */
import { normalizeMerchant, similarity } from './merchant.js';
import { stamp } from './dates.js';

/** My own part: amount − friend's share − reimbursed/claimed part, never below 0. */
export const ownMinor = (txn) =>
  Math.min(
    txn.amountMinor,
    Math.max(
      0,
      txn.amountMinor - (txn.peerShareMinor ?? 0) - (txn.reimburseMinor ?? 0),
    ),
  );

/** Counts in balances and totals: cleared and not deleted. */
export const counts = (txn) => txn.status === 'cleared' && !txn.deleted;
export const isRefund = (txn) =>
  txn.direction === 'credit' && Boolean(txn.refundOfId);
export const signed = (txn) =>
  txn.direction === 'credit' ? txn.amountMinor : -txn.amountMinor;

/** Spending, income, refunds and transfers for a set of transactions. */
export function periodTotals(txns) {
  let income = 0;
  let expense = 0;
  let refunds = 0;
  let transfers = 0;
  for (const txn of txns) {
    if (!counts(txn)) continue;
    if (txn.isTransfer) {
      if (txn.direction === 'debit') transfers += txn.amountMinor;
      continue;
    }
    if (txn.direction === 'credit') {
      if (isRefund(txn)) refunds += ownMinor(txn);
      else income += ownMinor(txn);
    } else expense += ownMinor(txn);
  }
  const spent = Math.max(0, expense - refunds);
  return {
    incomeMinor: income,
    spentMinor: spent,
    refundMinor: refunds,
    transferMinor: transfers,
    netMinor: income - spent,
  };
}

/**
 * What a transaction adds to "spending" (negative for a refund), or 0 when it is not spending.
 * Used for per-category / per-day breakdowns.
 */
export function spendDelta(txn) {
  if (!counts(txn) || txn.isTransfer) return 0;
  if (txn.direction === 'debit') return ownMinor(txn);
  return isRefund(txn) ? -ownMinor(txn) : 0;
}

/** opening + cleared credits − cleared debits. Transfers count (money really moved). */
export function accountBalance(openingMinor, txns) {
  return txns.reduce(
    (sum, txn) => (counts(txn) ? sum + signed(txn) : sum),
    openingMinor ?? 0,
  );
}

const normRef = (ref) =>
  String(ref)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
const digits = (ref) => String(ref ?? '').replace(/\D/g, '');
const hasSource = (txn, source) =>
  (txn.sources ?? []).includes(source) || txn.source === source;
const upiUser = (s) =>
  (s.includes('@') ? s.split('@')[0] : s).toLowerCase().replace(/[^a-z]/g, '');

const CROSS_SOURCE_MS = 10 * 60000;
const WEAK_MS = 30 * 60000;

/**
 * Duplicate check for an incoming item against existing txns.
 * Only exact matches (same reference, or the same payment seen through SMS and a notification)
 * are merged; weak matches are kept and flagged so a real payment is never dropped.
 * → {kind: 'none'|'exact'|'cross_source'|'possible', match}
 */
export function findDuplicate(item, existing) {
  const at = stamp(item.date, item.time);
  let possible = null;
  for (const txn of existing) {
    if (txn.deleted) continue;
    if (
      txn.amountMinor !== item.amountMinor ||
      txn.direction !== item.direction
    )
      continue;
    const diff = Math.abs(stamp(txn.date, txn.time) - at);
    const bothTimed = Boolean(item.time && txn.time);
    const sameAccount = !item.last4 || !txn.last4 || item.last4 === txn.last4;
    // 1. Same bank reference = same transaction (any time).
    if (item.utr && txn.utr && normRef(item.utr) === normRef(txn.utr)) {
      if (sameAccount) return { kind: 'exact', match: txn };
    }
    // Different references on both → different transactions.
    if (item.utr && txn.utr) continue;
    // 2. Same payment arriving through SMS and through an app notification.
    const crossSource =
      (item.source === 'notification' &&
        !hasSource(txn, 'notification') &&
        hasSource(txn, 'sms')) ||
      (item.source === 'sms' &&
        !hasSource(txn, 'sms') &&
        hasSource(txn, 'notification'));
    if (crossSource && bothTimed && diff <= CROSS_SOURCE_MS) {
      const a = item.counterparty || item.title;
      const b = txn.counterparty || txn.title;
      const merchantOk =
        !a ||
        !b ||
        similarity(normalizeMerchant(a), normalizeMerchant(b)) >= 60 ||
        upiUser(a) === upiUser(b);
      if (merchantOk && sameAccount)
        return { kind: 'cross_source', match: txn };
    }
    // 3. Same amount, same account, close in time, nothing to tell them apart.
    if (diff <= WEAK_MS && sameAccount) possible ??= txn;
  }
  return possible
    ? { kind: 'possible', match: possible }
    : { kind: 'none', match: null };
}

/** True when a transaction's text names account digits `last4` ("to A/c XX5678"). */
export function namesAccount(txn, last4) {
  if (!last4 || last4.length < 3) return false;
  if (txn.counterpartyLast4 && txn.counterpartyLast4 === last4) return true;
  return new RegExp(`(?:^|\\D)${last4}(?!\\d)`).test(
    `${txn.title ?? ''} ${txn.counterparty ?? ''}`,
  );
}

const TRANSFER_WINDOW_MS = 3 * 86400000;

/**
 * Best self-transfer partner for `entry` among `candidates`: equal amount, opposite direction,
 * two different own accounts, within 3 days. Amount + time alone is only a suggestion; a shared
 * UTR or the debit naming the other account's digits links automatically.
 * → {match, score, reasons, autoLink} | null
 */
export function findTransferPartner(entry, candidates, ownedLast4 = []) {
  if (!entry.accountId) return null;
  const owned = new Set(ownedLast4.filter(Boolean));
  let best = null;
  for (const other of candidates) {
    if (
      other.id === entry.id ||
      other.transferId ||
      other.isTransfer ||
      other.deleted
    )
      continue;
    if (!other.accountId || other.accountId === entry.accountId) continue;
    if (
      other.amountMinor !== entry.amountMinor ||
      other.direction === entry.direction
    )
      continue;
    if (other.status === 'failed') continue;
    const diff = Math.abs(
      stamp(other.date, other.time) - stamp(entry.date, entry.time),
    );
    if (diff > TRANSFER_WINDOW_MS) continue;
    let score = 30;
    const reasons = ['same amount, opposite direction'];
    if (diff <= 10 * 60000) {
      score += 20;
      reasons.push('within 10 min');
    } else if (diff <= 60 * 60000) {
      score += 10;
      reasons.push('within 1 hour');
    }
    const sameUtr =
      digits(entry.utr).length >= 6 && digits(entry.utr) === digits(other.utr);
    if (sameUtr) {
      score += 40;
      reasons.push('same UTR/reference');
    }
    const debit = entry.direction === 'debit' ? entry : other;
    const credit = entry.direction === 'credit' ? entry : other;
    const debitNames =
      Boolean(credit.last4) &&
      owned.has(credit.last4) &&
      namesAccount(debit, credit.last4);
    if (debitNames) {
      score += 30;
      reasons.push(`debit names own account ${credit.last4}`);
    }
    const creditNames =
      Boolean(debit.last4) &&
      owned.has(debit.last4) &&
      namesAccount(credit, debit.last4);
    if (creditNames) {
      score += 30;
      reasons.push(`credit names own account ${debit.last4}`);
    }
    score = Math.min(100, score);
    if (!best || score > best.score)
      best = {
        match: other,
        score,
        reasons,
        autoLink: sameUtr || debitNames || creditNames,
      };
  }
  return best;
}
