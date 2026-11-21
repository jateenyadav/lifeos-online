// Ported from SpendSense test/unit/core_logic_test.dart, test/db/money_features_test.dart and
// test/db/v170_features_test.dart (the pure parts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  displayName,
  jaroWinkler,
  levenshtein,
  matchMerchant,
  normalizeMerchant,
} from '../src/money/merchant.js';
import {
  accountBalance,
  findDuplicate,
  findTransferPartner,
  ownMinor,
  periodTotals,
} from '../src/money/ledger.js';
import {
  adjustmentDelta,
  khataBalance,
  khataSummary,
  ledgerRows,
} from '../src/money/khata.js';
import {
  contactName,
  looksLikePerson,
  peerFits,
  peerOutcome,
} from '../src/money/peer.js';
import { allocate } from '../src/money/reimburse.js';
import {
  dueDateFor,
  summariseCard,
  cardAdvice,
} from '../src/money/card-math.js';
import { detectRecurring } from '../src/money/recurring.js';

test('merchant normalisation and display names', () => {
  assert.equal(normalizeMerchant('Sharma Stores Pvt Ltd'), 'SHARMA STORE');
  assert.equal(normalizeMerchant('sharma.store@ybl'), 'SHARMA STORE');
  assert.equal(normalizeMerchant('UPI/SWIGGY 4455667788'), 'SWIGGY');
  assert.equal(displayName('SHARMA STORE'), 'Sharma Store');
  assert.equal(displayName('rahul.k@okaxis'), 'Rahul K');
});

test('merchant matching is conservative', () => {
  const known = [
    { key: 'SHARMA STORE', category: 'Groceries', upiId: 'sharma@ybl' },
    { key: 'SWIGGY', category: 'Food' },
    { key: 'BIG BAZAAR', aliases: ['BIGBAZAAR'] },
  ];
  assert.equal(matchMerchant('SHARMA STORES', null, known).candidate, known[0]);
  assert.equal(matchMerchant('SHARMA STORES', null, known).autoApply, true);
  assert.equal(matchMerchant('BIGBAZAAR', null, known).confidence, 100);
  assert.equal(
    matchMerchant('Unknown name', 'sharma@ybl', known).candidate,
    known[0],
  );
  const typo = matchMerchant('SHARMAA STORE', null, known);
  assert.equal(typo.candidate, known[0]);
  assert.ok(typo.confidence >= 85);
  const verma = matchMerchant('VERMA STORE', null, known);
  assert.ok(
    verma === null || !verma.autoApply,
    'different shops are not merged',
  );
  const instamart = matchMerchant('SWIGGY INSTAMART', null, known);
  assert.equal(instamart.candidate, known[1]);
  assert.equal(instamart.autoApply, false);
  assert.equal(matchMerchant('ZOMATO', null, known), null);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.ok(Math.abs(jaroWinkler('MARTHA', 'MARHTA') - 0.961) < 0.01);
});

const txn = (values) => ({
  amountMinor: 0,
  direction: 'debit',
  status: 'cleared',
  peerShareMinor: 0,
  reimburseMinor: 0,
  isTransfer: false,
  refundOfId: null,
  deleted: false,
  date: '2026-11-15',
  time: '10:00',
  ...values,
});

test('balance = opening + cleared credits − cleared debits; pending and failed excluded', () => {
  const entries = [
    txn({ amountMinor: 45000 }),
    txn({ amountMinor: 200000, direction: 'credit' }),
    txn({ amountMinor: 10000, status: 'pending' }),
    txn({ amountMinor: 99900, status: 'failed' }),
    txn({ amountMinor: 5000, deleted: true }),
  ];
  assert.equal(accountBalance(3000000, entries), 3000000 - 45000 + 200000);
  const card = accountBalance(-500000, [txn({ amountMinor: 129900 })]);
  assert.equal(card, -629900);
});

test('income/expense exclude transfers; refunds reduce expense; own part rules', () => {
  const totals = periodTotals([
    txn({ amountMinor: 100000 }),
    txn({ amountMinor: 300000, direction: 'credit' }),
    txn({ amountMinor: 500000, isTransfer: true }),
    txn({ amountMinor: 500000, direction: 'credit', isTransfer: true }),
    txn({ amountMinor: 20000, direction: 'credit', refundOfId: 'x' }),
    txn({ amountMinor: 70000, status: 'failed' }),
  ]);
  assert.equal(totals.incomeMinor, 300000);
  assert.equal(totals.spentMinor, 80000);
  assert.equal(totals.refundMinor, 20000);
  assert.equal(totals.transferMinor, 500000);
  assert.equal(totals.netMinor, 220000);
  assert.equal(ownMinor(txn({ amountMinor: 1000, peerShareMinor: 600 })), 400);
  assert.equal(
    ownMinor(
      txn({ amountMinor: 1000, peerShareMinor: 600, reimburseMinor: 900 }),
    ),
    0,
  );
});

