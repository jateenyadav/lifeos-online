import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeWorkspaces, moneyFixture } from './support/money-fixture.js';
import { createMemoryMoneyStore } from '../src/money/memory-store.js';
import { createMigrator } from '../src/money/migrate.js';
import { createMoneyService } from '../src/money/service.js';
import { seedMoneyDemo } from '../src/demo-data.js';

const id = (n) => n.toString(16).padStart(24, 'f');
const oldRows = {
  expenses: [
    {
      id: id(1),
      title: 'Groceries',
      date: '2026-10-03',
      amountMinor: 128050,
      category: 'Food',
      payment: 'Card',
      note: 'weekly',
    },
    {
      id: id(2),
      title: 'Metro',
      date: '2026-10-04',
      amountMinor: 5000,
      category: 'Travel',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(9),
      userId: 'owner-2',
      title: 'Not mine',
      date: '2026-10-04',
      amountMinor: 99,
      category: 'Other',
      payment: 'UPI',
    },
  ],
  payments: [
    {
      id: id(3),
      title: 'Rahul',
      date: '2026-10-05',
      amountMinor: 50000,
      kind: 'lent',
      person: 'Rahul',
      status: 'confirmed',
      direction: 'outgoing',
      category: 'Other',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(4),
      title: 'Priya',
      date: '2026-10-06',
      amountMinor: 20000,
      kind: 'borrowed',
      person: 'Priya',
      status: 'confirmed',
      direction: 'incoming',
      category: 'Other',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(5),
      title: 'Rahul',
      date: '2026-10-07',
      amountMinor: 10000,
      kind: 'repayment_received',
      person: 'rahul',
      status: 'confirmed',
      direction: 'incoming',
      category: 'Other',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(6),
      title: 'To SBI',
      date: '2026-10-08',
      amountMinor: 300000,
      kind: 'self_transfer',
      person: '',
      status: 'confirmed',
      direction: 'outgoing',
      category: 'Other',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(7),
      title: 'Salary',
      date: '2026-10-01',
      amountMinor: 9000000,
      kind: 'income',
      person: '',
      status: 'confirmed',
      direction: 'incoming',
      category: 'Other',
      payment: 'Other',
      note: '',
    },
    {
      id: id(8),
      title: 'Unknown',
      date: '2026-10-09',
      amountMinor: 4500,
      kind: 'expense',
      person: '',
      status: 'pending',
      direction: 'outgoing',
      category: 'Other',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(10),
      title: 'Lunch',
      date: '2026-10-09',
      amountMinor: 12550,
      kind: 'expense',
      person: '',
      status: 'confirmed',
      direction: 'outgoing',
      category: 'Food',
      payment: 'UPI',
      note: '',
    },
    {
      id: id(11),
      title: 'Spam',
      date: '2026-10-09',
      amountMinor: 1,
      kind: 'expense',
      person: '',
      status: 'dismissed',
      direction: 'outgoing',
      category: 'Other',
      payment: 'UPI',
      note: '',
    },
  ],
  budgets: [{ id: id(12), month: '2026-10', limitMinor: 2500000 }],
};

