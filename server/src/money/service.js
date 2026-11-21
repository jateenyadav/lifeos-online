/**
 * Money v2 business rules (docs/MONEY.md), written once over the small store contract shared by
 * store-mongo.js and memory-store.js. The router only validates input and calls these.
 */
import { randomBytes } from 'node:crypto';
import { ApiError } from '../auth.js';
import {
  defaultCategory,
  expenseCategories,
  incomeCategories,
} from './constants.js';
import {
  addDays,
  addMonths,
  daysOfMonth,
  monthOf,
  stamp,
  toDay,
} from './dates.js';
import {
  accountBalance,
  counts,
  findDuplicate,
  findTransferPartner,
  ownMinor,
  periodTotals,
  spendDelta,
} from './ledger.js';
import {
  adjustmentDelta,
  khataBalance,
  khataSummary,
  ledgerRows,
  reducesByDefault,
} from './khata.js';
import {
  contactName,
  looksLikePerson,
  peerFits,
  peerNote,
  peerOutcome,
} from './peer.js';
import { allocate } from './reimburse.js';
import { lastStatementDate, summariseCard, cardAdvice } from './card-math.js';
import { detectRecurring } from './recurring.js';
import { displayName, matchMerchant, normalizeMerchant } from './merchant.js';
import {
  nameKey,
  openingEntries,
  parseBulkKhata,
  fixMinor,
  linesMinor,
} from './bulk-import.js';
import { parseKhataText, signedMinor, totalMinor } from './text-import.js';

export const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_PHOTOS = 500;
const ORPHAN_PHOTO_MS = 86400000;

export function newTxn(values) {
  const source = values.source ?? 'manual';
  return {
    time: null,
    title: '',
    category: defaultCategory(values.direction),
    purpose: '',
    channel: 'Other',
    accountId: null,
    note: '',
    status: 'cleared',
    needsReview: false,
    sources: [source],
    sourceKeys: values.sourceKey ? [values.sourceKey] : [],
    utr: null,
    sourceApp: '',
    bank: '',
    last4: '',
    counterparty: '',
    counterpartyLast4: '',
    merchantKey: normalizeMerchant(values.counterparty || values.title || ''),
    isPerson: false,
    confidence: null,
    peerTag: null,
    peerShareMinor: 0,
    splitPeople: null,
    contactId: null,
    isTransfer: false,
    transferId: null,
    refundOfId: null,
    possibleDuplicateOf: null,
    reimburseTag: null,
    reimburseMinor: 0,
    reimbursedById: null,
    deleted: false,
    ...values,
    source,
  };
}

export const newAccount = (values) => ({
  type: 'savings',
  bank: '',
  last4: '',
  openingMinor: 0,
  ownerName: null,
  followBank: true,
  bankBalanceMinor: null,
  bankBalanceAt: null,
  creditLimitMinor: 0,
  billMinor: 0,
  minDueMinor: 0,
  dueDate: null,
  statementDay: null,
  billPaidAt: null,
  needsConfirm: false,
  archived: false,
  ...values,
});

export const newEntry = (values) => ({
  note: '',
  dueDate: null,
  isOpening: false,
  linkedTxnId: null,
  paidForMe: false,
  ...values,
});

export const contactKey = (name) =>
  nameKey(name) || String(name).trim().toLowerCase();
export const newContact = (values) => ({
  phone: '',
  note: '',
  archived: false,
  ...values,
  name: values.name.trim(),
  key: contactKey(values.name),
});

/** Every txn leaving the server carries its derived own part. */
export function txnOut(txn) {
  if (!txn) return null;
  const result = { ...txn, ownMinor: ownMinor(txn) };
  delete result.sourceKeys;
  return result;
}

const newest = (a, b) =>
  b.date.localeCompare(a.date) ||
  (b.time ?? '').localeCompare(a.time ?? '') ||
  String(b.id).localeCompare(String(a.id));
const oldest = (a, b) => -newest(a, b);
const ownPart = (txn) =>
  Math.max(0, Math.min(txn.amountMinor, txn.amountMinor - txn.peerShareMinor));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const categoryFits = (category, direction) =>
  direction === 'debit' ? expenseCategories.includes(category) : true;
const isDuplicateKey = (error) => error?.code === 11000;