test('duplicates: same UTR, different UTRs, SMS + notification, weak, far away', () => {
  const existing = (values) =>
    txn({
      id: 'e1',
      amountMinor: 45000,
      last4: '1234',
      sources: ['sms'],
      ...values,
    });
  const item = (values) => ({
    amountMinor: 45000,
    direction: 'debit',
    date: '2026-11-15',
    time: '10:00',
    source: 'sms',
    last4: '1234',
    ...values,
  });
  assert.equal(
    findDuplicate(item({ date: '2026-11-16', utr: '432109876543' }), [
      existing({ utr: '432109876543' }),
    ]).kind,
    'exact',
  );
  assert.equal(
    findDuplicate(item({ utr: '111111111111' }), [
      existing({ utr: '222222222222' }),
    ]).kind,
    'none',
  );
  assert.equal(
    findDuplicate(
      item({
        time: '10:01',
        utr: '432109876543',
        counterparty: 'SHARMA STORE',
      }),
      [
        existing({
          last4: '',
          sources: ['notification'],
          counterparty: 'Sharma Store',
        }),
      ],
    ).kind,
    'cross_source',
  );
  assert.equal(
    findDuplicate(item({ time: '10:05' }), [existing()]).kind,
    'possible',
  );
  assert.equal(
    findDuplicate(item({ amountMinor: 45001 }), [existing()]).kind,
    'none',
  );
  assert.equal(
    findDuplicate(item({ time: '15:00' }), [existing()]).kind,
    'none',
  );
});

test('self-transfer: same UTR links; amount + time alone only suggests; same account never', () => {
  const debit = txn({
    id: 'd',
    accountId: 'hdfc',
    amountMinor: 500000,
    utr: '556677889900',
    last4: '1234',
  });
  const credit = txn({
    id: 'c',
    accountId: 'sbi',
    amountMinor: 500000,
    direction: 'credit',
    time: '10:01',
    utr: '556677889900',
    last4: '5678',
  });
  const linked = findTransferPartner(credit, [debit], ['1234', '5678']);
  assert.equal(linked.autoLink, true);
  assert.equal(linked.match.id, 'd');

  const plain = findTransferPartner(
    { ...credit, utr: null },
    [{ ...debit, utr: null }],
    ['1234', '5678'],
  );
  assert.equal(plain.autoLink, false);
  assert.ok(plain.score >= 50);

  const named = findTransferPartner(
    { ...credit, utr: null, time: '18:00' },
    [{ ...debit, utr: null, title: 'Sent to A/c XX5678' }],
    ['1234', '5678'],
  );
  assert.equal(named.autoLink, true);

  assert.equal(
    findTransferPartner(debit, [
      { ...credit, accountId: 'hdfc' },
      { ...credit, id: 'x', direction: 'debit' },
    ]),
    null,
  );
  assert.equal(
    findTransferPartner(debit, [{ ...credit, utr: null, date: '2026-11-19' }]),
    null,
    'more than 3 days apart',
  );
});

test('khata: balances, waivers, reversed adjustments, toward zero, summary', () => {
  const gave = { direction: 'gave', amountMinor: 500000 };
  const got = { direction: 'got', amountMinor: 200000 };
  const balance = khataBalance([gave, got]);
  assert.equal(balance.actualMinor, 300000);
  assert.equal(balance.adjustedMinor, 300000);
  const delta = adjustmentDelta({
    currentMinor: 300000,
    amountMinor: 50000,
    reduce: true,
  });
  assert.equal(delta, -50000);
  const waived = khataBalance(
    [gave, got],
    [{ type: 'waived', deltaMinor: delta, active: true }],
  );
  assert.equal(waived.actualMinor, 300000);
  assert.equal(waived.adjustedMinor, 250000);
  assert.equal(
    khataBalance(
      [{ direction: 'gave', amountMinor: 100000 }],
      [{ type: 'discount', deltaMinor: -20000, active: false }],
    ).adjustedMinor,
    100000,
  );
  assert.equal(
    adjustmentDelta({
      currentMinor: -100000,
      amountMinor: 10000,
      reduce: true,
    }),
    10000,
  );
  assert.equal(
    adjustmentDelta({
      currentMinor: -100000,
      amountMinor: 10000,
      reduce: false,
    }),
    -10000,
  );
  const disputed = khataBalance(
    [{ direction: 'gave', amountMinor: 100000 }],
    [
      { type: 'disputed', deltaMinor: -30000, active: true },
      { type: 'pending_confirmation', deltaMinor: -10000, active: true },
    ],
  );
  assert.equal(disputed.disputedMinor, 30000);
  assert.equal(disputed.pendingConfirmationMinor, 10000);
  assert.equal(disputed.adjustedMinor, 60000);
  assert.deepEqual(khataSummary([300000, -50000, 0, 20000]), {
    owedToMeMinor: 320000,
    iOweMinor: 50000,
    netMinor: 270000,
  });
});