test('first /api/money call copies the old spending space once, per user', async () => {
  const { me, other, money } = moneyFixture({
    workspaces: fakeWorkspaces(oldRows),
  });
  const october = (await me('get', '/overview?month=2026-10').expect(200)).body;
  // Spending: groceries + metro + the old unreviewed capture (a real payment, now in Review).
  // The confirmed "expense" payment already had an Expense row, so it is not copied twice.
  assert.equal(october.spentMinor, 128050 + 5000 + 4500);
  assert.equal(october.incomeMinor, 9000000);
  assert.deepEqual(october.budget, { limitMinor: 2500000, usedMinor: 137550 });
  assert.equal(
    october.reviewCount,
    1,
    'the pending old payment waits in review',
  );
  const txns = (await me('get', '/txns?limit=500').expect(200)).body.items;
  assert.equal(txns.length, 8);
  assert.ok(txns.every((txn) => txn.source === 'legacy'));
  const groceries = txns.find((txn) => txn.title === 'Groceries');
  assert.deepEqual(
    [groceries.channel, groceries.category, groceries.note],
    ['Card', 'Food', 'weekly'],
  );
  assert.equal(txns.find((txn) => txn.title === 'To SBI').isTransfer, true);
  assert.equal(
    txns.find((txn) => txn.title === 'Salary').category,
    'Other income',
  );
  const tags = Object.fromEntries(
    txns
      .filter((txn) => txn.peerTag)
      .map((txn) => [txn.amountMinor, txn.peerTag]),
  );
  assert.deepEqual(tags, {
    50000: 'lent',
    20000: 'borrowed',
    10000: 'got_back',
  });

  const khata = (await me('get', '/khata').expect(200)).body;
  const balances = Object.fromEntries(
    khata.contacts.map((row) => [row.contact.name, row.balance.actualMinor]),
  );
  assert.deepEqual(
    balances,
    { Priya: -20000, Rahul: 40000 },
    '"rahul" and "Rahul" are one person',
  );

  // Idempotent: more calls change nothing; the other user only gets their own row.
  await me('get', '/overview').expect(200);
  assert.equal(
    (await me('get', '/txns?limit=500').expect(200)).body.items.length,
    8,
  );
  assert.equal((await other('get', '/txns').expect(200)).body.items.length, 1);
  assert.ok(await money.migratedAt('owner-1'));
});

test('the migration is idempotent even when the flag is lost mid-way', async () => {
  const store = createMemoryMoneyStore();
  const workspaces = fakeWorkspaces(oldRows);
  const service = createMoneyService({ store });
  await createMigrator({ store, workspaces, service })('owner-1');
  const counts = async () =>
    Promise.all(
      ['txns', 'entries', 'contacts', 'budgets'].map((name) =>
        store.count(name, 'owner-1'),
      ),
    );
  const first = await counts();
  // Pretend the server stopped before saving the flag, then a new process runs it again.
  store.migratedAt = async () => null;
  await createMigrator({ store, workspaces, service })('owner-1');
  assert.deepEqual(await counts(), first);
  assert.deepEqual(first, [8, 3, 2, 1]);
});

test('parallel first requests run the migration once', async () => {
  const { me } = moneyFixture({ workspaces: fakeWorkspaces(oldRows) });
  await Promise.all([
    me('get', '/overview'),
    me('get', '/txns'),
    me('get', '/khata'),
  ]);
  assert.equal(
    (await me('get', '/txns?limit=500').expect(200)).body.items.length,
    8,
  );
  assert.equal((await me('get', '/khata').expect(200)).body.contacts.length, 2);
});

test('demo data tells the Rohan add-on card story and needs no migration', async () => {
  const store = createMemoryMoneyStore();
  await seedMoneyDemo(store, 'demo-user');
  assert.ok(await store.migratedAt('demo-user'));
  const service = createMoneyService({ store });
  const khata = await service.khataOverview('demo-user');
  const rohan = khata.contacts.find((row) => row.contact.name === 'Rohan');
  // Old khata: I owe Rohan ₹25,000; plus the flight and Swiggy on his add-on card.
  assert.equal(rohan.balance.actualMinor, -(2500000 + 1245000 + 42000));
  const reimbursements = await service.reimbursements('demo-user');
  assert.equal(reimbursements.waitingMinor, 1245000);
  assert.equal(reimbursements.items[0].payBackTo, 'Rohan');
  const subscriptions = await service.subscriptions('demo-user');
  assert.ok(
    subscriptions.some(
      (item) => item.title === 'Netflix' && item.period === 'monthly',
    ),
  );
  const overview = await service.overview('demo-user');
  assert.equal(overview.reimburse.waitingCount, 1);
  assert.equal(overview.reviewCount, 1);
  assert.equal(overview.leftCount, 1);
  const accounts = await service.listAccounts('demo-user');
  assert.deepEqual(accounts.map((account) => account.name).sort(), [
    'Axis Credit Card',
    'HDFC Savings',
    "Rohan's add-on card",
  ]);
  const txns = await store.list('txns', 'demo-user');
  assert.ok(
    txns.every(
      (txn) => Number.isInteger(txn.amountMinor) && txn.amountMinor > 0,
    ),
  );
});
