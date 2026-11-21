/**
 * One-time, idempotent copy of the old spending space into Money v2 (docs/MONEY.md §3).
 * Runs lazily on a user's first /api/money call. Old collections are only read, never changed.
 */
import { expenseCategories } from './constants.js';
import { newEntry, newTxn } from './service.js';
import { peerNote, peerOutcome } from './peer.js';

const channelOf = (payment) =>
  ({ UPI: 'UPI', Card: 'Card', Wallet: 'Wallet', Cash: 'Cash' })[payment] ??
  'Other';
const expenseCategory = (category) =>
  expenseCategories.includes(category) ? category : 'Other';
const kindTag = {
  lent: 'lent',
  borrowed: 'borrowed',
  repayment_received: 'got_back',
  repayment_paid: 'repaid',
};

export function createMigrator({ store, workspaces, service }) {
  const running = new Map();

  async function upsertTxn(userId, values) {
    const existing = await store.findOne('txns', userId, {
      sourceKeys: values.sourceKey,
    });
    if (existing) return existing;
    try {
      return await store.create('txns', userId, newTxn(values));
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return store.findOne('txns', userId, { sourceKeys: values.sourceKey });
    }
  }

  async function migrate(userId) {
    if (await store.migratedAt(userId)) return false;
    if (!workspaces?.list) {
      await store.markMigrated(userId);
      return false;
    }
    const [expenses, payments, budgets] = await Promise.all(
      ['expenses', 'payments', 'budgets'].map((collection) =>
        workspaces.list(collection, userId),
      ),
    );
    for (const expense of expenses) {
      await upsertTxn(userId, {
        date: expense.date,
        amountMinor: expense.amountMinor,
        direction: 'debit',
        title: expense.title,
        category: expenseCategory(expense.category),
        channel: channelOf(expense.payment),
        note: expense.note ?? '',
        source: 'legacy',
        sourceKey: `legacy:expense:${expense.id}`,
        sourceApp: expense.sourceApp ?? '',
      });
    }
    for (const payment of payments) {
      // A confirmed "expense" payment already made an Expense row (copied above).
      if (payment.status === 'dismissed') continue;
      if (payment.status === 'confirmed' && payment.kind === 'expense')
        continue;
      const direction = payment.direction === 'incoming' ? 'credit' : 'debit';
      const pending = payment.status !== 'confirmed';
      const tag = pending ? null : kindTag[payment.kind];
      const txn = await upsertTxn(userId, {
        date: payment.date,
        amountMinor: payment.amountMinor,
        direction,
        title: payment.title,
        category:
          direction === 'credit'
            ? 'Other income'
            : expenseCategory(payment.category),
        channel: channelOf(payment.payment),
        note: payment.note ?? '',
        source: 'legacy',
        sourceKey: `legacy:payment:${payment.id}`,
        sourceApp: payment.sourceApp ?? '',
        counterparty: payment.person ?? '',
        needsReview: pending,
        isTransfer: !pending && payment.kind === 'self_transfer',
      });
      if (!tag || !payment.person?.trim()) continue;
      if (await store.count('entries', userId, { linkedTxnId: txn.id }))
        continue;
      const outcome = peerOutcome(tag, txn.amountMinor);
      const contact = await service.resolveContact(userId, {
        name: payment.person,
      });
      await store.create(
        'entries',
        userId,
        newEntry({
          contactId: contact.id,
          direction: outcome.khataDirection,
          amountMinor: outcome.khataMinor,
          date: txn.date,
          note: peerNote(tag),
          linkedTxnId: txn.id,
        }),
      );
      await store.update('txns', userId, txn.id, {
        peerTag: tag,
        peerShareMinor: outcome.peerShareMinor,
        contactId: contact.id,
      });
    }
    for (const budget of budgets) {
      const existing = await store.findOne('budgets', userId, {
        month: budget.month,
        category: '*',
      });
      if (!existing)
        await store.create('budgets', userId, {
          month: budget.month,
          category: '*',
          limitMinor: budget.limitMinor,
        });
    }
    await store.markMigrated(userId);
    return true;
  }

  /** Runs the migration once per user even when several first requests arrive together. */
  return function ensureMigrated(userId) {
    const key = String(userId);
    if (!running.has(key))
      running.set(
        key,
        migrate(key).finally(() => running.delete(key)),
      );
    return running.get(key);
  };
}