test('khata ledger: app entries newest first, opening entries last, running balance', () => {
  const rows = ledgerRows([
    {
      id: 'a1',
      direction: 'got',
      amountMinor: 100,
      date: '2026-11-21',
      isOpening: true,
    },
    {
      id: 'a2',
      direction: 'got',
      amountMinor: 300,
      date: '2026-11-21',
      isOpening: true,
    },
    {
      id: 'a3',
      direction: 'gave',
      amountMinor: 50,
      date: '2026-11-20',
      isOpening: false,
    },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.amountMinor, row.isOpening, row.runningMinor]),
    [
      [50, false, -350],
      [300, true, -400],
      [100, true, -100],
    ],
  );
});

test('people: friend or shop, and what each answer means', () => {
  for (const name of ['Rahul Kumar', 'PRIYA SINGH', 'Mom', 'Neha', 'MR AMIT K'])
    assert.equal(looksLikePerson(name), true, name);
  assert.equal(looksLikePerson(null, { upiId: '9876543210@ybl' }), true);
  for (const name of [
    'Maiz Mexican Kitchen',
    'Sharma General Store',
    'ZOMATO LTD',
    'Urban Clap Services',
    'Apollo Pharmacy',
    'Jio Recharge',
    'A1',
    'DMART AVENUE SUPERMARTS',
  ])
    assert.equal(looksLikePerson(name), false, name);
  assert.equal(
    looksLikePerson('Ramesh', { upiId: 'paytmqr281005050101@paytm' }),
    false,
  );
  assert.equal(looksLikePerson('Raju', { upiId: 'paytm.s1100nz@pty' }), false);
  assert.equal(
    looksLikePerson('Chotu Bhai Store', { knownContact: true }),
    true,
  );

  assert.equal(peerOutcome('lent', 50000).peerShareMinor, 50000);
  const split3 = peerOutcome('split', 90000, { people: 3 });
  assert.equal(split3.khataMinor, 60000, 'two friends owe 2/3');
  assert.equal(split3.khataDirection, 'gave');
  assert.equal(peerOutcome('got_back', 1000).khataDirection, 'got');
  assert.equal(peerOutcome('personal', 1000).khataDirection, null);
  assert.deepEqual(peerOutcome('owe_owner', 1000), {
    khataDirection: 'got',
    khataMinor: 1000,
    peerShareMinor: 0,
  });
  assert.equal(
    peerOutcome('owe_owner', 1000, { credit: true }).khataDirection,
    'gave',
  );
  assert.equal(contactName('MR RAHUL KUMAR'), 'Rahul Kumar');
  assert.equal(peerFits('lent', 'credit'), false);
  assert.equal(peerFits('borrowed', 'credit'), true);
  assert.equal(peerFits('owe_owner', 'credit'), true);
});

test('reimburse allocation maths (oldest first)', () => {
  const a = { id: 1, amountMinor: 1000 };
  const b = { id: 2, amountMinor: 500 };
  let split = allocate(1800, [a, b]);
  assert.deepEqual(split.covered, { 1: 1000, 2: 500 });
  assert.deepEqual(
    [split.matchedMinor, split.extraMinor, split.shortMinor],
    [1500, 300, 0],
  );
  split = allocate(1200, [a, b]);
  assert.deepEqual(split.covered, { 1: 1000, 2: 200 });
  assert.deepEqual(
    [split.matchedMinor, split.extraMinor, split.shortMinor],
    [1200, 0, 300],
  );
  split = allocate(1500, [a, b]);
  assert.deepEqual(
    [split.matchedMinor, split.extraMinor, split.shortMinor],
    [1500, 0, 0],
  );
  split = allocate(0, [a]);
  assert.deepEqual(
    [split.matchedMinor, split.extraMinor, split.shortMinor],
    [0, 0, 1000],
  );
  split = allocate(700, []);
  assert.deepEqual(
    [split.matchedMinor, split.extraMinor, split.shortMinor],
    [0, 700, 0],
  );
});