export function createMoneyService({ store, now = () => new Date() }) {
  const today = () => toDay(now());
  const audit = (
    userId,
    entity,
    entityId,
    action,
    before = null,
    after = null,
  ) =>
    store.create('audit', userId, {
      entity,
      entityId: String(entityId),
      action,
      before,
      after,
    });

  // ---------- lookups ----------
  const notFound = (message) => {
    throw new ApiError(404, message);
  };
  async function getTxn(userId, id) {
    const txn = await store.find('txns', userId, id);
    return txn && !txn.deleted ? txn : notFound('Transaction not found.');
  }
  const getAccount = async (userId, id) =>
    (await store.find('accounts', userId, id)) ??
    notFound('Account not found.');
  const getContact = async (userId, id) =>
    (await store.find('contacts', userId, id)) ??
    notFound('Person not found in Khata.');
  const getEntry = async (userId, id) =>
    (await store.find('entries', userId, id)) ??
    notFound('Khata entry not found.');
  const getAdjustment = async (userId, id) =>
    (await store.find('adjustments', userId, id)) ??
    notFound('Adjustment not found.');
  const liveTxns = (userId, filter = {}) =>
    store.list('txns', userId, { ...filter, deleted: { $ne: true } });

  async function resolveContact(userId, { contactId, name }) {
    if (contactId) return getContact(userId, contactId);
    const clean = contactName(name || 'Friend') || 'Friend';
    const key = contactKey(clean);
    const existing = await store.findOne('contacts', userId, { key });
    if (existing) return existing;
    try {
      return await store.create(
        'contacts',
        userId,
        newContact({ name: clean }),
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return store.findOne('contacts', userId, { key });
    }
  }

  // ---------- merchant memory ----------
  async function recallMerchant(userId, key, rawName) {
    if (!key) return null;
    const exact = await store.findOne('merchants', userId, { key });
    if (exact) return { memory: exact, exact: true };
    const match = matchMerchant(
      rawName,
      null,
      await store.list('merchants', userId),
    );
    return match?.autoApply ? { memory: match.candidate, exact: false } : null;
  }
  async function learnMerchant(userId, txn) {
    if (!txn.merchantKey || txn.isTransfer || txn.source === 'khata') return;
    const values = {
      title: txn.title,
      category: txn.category,
      isPerson: txn.isPerson,
    };
    const existing = await store.findOne('merchants', userId, {
      key: txn.merchantKey,
    });
    if (existing) return store.update('merchants', userId, existing.id, values);
    try {
      await store.create('merchants', userId, {
        key: txn.merchantKey,
        ...values,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }

  // ---------- people answers ----------
  async function clearPeer(userId, txn) {
    await store.removeMany('entries', userId, {
      linkedTxnId: txn.id,
      paidForMe: { $ne: true },
    });
    return store.update('txns', userId, txn.id, {
      peerTag: null,
      peerShareMinor: 0,
      splitPeople: null,
      contactId: null,
    });
  }

  async function applyPeer(
    userId,
    txn,
    tag,
    { contactId, contactName: name, splitPeople } = {},
  ) {
    if (txn.source === 'khata')
      throw new ApiError(
        400,
        'This payment was made from Khata. Change it there.',
      );
    if (tag && !peerFits(tag, txn.direction))
      throw new ApiError(
        400,
        txn.direction === 'debit'
          ? 'That answer is for money that came in.'
          : 'That answer is for money that went out.',
      );
    if (tag === 'split' && !(splitPeople >= 2 && splitPeople <= 6))
      throw new ApiError(400, 'Choose 2 to 6 people for a split.');
    if (contactId) await getContact(userId, contactId);
    let current = await clearPeer(userId, txn);
    if (!tag) {
      await audit(userId, 'txn', txn.id, 'peer_cleared', {
        peerTag: txn.peerTag,
      });
      return current;
    }
    const credit = txn.direction === 'credit';
    const outcome = peerOutcome(tag, txn.amountMinor, {
      people: splitPeople,
      credit,
    });
    let contact = null;
    if (outcome.khataDirection && outcome.khataMinor > 0) {
      contact = await resolveContact(userId, {
        contactId,
        name: name || txn.counterparty || txn.title,
      });
      await store.create(
        'entries',
        userId,
        newEntry({
          contactId: contact.id,
          direction: outcome.khataDirection,
          amountMinor: outcome.khataMinor,
          date: txn.date,
          note: peerNote(tag, { people: splitPeople, credit }),
          linkedTxnId: txn.id,
        }),
      );
    } else if (contactId) contact = await getContact(userId, contactId);
    const patch = {
      peerTag: tag,
      peerShareMinor: outcome.peerShareMinor,
      splitPeople: tag === 'split' ? splitPeople : null,
      contactId: contact?.id ?? null,
    };
    // A waiting claim can never be more than what is still mine.
    if (current.reimburseTag === 'claim' && !current.reimbursedById) {
      const mine = Math.max(0, current.amountMinor - outcome.peerShareMinor);
      if (current.reimburseMinor > mine) patch.reimburseMinor = mine;
    }
    current = await store.update('txns', userId, txn.id, patch);
    await audit(userId, 'txn', txn.id, 'peer_answer', null, {
      peerTag: tag,
      peerShareMinor: outcome.peerShareMinor,
    });
    return current;
  }

  /** Someone else's card: every payment on it means "I owe <owner>" (still my spending). */
  async function applyOwner(userId, txn, account) {
    if (!account?.ownerName || txn.peerTag || txn.isTransfer) return txn;
    if (txn.status !== 'cleared' || txn.source === 'khata') return txn;
    return applyPeer(userId, txn, 'owe_owner', {
      contactName: account.ownerName,
    });
  }

  async function ownerChanged(userId, account, previousOwner) {
    if (previousOwner) {
      const tagged = await liveTxns(userId, {
        accountId: account.id,
        peerTag: 'owe_owner',
      });
      for (const txn of tagged) await clearPeer(userId, txn);
    }
    if (account.ownerName) {
      const open = await liveTxns(userId, {
        accountId: account.id,
        peerTag: null,
      });
      for (const txn of open) await applyOwner(userId, txn, account);
    }
  }

  // ---------- balances ----------
  async function balanceOf(userId, account, until) {
    const txns = await liveTxns(userId, { accountId: account.id });
    // A txn without a time counts from the start of its day.
    const used = until
      ? txns.filter((txn) => stamp(txn.date, txn.time ?? '00:00') <= until)
      : txns;
    return accountBalance(account.openingMinor, used);
  }

  /** Moves openingMinor so the balance equals the bank's figure. Transactions never change. */
  async function matchBank(userId, account, auto = false) {
    if (
      account.bankBalanceMinor === null ||
      account.bankBalanceMinor === undefined
    )
      throw new ApiError(400, 'There is no bank balance to match yet.');
    const at = account.bankBalanceAt
      ? new Date(account.bankBalanceAt).getTime()
      : undefined;
    const delta =
      account.bankBalanceMinor - (await balanceOf(userId, account, at));
    if (delta === 0) return account;
    const updated = await store.update('accounts', userId, account.id, {
      openingMinor: account.openingMinor + delta,
    });
    await audit(
      userId,
      'account',
      account.id,
      auto ? 'auto_match_bank_balance' : 'match_bank_balance',
      { openingMinor: account.openingMinor },
      { openingMinor: updated.openingMinor, deltaMinor: delta },
    );
    return updated;
  }

  async function bankSaid(userId, accountId, bankMinor, atMs) {
    const account = await store.find('accounts', userId, accountId);
    if (!account || account.type === 'credit_card') return;
    const updated = await store.update('accounts', userId, account.id, {
      bankBalanceMinor: bankMinor,
      bankBalanceAt: new Date(atMs).toISOString(),
    });
    if (updated.followBank) await matchBank(userId, updated, true);
  }

  function accountOut(account, txns, day) {
    const mine = txns.filter((txn) => txn.accountId === account.id);
    const balanceMinor = accountBalance(account.openingMinor, mine);
    let card = null;
    if (account.type === 'credit_card') {
      const hasBill = account.billMinor > 0;
      const statement = lastStatementDate(account.statementDay, day);
      const summary = summariseCard({
        ledgerBalanceMinor: balanceMinor,
        settings: {
          creditLimitMinor: account.creditLimitMinor,
          statementDay: account.statementDay,
          dueDay: account.dueDate ? Number(account.dueDate.slice(8, 10)) : null,
          lastStatementMinor: hasBill ? account.billMinor : null,
          lastMinDueMinor: hasBill ? account.minDueMinor || null : null,
          lastStatementAt: hasBill
            ? (statement ??
              (account.dueDate ? addDays(account.dueDate, -20) : null))
            : null,
          lastDueDate: account.dueDate,
          billPaidAt: account.billPaidAt,
        },
        txns: mine
          .filter((txn) => counts(txn) && txn.date >= addDays(day, -70))
          .map((txn) => ({
            amountMinor: txn.amountMinor,
            isCredit: txn.direction === 'credit',
            date: txn.date,
          })),
        now: day,
      });
      card = {
        outstanding: summary.outstandingMinor,
        available: summary.availableMinor,
        usagePct: summary.usagePct,
        cycleSpendMinor: summary.cycleSpendMinor,
        daysToDue: summary.daysToDue,
        overdue: summary.dueState === 'overdue',
        billMinor: summary.billMinor,
        minDueMinor: summary.minDueMinor,
        dueDate: summary.dueDate,
        dueState: summary.dueState,
        nextStatementDate: summary.nextStatementDate,
        advice: cardAdvice(summary),
      };
    }
    return {
      ...account,
      balanceMinor,
      bankSaidMinor: account.bankBalanceMinor ?? null,
      card,
    };
  }

  // ---------- transactions ----------
  async function createTxn(userId, values) {
    try {
      return {
        txn: await store.create('txns', userId, newTxn(values)),
        created: true,
      };
    } catch (error) {
      if (!isDuplicateKey(error) || !values.sourceKey) throw error;
      return {
        txn: await store.findOne('txns', userId, {
          sourceKeys: values.sourceKey,
        }),
        created: false,
      };
    }
  }

  async function addTxn(userId, values) {
    const { clientKey, ...rest } = values;
    const account = rest.accountId
      ? await getAccount(userId, rest.accountId)
      : null;
    const sourceKey = clientKey ? `manual:${clientKey}` : undefined;
    if (sourceKey) {
      const existing = await store.findOne('txns', userId, {
        sourceKeys: sourceKey,
      });
      if (existing) return { txn: existing, created: false };
    }
    const merchantKey = normalizeMerchant(rest.counterparty || rest.title);
    const recalled = rest.category
      ? null
      : await recallMerchant(userId, merchantKey, rest.title);
    const remembered = recalled?.memory.category;
    const result = await createTxn(userId, {
      ...rest,
      category:
        rest.category ??
        (remembered && categoryFits(remembered, rest.direction)
          ? remembered
          : defaultCategory(rest.direction)),
      source: 'manual',
      sourceKey,
      merchantKey,
      isPerson:
        rest.channel !== 'Card' &&
        looksLikePerson(rest.counterparty || rest.title),
    });
    if (!result.created) return result;
    if (rest.category) await learnMerchant(userId, result.txn);
    return {
      txn: await applyOwner(userId, result.txn, account),
      created: true,
    };
  }

  async function patchTxn(userId, id, patch) {
    const txn = await getTxn(userId, id);
    if (patch.accountId) await getAccount(userId, patch.accountId);
    const amountChanged =
      patch.amountMinor !== undefined && patch.amountMinor !== txn.amountMinor;
    if (
      amountChanged &&
      (txn.reimburseTag === 'received' || txn.reimbursedById)
    )
      throw new ApiError(
        400,
        'Undo the reimbursement before changing the amount.',
      );
    if (amountChanged && txn.transferId)
      throw new ApiError(
        400,
        'Unlink the transfer before changing the amount.',
      );
    let updated = await store.update('txns', userId, id, patch);
    if (txn.source === 'khata') {
      const entry = await store.findOne('entries', userId, {
        linkedTxnId: id,
        paidForMe: true,
      });
      if (entry)
        await store.update('entries', userId, entry.id, {
          amountMinor: updated.amountMinor,
          date: updated.date,
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        });
    } else if (amountChanged && txn.peerTag)
      updated = await applyPeer(userId, updated, txn.peerTag, {
        contactId: txn.contactId,
        splitPeople: txn.splitPeople,
      });
    if (
      amountChanged &&
      updated.reimburseTag === 'claim' &&
      updated.reimburseMinor > ownPart(updated)
    )
      updated = await store.update('txns', userId, id, {
        reimburseMinor: ownPart(updated),
      });
    if (
      patch.accountId &&
      patch.accountId !== txn.accountId &&
      !updated.peerTag
    )
      updated = await applyOwner(
        userId,
        updated,
        await getAccount(userId, patch.accountId),
      );
    if (patch.category !== undefined || patch.title !== undefined)
      await learnMerchant(userId, updated);
    return updated;
  }

  async function undoReceived(userId, credit) {
    const claims = await store.list('txns', userId, {
      reimbursedById: credit.id,
    });
    for (const claim of claims)
      await store.update('txns', userId, claim.id, {
        reimburseMinor: ownPart(claim),
        reimbursedById: null,
      });
    await audit(userId, 'txn', credit.id, 'reimburse_received_undo', {
      reimburseMinor: credit.reimburseMinor,
    });
    return store.update('txns', userId, credit.id, {
      reimburseTag: null,
      reimburseMinor: 0,
    });
  }

  async function deleteTxn(userId, id) {
    const txn = await getTxn(userId, id);
    if (txn.reimburseTag === 'received') await undoReceived(userId, txn);
    if (txn.reimburseTag === 'claim' && txn.reimbursedById) {
      const credit = await store.find('txns', userId, txn.reimbursedById);
      if (credit) await undoReceived(userId, credit);
    }
    if (txn.transferId) {
      const partners = await store.list('txns', userId, {
        transferId: txn.transferId,
      });
      for (const partner of partners.filter((row) => row.id !== id))
        await store.update('txns', userId, partner.id, {
          isTransfer: false,
          transferId: null,
          needsReview: true,
        });
    }
    await store.updateMany(
      'txns',
      userId,
      { refundOfId: id },
      { refundOfId: null },
    );
    await store.updateMany(
      'txns',
      userId,
      { possibleDuplicateOf: id },
      { possibleDuplicateOf: null },
    );
    await store.removeMany('entries', userId, { linkedTxnId: id });
    await store.removeMany('photos', userId, { ownerType: 'txn', ownerId: id });
    // Bank captures stay as hidden rows so the same SMS never comes back; khata ones go.
    if (txn.source === 'khata') await store.remove('txns', userId, id);
    else
      await store.update('txns', userId, id, {
        deleted: true,
        needsReview: false,
      });
    await audit(userId, 'txn', id, 'delete', {
      date: txn.date,
      amountMinor: txn.amountMinor,
      direction: txn.direction,
      source: txn.source,
    });
  }

  async function listTxns(userId, query) {
    const filter = {};
    for (const field of [
      'category',
      'accountId',
      'direction',
      'source',
      'status',
    ])
      if (query[field]) filter[field] = query[field];
    if (query.from || query.to)
      filter.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    if (query.review) filter.needsReview = true;
    if (query.left) filter.peerTag = 'left';
    let rows = (await liveTxns(userId, filter)).sort(newest);
    if (query.q) {
      const needle = query.q.toLowerCase();
      rows = rows.filter((txn) =>
        [txn.title, txn.counterparty, txn.note, txn.category, txn.purpose]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
    if (query.cursor) {
      let after;
      try {
        after = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8'),
        );
      } catch {
        throw new ApiError(
          400,
          'This page link is not valid. Reload the list.',
        );
      }
      const marker = {
        date: String(after.d),
        time: after.t ?? null,
        id: String(after.i),
      };
      rows = rows.filter((txn) => newest(marker, txn) < 0);
    }
    const limit = query.limit ?? 100;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(txnOut),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ d: last.date, t: last.time, i: last.id }),
            ).toString('base64url')
          : null,
    };
  }

  // ---------- phone capture ----------
  async function accountForCapture(userId, item, accounts) {
    if (!item.last4) return null;
    const bank = item.bank?.trim().toLowerCase();
    const same = accounts.filter(
      (account) => account.last4 === item.last4 && !account.archived,
    );
    const bankMatches = (account) => {
      const own = account.bank.trim().toLowerCase();
      return own && bank && (own.includes(bank) || bank.includes(own));
    };
    const found =
      same.find(bankMatches) ??
      same.find((account) => !account.bank.trim()) ??
      (bank ? null : same[0]);
    if (found) return found;
    const created = await store.create(
      'accounts',
      userId,
      newAccount({
        name: `${item.bank?.trim() || 'Account'} ••${item.last4}`,
        type: item.accountType ?? 'savings',
        bank: item.bank?.trim() ?? '',
        last4: item.last4,
        needsConfirm: true,
      }),
    );
    accounts.push(created);
    return created;
  }

  async function linkPair(userId, a, b) {
    if (a.id === b.id)
      throw new ApiError(400, 'Choose two different transactions.');
    if (a.amountMinor !== b.amountMinor || a.direction === b.direction)
      throw new ApiError(
        400,
        'A transfer needs one debit and one credit of the same amount.',
      );
    if (a.accountId && a.accountId === b.accountId)
      throw new ApiError(400, 'Both sides are in the same account.');
    for (const txn of [a, b]) if (txn.peerTag) await clearPeer(userId, txn);
    const transferId = randomBytes(8).toString('hex');
    const patch = { isTransfer: true, transferId, needsReview: false };
    const first = await store.update('txns', userId, a.id, patch);
    const second = await store.update('txns', userId, b.id, patch);
    await audit(userId, 'txn', a.id, 'link_transfer', null, {
      otherId: b.id,
      transferId,
    });
    return [first, second];
  }

  async function ingestOne(userId, item, accounts) {
    const known = await store.findOne('txns', userId, {
      sourceKeys: item.sourceKey,
    });
    if (known) return { status: 'duplicate', txn: txnOut(known) };
    const account = await accountForCapture(userId, item, accounts);
    const atMs = stamp(item.date, item.time);
    const candidates = await liveTxns(userId, {
      amountMinor: item.amountMinor,
      direction: item.direction,
    });
    const duplicate = findDuplicate(item, candidates);
    if (duplicate.kind === 'exact' || duplicate.kind === 'cross_source') {
      const first = duplicate.match;
      const patch = {
        sources: [...new Set([...(first.sources ?? []), item.source])],
        sourceKeys: [...new Set([...(first.sourceKeys ?? []), item.sourceKey])],
      };
      for (const field of [
        'utr',
        'time',
        'last4',
        'bank',
        'counterparty',
        'sourceApp',
      ])
        if (!first[field] && item[field]) patch[field] = item[field];
      if (!first.accountId && account) patch.accountId = account.id;
      const merged = await store.update('txns', userId, first.id, patch);
      if (item.availableBalanceMinor != null && account)
        await bankSaid(userId, account.id, item.availableBalanceMinor, atMs);
      return { status: 'merged', txn: txnOut(merged) };
    }
    const counterparty = item.counterparty?.trim() ?? '';
    const title =
      item.title?.trim() ||
      (counterparty ? displayName(counterparty) : '') ||
      (item.direction === 'credit' ? 'Money received' : 'Payment');
    const merchantKey = normalizeMerchant(counterparty || title);
    const recalled = await recallMerchant(
      userId,
      merchantKey,
      counterparty || title,
    );
    const remembered = recalled?.memory.category;
    const isPerson =
      recalled?.memory.isPerson ??
      (item.channel !== 'Card' &&
        looksLikePerson(
          counterparty.includes('@') ? '' : counterparty || title,
          {
            upiId: counterparty.includes('@') ? counterparty : undefined,
          },
        ));
    const result = await createTxn(userId, {
      date: item.date,
      time: item.time ?? null,
      amountMinor: item.amountMinor,
      direction: item.direction,
      title:
        recalled?.exact && recalled.memory.title
          ? recalled.memory.title
          : title,
      category:
        remembered && categoryFits(remembered, item.direction)
          ? remembered
          : defaultCategory(item.direction),
      channel: item.channel ?? 'Other',
      accountId: account?.id ?? null,
      status: item.status ?? 'cleared',
      needsReview: item.confidence < 0.7 || duplicate.kind === 'possible',
      source: item.source,
      sourceKey: item.sourceKey,
      utr: item.utr || null,
      sourceApp: item.sourceApp ?? '',
      bank: item.bank ?? '',
      last4: item.last4 ?? '',
      counterparty,
      counterpartyLast4: item.counterpartyLast4 ?? '',
      merchantKey,
      isPerson: Boolean(isPerson),
      confidence: item.confidence,
      possibleDuplicateOf:
        duplicate.kind === 'possible' ? duplicate.match.id : null,
    });
    if (!result.created)
      return { status: 'duplicate', txn: txnOut(result.txn) };
    let txn = result.txn;
    if (txn.accountId) {
      const others = await liveTxns(userId, {
        amountMinor: txn.amountMinor,
        direction: txn.direction === 'debit' ? 'credit' : 'debit',
      });
      const partner = findTransferPartner(
        txn,
        others,
        accounts.map((entry) => entry.last4),
      );
      if (partner?.autoLink) [txn] = await linkPair(userId, txn, partner.match);
    }
    if (!txn.isTransfer) txn = await applyOwner(userId, txn, account);
    if (item.availableBalanceMinor != null && account)
      await bankSaid(userId, account.id, item.availableBalanceMinor, atMs);
    return { status: 'created', txn: txnOut(txn) };
  }

  async function ingest(userId, items) {
    const accounts = await store.list('accounts', userId);
    const results = [];
    for (const item of items)
      results.push(await ingestOne(userId, item, accounts));
    return results;
  }

  // ---------- transfers ----------
  async function linkTransfer(userId, id, otherId) {
    const [a, b] = await Promise.all([
      getTxn(userId, id),
      getTxn(userId, otherId),
    ]);
    if (a.transferId || b.transferId)
      throw new ApiError(409, 'One of these is already linked as a transfer.');
    return linkPair(userId, a, b);
  }
  async function markUntracked(userId, id) {
    const txn = await getTxn(userId, id);
    if (txn.peerTag) await clearPeer(userId, txn);
    return store.update('txns', userId, id, {
      isTransfer: true,
      transferId: null,
      needsReview: false,
    });
  }
  async function unlinkTransfer(userId, id) {
    const txn = await getTxn(userId, id);
    const rows = txn.transferId
      ? await store.list('txns', userId, { transferId: txn.transferId })
      : [txn];
    for (const row of rows)
      await store.update('txns', userId, row.id, {
        isTransfer: false,
        transferId: null,
      });
    await audit(userId, 'txn', id, 'unlink_transfer');
    return store.find('txns', userId, id);
  }
  async function transferSuggestions(userId) {
    const since = addDays(today(), -90);
    const accounts = await store.list('accounts', userId);
    const owned = accounts.map((account) => account.last4);
    const txns = (await liveTxns(userId, { date: { $gte: since } })).filter(
      (txn) => !txn.isTransfer && txn.accountId && txn.status !== 'failed',
    );
    const credits = txns.filter((txn) => txn.direction === 'credit');
    const pairs = [];
    for (const debit of txns.filter((txn) => txn.direction === 'debit')) {
      const partner = findTransferPartner(debit, credits, owned);
      if (partner)
        pairs.push({
          a: debit,
          b: partner.match,
          score: partner.score,
          reasons: partner.reasons,
        });
    }
    pairs.sort((x, y) => y.score - x.score);
    const used = new Set();
    const items = [];
    for (const pair of pairs) {
      if (used.has(pair.a.id) || used.has(pair.b.id)) continue;
      used.add(pair.a.id);
      used.add(pair.b.id);
      items.push({ ...pair, a: txnOut(pair.a), b: txnOut(pair.b) });
    }
    return items;
  }

  // ---------- refunds ----------
  async function setRefundOf(userId, id, originalId) {
    const txn = await getTxn(userId, id);
    if (txn.direction !== 'credit')
      throw new ApiError(400, 'Only money that came in can be a refund.');
    if (originalId === null)
      return store.update('txns', userId, id, { refundOfId: null });
    const original = await getTxn(userId, originalId);
    if (original.direction !== 'debit' || original.id === txn.id)
      throw new ApiError(400, 'Choose the payment that was refunded.');
    return store.update('txns', userId, id, {
      refundOfId: original.id,
      category: original.category,
    });
  }

  // ---------- reimbursements ----------
  async function claim(userId, id, amountMinor) {
    const txn = await getTxn(userId, id);
    if (txn.direction !== 'debit')
      throw new ApiError(400, 'Only money paid out can be claimed back.');
    if (txn.isTransfer)
      throw new ApiError(
        400,
        'A transfer between your accounts cannot be claimed.',
      );
    if (txn.reimbursedById)
      throw new ApiError(
        409,
        'This claim was already paid back. Undo that first.',
      );
    const own = ownPart(txn);
    const amount = Math.min(amountMinor ?? own, own);
    if (amount <= 0)
      throw new ApiError(400, 'Nothing of this payment is yours to claim.');
    const updated = await store.update('txns', userId, id, {
      reimburseTag: 'claim',
      reimburseMinor: amount,
    });
    await audit(userId, 'txn', id, 'reimburse_claim', null, {
      reimburseMinor: amount,
    });
    return updated;
  }
  async function unclaim(userId, id) {
    const txn = await getTxn(userId, id);
    if (txn.reimburseTag !== 'claim')
      throw new ApiError(400, 'This payment is not a claim.');
    if (txn.reimbursedById) {
      const credit = await store.find('txns', userId, txn.reimbursedById);
      if (credit) await undoReceived(userId, credit);
    }
    await audit(userId, 'txn', id, 'reimburse_claim_removed');
    return store.update('txns', userId, id, {
      reimburseTag: null,
      reimburseMinor: 0,
      reimbursedById: null,
    });
  }
  async function reimbursePlan(userId, credit, claimIds) {
    if (credit.direction !== 'credit')
      throw new ApiError(400, 'Only money that came in can pay claims back.');
    const rows = await liveTxns(userId, { id: { $in: claimIds } });
    const claims = rows
      .filter(
        (row) =>
          row.reimburseTag === 'claim' &&
          (!row.reimbursedById || row.reimbursedById === credit.id),
      )
      .sort(oldest);
    if (!claims.length)
      throw new ApiError(
        400,
        'Choose at least one payment you are waiting for.',
      );
    const wanted = (row) =>
      row.reimbursedById ? ownPart(row) : row.reimburseMinor;
    const split = allocate(
      ownPart(credit),
      claims.map((row) => ({ id: row.id, amountMinor: wanted(row) })),
    );
    return { claims, split };
  }
  async function previewReceived(userId, id, claimIds) {
    const { split } = await reimbursePlan(
      userId,
      await getTxn(userId, id),
      claimIds,
    );
    return split;
  }
  async function markReceived(userId, id, claimIds) {
    let credit = await getTxn(userId, id);
    await reimbursePlan(userId, credit, claimIds);
    if (credit.reimburseTag === 'received')
      credit = await undoReceived(userId, credit);
    const { claims, split } = await reimbursePlan(userId, credit, claimIds);
    for (const row of claims)
      await store.update('txns', userId, row.id, {
        reimburseMinor: split.covered[row.id] ?? 0,
        reimbursedById: credit.id,
      });
    credit = await store.update('txns', userId, credit.id, {
      reimburseTag: 'received',
      reimburseMinor: split.matchedMinor,
    });
    await audit(userId, 'txn', credit.id, 'reimburse_received', null, {
      claims: claims.map((row) => row.id),
      matchedMinor: split.matchedMinor,
      extraMinor: split.extraMinor,
    });
    return { ...split, txn: credit };
  }
  async function unmarkReceived(userId, id) {
    const credit = await getTxn(userId, id);
    if (credit.reimburseTag !== 'received')
      throw new ApiError(400, 'This money is not marked as a reimbursement.');
    return undoReceived(userId, credit);
  }
  async function reimbursements(userId) {
    const claims = await liveTxns(userId, { reimburseTag: 'claim' });
    const ids = claims.map((row) => row.id);
    const entries = ids.length
      ? await store.list('entries', userId, { linkedTxnId: { $in: ids } })
      : [];
    const contacts = new Map(
      (await store.list('contacts', userId)).map((contact) => [
        contact.id,
        contact.name,
      ]),
    );
    const payerIds = [
      ...new Set(claims.map((row) => row.reimbursedById).filter(Boolean)),
    ];
    const payers = new Map(
      (payerIds.length
        ? await store.list('txns', userId, { id: { $in: payerIds } })
        : []
      ).map((row) => [row.id, row]),
    );
    const items = claims
      .sort(newest)
      .map((row) => {
        const entry = entries.find((item) => item.linkedTxnId === row.id);
        return {
          txn: txnOut(row),
          payBackTo:
            row.peerTag === 'owe_owner'
              ? (contacts.get(entry?.contactId ?? row.contactId) ?? null)
              : null,
          paidBy: row.reimbursedById
            ? txnOut(payers.get(row.reimbursedById) ?? null)
            : null,
          waiting: !row.reimbursedById,
        };
      })
      .sort((a, b) => Number(b.waiting) - Number(a.waiting));
    return {
      waitingMinor: sum(
        items
          .filter((item) => item.waiting)
          .map((item) => item.txn.reimburseMinor),
      ),
      items,
    };
  }

  // ---------- accounts ----------
  async function listAccounts(userId) {
    const [accounts, txns] = await Promise.all([
      store.list('accounts', userId),
      liveTxns(userId),
    ]);
    const day = today();
    return accounts
      .sort(
        (a, b) =>
          Number(a.archived) - Number(b.archived) ||
          a.name.localeCompare(b.name),
      )
      .map((account) => accountOut(account, txns, day));
  }
  async function accountView(userId, account) {
    return accountOut(
      account,
      await liveTxns(userId, { accountId: account.id }),
      today(),
    );
  }
  async function createAccount(userId, values) {
    const account = await store.create('accounts', userId, newAccount(values));
    if (account.ownerName) await ownerChanged(userId, account, null);
    return accountView(userId, account);
  }
  async function patchAccount(userId, id, patch) {
    const before = await getAccount(userId, id);
    const account = await store.update('accounts', userId, id, patch);
    if (
      'ownerName' in patch &&
      (patch.ownerName ?? null) !== (before.ownerName ?? null)
    )
      await ownerChanged(userId, account, before.ownerName);
    if (
      patch.followBank === true &&
      !before.followBank &&
      account.bankBalanceMinor !== null
    )
      return accountView(userId, await matchBank(userId, account, true));
    return accountView(userId, account);
  }
  async function deleteAccount(userId, id) {
    await getAccount(userId, id);
    await store.updateMany(
      'txns',
      userId,
      { accountId: id },
      { accountId: null },
    );
    await store.remove('accounts', userId, id);
    await audit(userId, 'account', id, 'delete');
  }
  async function matchBankBalance(userId, id) {
    return accountView(
      userId,
      await matchBank(userId, await getAccount(userId, id)),
    );
  }
  async function billPaid(userId, id, date) {
    const account = await getAccount(userId, id);
    if (account.type !== 'credit_card')
      throw new ApiError(400, 'Only a credit card has a bill.');
    return accountView(
      userId,
      await store.update('accounts', userId, id, {
        billPaidAt: date ?? today(),
      }),
    );
  }

  // ---------- khata ----------
  function contactRow(contact, entries, adjustments, day) {
    const balance = khataBalance(entries, adjustments);
    let lastDate = null;
    let nextDue = null;
    for (const entry of entries) {
      if (!lastDate || entry.date > lastDate) lastDate = entry.date;
      if (
        balance.adjustedMinor !== 0 &&
        entry.dueDate &&
        entry.dueDate >= addDays(day, -365) &&
        (!nextDue || entry.dueDate < nextDue)
      )
        nextDue = entry.dueDate;
    }
    return {
      contact,
      balance,
      lastDate,
      nextDue,
      overdue: Boolean(nextDue && nextDue < day),
    };
  }
  async function khataRows(userId) {
    const [contacts, entries, adjustments] = await Promise.all([
      store.list('contacts', userId),
      store.list('entries', userId),
      store.list('adjustments', userId),
    ]);
    const day = today();
    return contacts
      .filter((contact) => !contact.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((contact) =>
        contactRow(
          contact,
          entries.filter((entry) => entry.contactId === contact.id),
          adjustments.filter((item) => item.contactId === contact.id),
          day,
        ),
      );
  }
  async function khataOverview(userId) {
    const rows = await khataRows(userId);
    const { owedToMeMinor, iOweMinor } = khataSummary(
      rows.map((row) => row.balance.adjustedMinor),
    );
    const left = (await liveTxns(userId, { peerTag: 'left' }))
      .sort(newest)
      .map(txnOut);
    return { owedToMeMinor, iOweMinor, contacts: rows, left };
  }
  async function contactDetail(userId, id) {
    const contact = await getContact(userId, id);
    const [entries, adjustments, photos] = await Promise.all([
      store.list('entries', userId, { contactId: id }),
      store.list('adjustments', userId, { contactId: id }),
      store.list(
        'photos',
        userId,
        { ownerType: 'khata_contact', ownerId: id },
        { exclude: ['data'] },
      ),
    ]);
    return {
      contact,
      balance: khataBalance(entries, adjustments),
      entries: ledgerRows(entries),
      adjustments: adjustments.sort((a, b) =>
        String(b.id).localeCompare(String(a.id)),
      ),
      photos: photos.map((photo) => ({
        id: photo.id,
        caption: photo.caption,
        mime: photo.mime,
        createdAt: photo.createdAt,
      })),
    };
  }
  async function createContact(userId, values) {
    try {
      return await store.create('contacts', userId, newContact(values));
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw new ApiError(
        409,
        `${values.name.trim()} is already in your Khata.`,
      );
    }
  }
  async function patchContact(userId, id, patch) {
    await getContact(userId, id);
    const values = { ...patch };
    if (patch.name) {
      values.name = patch.name.trim();
      values.key = contactKey(patch.name);
    }
    try {
      return await store.update('contacts', userId, id, values);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw new ApiError(409, `${values.name} is already in your Khata.`);
    }
  }
  async function releaseTxn(userId, txnId) {
    if (await store.count('entries', userId, { linkedTxnId: txnId })) return;
    const txn = await store.find('txns', userId, txnId);
    if (txn && txn.source !== 'khata')
      await store.update('txns', userId, txnId, {
        peerTag: null,
        peerShareMinor: 0,
        splitPeople: null,
        contactId: null,
      });
  }
  async function deleteContact(userId, id) {
    await getContact(userId, id);
    const entries = await store.list('entries', userId, { contactId: id });
    await store.removeMany('entries', userId, { contactId: id });
    for (const entry of entries) {
      if (!entry.linkedTxnId) continue;
      if (entry.paidForMe) await removeKhataTxn(userId, entry.linkedTxnId);
      else await releaseTxn(userId, entry.linkedTxnId);
    }
    await store.updateMany(
      'txns',
      userId,
      { contactId: id },
      { contactId: null },
    );
    await store.removeMany('adjustments', userId, { contactId: id });
    await store.removeMany('photos', userId, {
      ownerType: 'khata_contact',
      ownerId: id,
    });
    await store.remove('contacts', userId, id);
    await audit(userId, 'khata_contact', id, 'delete', null, {
      entries: entries.length,
    });
  }
  async function removeKhataTxn(userId, txnId) {
    const txn = await store.find('txns', userId, txnId);
    if (txn && !txn.deleted) await deleteTxn(userId, txnId);
  }

  async function addEntry(userId, contactId, values) {
    const contact = await getContact(userId, contactId);
    const { paidForMe = false, category, ...fields } = values;
    if (paidForMe && fields.direction !== 'got')
      throw new ApiError(400, '"Paid for me" works only with "You got".');
    let linkedTxnId = null;
    if (paidForMe) {
      const { txn } = await createTxn(userId, {
        date: fields.date,
        amountMinor: fields.amountMinor,
        direction: 'debit',
        title: fields.note || `Paid by ${contact.name}`,
        category: category ?? 'Other',
        note: fields.note ?? '',
        source: 'khata',
        merchantKey: '',
        peerTag: 'owe_owner',
        contactId: contact.id,
      });
      linkedTxnId = txn.id;
    }
    const entry = await store.create(
      'entries',
      userId,
      newEntry({ ...fields, contactId: contact.id, linkedTxnId, paidForMe }),
    );
    await audit(userId, 'khata_entry', entry.id, 'create', null, {
      direction: entry.direction,
      amountMinor: entry.amountMinor,
      paidForMe,
    });
    return entry;
  }
  async function patchEntry(userId, id, patch) {
    const entry = await getEntry(userId, id);
    const { category, ...fields } = patch;
    const fromPayment = entry.linkedTxnId && !entry.paidForMe;
    if (
      fromPayment &&
      (fields.amountMinor !== undefined || fields.direction !== undefined)
    )
      throw new ApiError(
        400,
        'This line comes from a payment. Change the payment instead.',
      );
    if (entry.paidForMe && fields.direction && fields.direction !== 'got')
      throw new ApiError(400, '"Paid for me" works only with "You got".');
    const updated = await store.update('entries', userId, id, fields);
    if (entry.paidForMe && entry.linkedTxnId) {
      const txn = await store.find('txns', userId, entry.linkedTxnId);
      if (txn) {
        const contact = await store.find('contacts', userId, entry.contactId);
        const txnPatch = {
          amountMinor: updated.amountMinor,
          date: updated.date,
        };
        if (fields.note !== undefined) {
          txnPatch.note = fields.note;
          txnPatch.title = fields.note || `Paid by ${contact?.name ?? 'them'}`;
        }
        if (category) txnPatch.category = category;
        const next = await store.update('txns', userId, txn.id, txnPatch);
        if (
          next.reimburseTag === 'claim' &&
          !next.reimbursedById &&
          next.reimburseMinor > ownPart(next)
        )
          await store.update('txns', userId, txn.id, {
            reimburseMinor: ownPart(next),
          });
      }
    }
    await audit(
      userId,
      'khata_entry',
      id,
      'update',
      {
        amountMinor: entry.amountMinor,
        date: entry.date,
        direction: entry.direction,
      },
      {
        amountMinor: updated.amountMinor,
        date: updated.date,
        direction: updated.direction,
      },
    );
    return updated;
  }
  async function deleteEntry(userId, id) {
    const entry = await getEntry(userId, id);
    await store.remove('entries', userId, id);
    if (entry.linkedTxnId) {
      if (entry.paidForMe) await removeKhataTxn(userId, entry.linkedTxnId);
      else await releaseTxn(userId, entry.linkedTxnId);
    }
    await audit(userId, 'khata_entry', id, 'delete', {
      direction: entry.direction,
      amountMinor: entry.amountMinor,
    });
  }
  async function addAdjustment(
    userId,
    contactId,
    { type, amountMinor, reduce, note },
  ) {
    await getContact(userId, contactId);
    const [entries, adjustments] = await Promise.all([
      store.list('entries', userId, { contactId }),
      store.list('adjustments', userId, { contactId }),
    ]);
    const balance = khataBalance(entries, adjustments);
    const deltaMinor = adjustmentDelta({
      currentMinor:
        balance.adjustedMinor === 0
          ? balance.actualMinor
          : balance.adjustedMinor,
      amountMinor,
      reduce: reduce ?? reducesByDefault(type),
    });
    const adjustment = await store.create('adjustments', userId, {
      contactId,
      type,
      deltaMinor,
      note: note ?? '',
      active: true,
    });
    await audit(userId, 'khata_adjustment', adjustment.id, 'create', null, {
      type,
      deltaMinor,
    });
    return adjustment;
  }
  async function patchAdjustment(userId, id, patch) {
    const before = await getAdjustment(userId, id);
    const updated = await store.update('adjustments', userId, id, patch);
    await audit(
      userId,
      'khata_adjustment',
      id,
      'update',
      { active: before.active },
      { active: updated.active },
    );
    return updated;
  }
  async function deleteAdjustment(userId, id) {
    await getAdjustment(userId, id);
    await store.remove('adjustments', userId, id);
    await audit(userId, 'khata_adjustment', id, 'delete');
  }
  /** "Swap who owes whom": flips typed / imported entries, never ones made from a payment. */
  async function swapContact(userId, id) {
    await getContact(userId, id);
    const entries = await store.list('entries', userId, {
      contactId: id,
      linkedTxnId: null,
    });
    for (const entry of entries)
      await store.update('entries', userId, entry.id, {
        direction: entry.direction === 'gave' ? 'got' : 'gave',
      });
    await audit(userId, 'khata_contact', id, 'swap_directions', null, {
      entries: entries.length,
    });
    return entries.length;
  }

  // ---------- old khata import ----------
  const lineOut = (line) => ({
    signedMinor: signedMinor(line),
    note: line.note,
    date: line.date,
  });
  function parseImport({ text, mode, today: day }) {
    const at = day ?? today();
    if (mode === 'person') {
      const lines = parseKhataText(text, { now: at });
      return { lines: lines.map(lineOut), totalMinor: totalMinor(lines) };
    }
    return {
      people: parseBulkKhata(text, { now: at }).map((person) => ({
        name: person.name,
        tag: person.tag,
        lines: person.lines.map(lineOut),
        linesMinor: linesMinor(person),
        statedMinor: person.statedMinor,
        fixMinor: fixMinor(person),
        choice: person.choice,
        plusTheyOwe: person.plusTheyOwe,
      })),
    };
  }
  async function saveImport(userId, { people, photoIds = [], today: day }) {
    const at = day ?? today();
    const photos = [];
    for (const photoId of photoIds) {
      const photo = await store.find('photos', userId, photoId);
      if (!photo)
        throw new ApiError(
          404,
          'One of the photos was not found. Add it again.',
        );
      photos.push(photo);
    }
    const saved = [];
    let entryCount = 0;
    for (const input of people) {
      if (input.choice === 'skip' || !input.name.trim()) continue;
      const person = {
        name: input.name.trim(),
        tag: input.tag ?? null,
        choice: input.choice,
        plusTheyOwe: input.plusTheyOwe,
        statedMinor: input.statedMinor ?? null,
        lines: input.lines
          .filter((line) => line.signedMinor !== 0)
          .map((line) => ({
            sign: line.signedMinor < 0 ? -1 : 1,
            amountMinor: Math.abs(line.signedMinor),
            note: line.note ?? '',
            date: line.date ?? null,
          })),
      };
      let contact = await store.findOne('contacts', userId, {
        key: contactKey(person.name),
      });
      contact ??= await createContact(userId, {
        name: person.name,
        note: person.tag ?? '',
      });
      for (const entry of openingEntries(person, at)) {
        await store.create(
          'entries',
          userId,
          newEntry({ ...entry, contactId: contact.id, isOpening: true }),
        );
        entryCount++;
      }
      for (const photo of photos) {
        if (!photo.ownerId && !photo.claimed) {
          await store.update('photos', userId, photo.id, {
            ownerType: 'khata_contact',
            ownerId: contact.id,
          });
          photo.claimed = true;
        } else {
          await store.create('photos', userId, {
            ownerType: 'khata_contact',
            ownerId: contact.id,
            mime: photo.mime,
            data: photo.data,
            caption: photo.caption,
          });
        }
      }
      saved.push({ id: contact.id, name: contact.name });
    }
    await audit(userId, 'khata_import', 'bulk', 'save', null, {
      people: saved.length,
      entries: entryCount,
    });
    return { people: saved.length, entries: entryCount, contacts: saved };
  }

  // ---------- photos ----------
  const signatures = {
    'image/jpeg': (bytes) =>
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': (bytes) =>
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': (bytes) =>
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP',
  };
  async function addPhoto(userId, { ownerType, ownerId, mime, data, caption }) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 === 1)
      throw new ApiError(400, 'Send the photo as base64 text.');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > PHOTO_MAX_BYTES)
      throw new ApiError(
        413,
        'Photos must be 1.5 MB or smaller. Make it smaller and try again.',
      );
    if (!signatures[mime](bytes))
      throw new ApiError(400, 'This file is not a JPEG, PNG or WebP picture.');
    if (ownerId) {
      if (ownerType === 'khata_contact') await getContact(userId, ownerId);
      else await getTxn(userId, ownerId);
    }
    const cutoff = now().getTime() - ORPHAN_PHOTO_MS;
    const orphans = await store.list(
      'photos',
      userId,
      { ownerId: null },
      { exclude: ['data'] },
    );
    for (const photo of orphans)
      if (new Date(photo.createdAt).getTime() < cutoff)
        await store.remove('photos', userId, photo.id);
    if ((await store.count('photos', userId)) >= MAX_PHOTOS)
      throw new ApiError(
        400,
        `You can keep ${MAX_PHOTOS} photos. Remove an old one first.`,
      );
    const photo = await store.create('photos', userId, {
      ownerType,
      ownerId: ownerId ?? null,
      mime,
      data: bytes.toString('base64'),
      caption: caption ?? '',
    });
    return { id: photo.id };
  }
  const getPhoto = async (userId, id) =>
    (await store.find('photos', userId, id)) ?? notFound('Photo not found.');
  async function deletePhoto(userId, id) {
    await getPhoto(userId, id);
    await store.remove('photos', userId, id);
  }

  // ---------- subscriptions, budgets, merchants ----------
  async function subscriptions(userId, txns) {
    const day = today();
    const since = addDays(day, -400);
    const rows = (txns ?? (await liveTxns(userId))).filter(
      (txn) =>
        txn.direction === 'debit' &&
        counts(txn) &&
        !txn.isTransfer &&
        txn.date >= since &&
        txn.peerShareMinor === 0,
    );
    const inputs = rows
      .map((txn) => ({
        key:
          txn.merchantKey || normalizeMerchant(txn.counterparty || txn.title),
        name: txn.title,
        amountMinor: txn.amountMinor,
        date: txn.date,
      }))
      .filter((input) => input.key);
    return detectRecurring(inputs, {
      now: day,
      minCount: 3,
      longMinCount: 3,
      tolerance: 0.1,
    }).map((item) => ({
      title: item.name,
      key: item.key,
      amountMinor: item.amountMinor,
      period: item.period,
      nextDate: item.nextDate,
      lastDate: item.lastDate,
      monthlyMinor: item.monthlyMinor,
      yearlyMinor: item.yearlyMinor,
      count: item.count,
    }));
  }
  async function listBudgets(userId, month) {
    const [budgets, txns] = await Promise.all([
      store.list('budgets', userId, month ? { month } : {}),
      liveTxns(userId),
    ]);
    return budgets
      .sort(
        (a, b) =>
          b.month.localeCompare(a.month) ||
          a.category.localeCompare(b.category),
      )
      .map((budget) => {
        const inMonth = txns.filter((txn) => txn.date.startsWith(budget.month));
        const usedMinor =
          budget.category === '*'
            ? periodTotals(inMonth).spentMinor
            : Math.max(
                0,
                sum(
                  inMonth
                    .filter((txn) => txn.category === budget.category)
                    .map(spendDelta),
                ),
              );
        return { ...budget, usedMinor };
      });
  }
  async function putBudget(userId, { month, category, limitMinor }) {
    const existing = await store.findOne('budgets', userId, {
      month,
      category,
    });
    if (existing)
      return store.update('budgets', userId, existing.id, { limitMinor });
    try {
      return await store.create('budgets', userId, {
        month,
        category,
        limitMinor,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const row = await store.findOne('budgets', userId, { month, category });
      return store.update('budgets', userId, row.id, { limitMinor });
    }
  }
  async function deleteBudget(userId, id) {
    if (!(await store.remove('budgets', userId, id)))
      notFound('Budget not found.');
  }
  async function patchMerchant(userId, key, { title, category }) {
    let memory = await store.findOne('merchants', userId, { key });
    if (!memory) {
      const used = await store.count('txns', userId, { merchantKey: key });
      if (!used) notFound('Merchant not found.');
      memory = await store.create('merchants', userId, {
        key,
        title: title ?? displayName(key),
        category: category ?? null,
        isPerson: false,
      });
    } else
      memory = await store.update('merchants', userId, memory.id, {
        ...(title !== undefined ? { title } : {}),
        ...(category !== undefined ? { category } : {}),
      });
    let updated = 0;
    if (category) {
      const direction = incomeCategories.includes(category)
        ? 'credit'
        : 'debit';
      updated = await store.updateMany(
        'txns',
        userId,
        {
          merchantKey: key,
          direction,
          deleted: { $ne: true },
          isTransfer: { $ne: true },
        },
        { category },
      );
    }
    return { merchant: memory, updatedTxns: updated };
  }

  // ---------- overview ----------
  async function overview(userId, month) {
    const day = today();
    const selected = month ?? monthOf(day);
    const txns = await liveTxns(userId);
    const byMonth = new Map();
    for (const txn of txns) {
      const key = monthOf(txn.date);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(txn);
    }
    const inMonth = byMonth.get(selected) ?? [];
    const totals = periodTotals(inMonth);
    const categories = new Map();
    const perDay = new Map();
    for (const txn of inMonth) {
      const delta = spendDelta(txn);
      if (!delta) continue;
      categories.set(txn.category, (categories.get(txn.category) ?? 0) + delta);
      perDay.set(txn.date, (perDay.get(txn.date) ?? 0) + delta);
    }
    const merchants = new Map();
    for (const txn of inMonth.filter(
      (row) =>
        row.direction === 'debit' &&
        counts(row) &&
        !row.isTransfer &&
        ownMinor(row) > 0,
    )) {
      const key = txn.merchantKey || txn.title;
      const row = merchants.get(key) ?? {
        title: txn.title,
        minor: 0,
        count: 0,
      };
      row.minor += ownMinor(txn);
      row.count += 1;
      merchants.set(key, row);
    }
    const [accounts, budget, khata, upcoming] = await Promise.all([
      store.list('accounts', userId),
      store.findOne('budgets', userId, { month: selected, category: '*' }),
      khataRows(userId),
      subscriptions(userId, txns),
    ]);
    const accountViews = accounts.map((account) =>
      accountOut(account, txns, day),
    );
    const waiting = txns.filter(
      (txn) => txn.reimburseTag === 'claim' && !txn.reimbursedById,
    );
    const horizon = addDays(day, 30);
    const comingUp = [
      ...accountViews
        .filter(
          (account) =>
            !account.archived &&
            account.card?.dueDate &&
            account.card.billMinor > 0 &&
            !['paid', 'none'].includes(account.card.dueState) &&
            account.card.dueDate <= horizon,
        )
        .map((account) => ({
          kind: 'card_bill',
          title: `${account.name} bill`,
          date: account.card.dueDate,
          amountMinor: account.card.billMinor,
        })),
      ...upcoming
        .filter((item) => item.nextDate >= day && item.nextDate <= horizon)
        .map((item) => ({
          kind: 'subscription',
          title: item.title,
          date: item.nextDate,
          amountMinor: item.amountMinor,
        })),
      ...khata
        .filter((row) => row.nextDue && row.nextDue <= horizon)
        .map((row) => ({
          kind: 'khata_due',
          title: row.contact.name,
          date: row.nextDue,
          amountMinor: Math.abs(row.balance.adjustedMinor),
        })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
    return {
      month: selected,
      spentMinor: totals.spentMinor,
      incomeMinor: totals.incomeMinor,
      netMinor: totals.netMinor,
      budget: budget
        ? { limitMinor: budget.limitMinor, usedMinor: totals.spentMinor }
        : null,
      byCategory: [...categories]
        .filter(([, minor]) => minor > 0)
        .map(([category, minor]) => ({ category, minor }))
        .sort((a, b) => b.minor - a.minor),
      daily: daysOfMonth(selected).map((date) => ({
        date,
        minor: Math.max(0, perDay.get(date) ?? 0),
      })),
      trend: Array.from({ length: 12 }, (_, index) => {
        const key = addMonths(selected, index - 11);
        const values = periodTotals(byMonth.get(key) ?? []);
        return {
          month: key,
          spentMinor: values.spentMinor,
          incomeMinor: values.incomeMinor,
        };
      }),
      topMerchants: [...merchants.values()]
        .sort((a, b) => b.minor - a.minor)
        .slice(0, 5),
      netWorthMinor: sum(
        accountViews
          .filter((account) => !account.archived && !account.ownerName)
          .map((account) => account.balanceMinor),
      ),
      khata: khataSummary(khata.map((row) => row.balance.adjustedMinor)),
      reviewCount: txns.filter((txn) => txn.needsReview).length,
      leftCount: txns.filter((txn) => txn.peerTag === 'left').length,
      reimburse: {
        waitingMinor: sum(waiting.map((txn) => txn.reimburseMinor)),
        waitingCount: waiting.length,
      },
      comingUp,
    };
  }

  // ---------- export ----------
  const rupees = (minor) => {
    const abs = Math.abs(minor);
    return `${minor < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  };
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  async function exportCsv(userId, { from, to }) {
    const filter = {};
    if (from || to)
      filter.date = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    const [txns, accounts] = await Promise.all([
      liveTxns(userId, filter),
      store.list('accounts', userId),
    ]);
    const names = new Map(
      accounts.map((account) => [account.id, account.name]),
    );
    const header = [
      'Date',
      'Time',
      'Title',
      'Category',
      'Direction',
      'Amount (INR)',
      'My part (INR)',
      'Account',
      'Channel',
      'Status',
      'Source',
      'People answer',
      'Transfer',
      'Note',
    ];
    const lines = txns
      .sort(oldest)
      .map((txn) =>
        [
          txn.date,
          txn.time ?? '',
          txn.title,
          txn.category,
          txn.direction,
          rupees(txn.amountMinor),
          rupees(ownMinor(txn)),
          names.get(txn.accountId) ?? '',
          txn.channel,
          txn.status,
          txn.source,
          txn.peerTag ?? '',
          txn.isTransfer ? 'yes' : '',
          txn.note,
        ]
          .map(cell)
          .join(','),
      );
    return [header.join(','), ...lines].join('\r\n') + '\r\n';
  }

  return {
    // txns
    listTxns,
    addTxn,
    patchTxn,
    deleteTxn,
    getTxn,
    ingest,
    applyPeer: async (userId, id, body) =>
      applyPeer(userId, await getTxn(userId, id), body.peerTag, body),
    setRefundOf,
    linkTransfer,
    markUntracked,
    unlinkTransfer,
    transferSuggestions,
    claim,
    unclaim,
    previewReceived,
    markReceived,
    unmarkReceived,
    reimbursements,
    // accounts
    listAccounts,
    createAccount,
    patchAccount,
    deleteAccount,
    matchBankBalance,
    billPaid,
    // khata
    khataOverview,
    contactDetail,
    createContact,
    patchContact,
    deleteContact,
    addEntry,
    patchEntry,
    deleteEntry,
    addAdjustment,
    patchAdjustment,
    deleteAdjustment,
    swapContact,
    parseImport,
    saveImport,
    // photos
    addPhoto,
    getPhoto,
    deletePhoto,
    // other
    subscriptions,
    listBudgets,
    putBudget,
    deleteBudget,
    listMerchants: (userId) => store.list('merchants', userId),
    patchMerchant,
    overview,
    exportCsv,
    resolveContact,
  };
}