test('credit card maths: limit, available, usage, bill from statement day', () => {
  const summary = summariseCard({
    ledgerBalanceMinor: -3000000,
    settings: { creditLimitMinor: 10000000, statementDay: 5, dueDay: 25 },
    txns: [
      { amountMinor: 2000000, isCredit: false, date: '2026-10-20' },
      { amountMinor: 1000000, isCredit: false, date: '2026-11-08' },
    ],
    now: '2026-11-17',
  });
  assert.equal(summary.outstandingMinor, 3000000);
  assert.equal(summary.availableMinor, 7000000);
  assert.equal(summary.usagePct, 30);
  assert.equal(summary.cycleSpendMinor, 1000000);
  assert.equal(summary.billMinor, 2000000, 'owed before this cycle');
  assert.equal(summary.dueDate, '2026-11-25');
  assert.equal(summary.daysToDue, 8);
  assert.equal(summary.dueState, 'upcoming');
  assert.equal(summary.minDueMinor, 100000, '5% of 20,000');
  assert.equal(summary.nextStatementDate, '2026-12-05');
});

test('credit card maths: bank statement wins, due soon, paid, overdue, short months', () => {
  const settings = {
    statementDay: 5,
    lastStatementMinor: 1234567,
    lastMinDueMinor: 62000,
    lastStatementAt: '2026-11-05',
    lastDueDate: '2026-11-20',
  };
  const soon = summariseCard({
    ledgerBalanceMinor: -1500000,
    settings,
    txns: [],
    now: '2026-11-17',
  });
  assert.equal(soon.billMinor, 1234567);
  assert.equal(soon.minDueMinor, 62000);
  assert.equal(soon.dueState, 'due_soon');
  assert.match(cardAdvice(soon), /3 days/);
  const paid = summariseCard({
    ledgerBalanceMinor: 0,
    settings,
    txns: [{ amountMinor: 1234567, isCredit: true, date: '2026-11-15' }],
    now: '2026-11-17',
  });
  assert.equal(paid.dueState, 'paid');
  const overdue = summariseCard({
    ledgerBalanceMinor: -500000,
    settings: {
      lastStatementMinor: 500000,
      lastStatementAt: '2026-10-20',
      lastDueDate: '2026-11-10',
    },
    txns: [],
    now: '2026-11-17',
  });
  assert.equal(overdue.dueState, 'overdue');
  assert.equal(overdue.daysToDue, -7);
  assert.equal(dueDateFor('2027-02-05', 31), '2027-02-28');
});

test('repeating payments: monthly Netflix and yearly insurance found; random shop ignored', () => {
  const inputs = [
    ...[6, 7, 8, 9, 10, 11].map((month) => ({
      key: 'netflix',
      name: 'Netflix',
      amountMinor: 64900,
      date: `2026-${String(month).padStart(2, '0')}-03`,
    })),
    {
      key: 'lic',
      name: 'LIC Premium',
      amountMinor: 1200000,
      date: '2025-11-10',
    },
    {
      key: 'lic',
      name: 'LIC Premium',
      amountMinor: 1200000,
      date: '2026-11-09',
    },
    {
      key: 'shop',
      name: 'Random Shop',
      amountMinor: 30000,
      date: '2026-09-01',
    },
    {
      key: 'shop',
      name: 'Random Shop',
      amountMinor: 90000,
      date: '2026-09-09',
    },
    {
      key: 'shop',
      name: 'Random Shop',
      amountMinor: 12000,
      date: '2026-11-02',
    },
  ];
  const found = detectRecurring(inputs, { now: '2026-11-17' });
  const netflix = found.find((item) => item.key === 'netflix');
  assert.equal(netflix.period, 'monthly');
  assert.equal(netflix.nextDate, '2026-12-03');
  assert.equal(netflix.monthlyMinor, 64900);
  assert.equal(netflix.yearlyMinor, 64900 * 12);
  const lic = found.find((item) => item.key === 'lic');
  assert.equal(lic.period, 'yearly');
  assert.equal(lic.monthlyMinor, 100000);
  assert.equal(
    found.some((item) => item.key === 'shop'),
    false,
  );
  // The contract's stricter rule (≥3 payments for every period) drops the 2-payment premium.
  const strict = detectRecurring(inputs, {
    now: '2026-11-17',
    longMinCount: 3,
    tolerance: 0.1,
  });
  assert.equal(
    strict.some((item) => item.key === 'lic'),
    false,
  );
});

test('stopped subscriptions disappear', () => {
  const inputs = [1, 2, 3, 4, 5].map((month) => ({
    key: 'gym',
    name: 'Gym',
    amountMinor: 150000,
    date: `2026-0${month}-01`,
  }));
  assert.deepEqual(detectRecurring(inputs, { now: '2026-11-17' }), []);
});
