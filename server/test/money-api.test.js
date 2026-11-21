import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { daysAgo, moneyFixture, today } from './support/money-fixture.js';
import { userNotes } from './support/user-notes.js';

// A tiny real JPEG header + padding (the server checks the signature, not the picture).
const jpeg = (bytes = 64) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(bytes),
  ]).toString('base64');

const spend = (values = {}) => ({
  date: today(),
  amountMinor: 10000,
  direction: 'debit',
  title: 'Lunch',
  category: 'Food',
  ...values,
});
let keyCounter = 0;
const capture = (values = {}) => ({
  sourceKey: `sms-key-${++keyCounter}-${Date.now()}`,
  source: 'sms',
  date: today(),
  time: '10:00',
  amountMinor: 50000,
  direction: 'debit',
  title: 'Payment',
  channel: 'UPI',
  bank: 'HDFC Bank',
  confidence: 0.95,
  ...values,
});

async function overview(me) {
  return (await me('get', '/overview').expect(200)).body;
}
async function contactByName(me, name) {
  const khata = (await me('get', '/khata').expect(200)).body;
  return khata.contacts.find((row) => row.contact.name === name);
}

test('money routes need a session and report errors as {message, error}', async () => {
  const { app } = moneyFixture();
  const response = await request(app).get('/api/money/overview').expect(401);
  assert.equal(response.body.error, response.body.message);
  assert.match(response.body.error, /sign in/i);
});

test('a: Rohan old khata (totals only) + two add-on card spends from yesterday list above the opening entry', async () => {
  const { me } = moneyFixture();
  const parsed = (
    await me('post', '/khata/import/parse', {
      mode: 'bulk',
      text: 'Rohan (pune) - 25000 + 5000\n\npending\nrohan - 30000',
    }).expect(200)
  ).body;
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.people[0].statedMinor, 3000000);
  const saved = (
    await me('post', '/khata/import/save', {
      people: parsed.people.map((person) => ({
        ...person,
        choice: 'totalOnly',
      })),
    }).expect(201)
  ).body;
  assert.deepEqual([saved.people, saved.entries], [1, 1]);

  await me('post', '/accounts', {
    name: "Rohan's add-on card",
    type: 'credit_card',
    bank: 'HDFC Bank',
    last4: '9191',
    ownerName: 'Rohan',
  }).expect(201);
  const yesterday = daysAgo(1);
  const results = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          date: yesterday,
          time: '16:30',
          amountMinor: 200,
          last4: '9191',
          channel: 'Card',
          title: 'Test',
        }),
        capture({
          date: yesterday,
          time: '18:30',
          amountMinor: 1186400,
          last4: '9191',
          channel: 'Card',
          title: 'IndiGo',
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.deepEqual(
    results.map((item) => [item.status, item.txn.peerTag, item.txn.ownMinor]),
    [
      ['created', 'owe_owner', 200],
      ['created', 'owe_owner', 1186400],
    ],
  );

  const rohan = await contactByName(me, 'Rohan');
  assert.equal(rohan.contact.note, 'pune');
  const detail = (
    await me('get', `/khata/contacts/${rohan.contact.id}`).expect(200)
  ).body;
  assert.deepEqual(
    detail.entries.map((entry) => [
      entry.amountMinor,
      entry.isOpening,
      entry.direction,
    ]),
    [
      [1186400, false, 'got'],
      [200, false, 'got'],
      [3000000, true, 'got'],
    ],
  );
  assert.equal(detail.entries[2].note, 'Old khata balance');
  assert.equal(detail.balance.actualMinor, -(3000000 + 1186400 + 200));
  assert.deepEqual(
    detail.entries.map((entry) => entry.runningMinor),
    [-(3000000 + 1186400 + 200), -(3000000 + 200), -3000000],
  );
  // Both spends are still my spending (the bar graph), and I owe Rohan.
  const totals = await overview(me);
  assert.equal(totals.spentMinor, 1186400 + 200);
  assert.equal(totals.khata.iOweMinor, 3000000 + 1186400 + 200);
  assert.equal(
    totals.netWorthMinor,
    0,
    "someone else's card is left out of net worth",
  );
});

test('b: "You got" with paidForMe makes a spending txn that follows edits and deletes', async () => {
  const { me } = moneyFixture();
  const contact = (
    await me('post', '/khata/contacts', { name: 'Geeta aunty' }).expect(201)
  ).body.contact;
  const entry = (
    await me('post', `/khata/contacts/${contact.id}/entries`, {
      direction: 'got',
      amountMinor: 150000,
      date: today(),
      note: 'Phone recharge',
      paidForMe: true,
      category: 'Bills',
    }).expect(201)
  ).body.entry;
  assert.equal(entry.paidForMe, true);
  const txns = (await me('get', '/txns?source=khata').expect(200)).body.items;
  assert.equal(txns.length, 1);
  assert.deepEqual(
    [
      txns[0].direction,
      txns[0].peerTag,
      txns[0].category,
      txns[0].title,
      txns[0].needsReview,
    ],
    ['debit', 'owe_owner', 'Bills', 'Phone recharge', false],
  );
  let totals = await overview(me);
  assert.equal(totals.spentMinor, 150000);
  assert.deepEqual(totals.byCategory, [{ category: 'Bills', minor: 150000 }]);
  assert.equal(totals.daily.find((row) => row.date === today()).minor, 150000);
  assert.equal(totals.khata.iOweMinor, 150000);

  await me('patch', `/khata/entries/${entry.id}`, {
    amountMinor: 120000,
    note: 'Recharge',
  }).expect(200);
  const edited = (await me('get', '/txns?source=khata').expect(200)).body
    .items[0];
  assert.deepEqual([edited.amountMinor, edited.title], [120000, 'Recharge']);
  totals = await overview(me);
  assert.equal(totals.spentMinor, 120000);
  assert.equal(totals.daily.find((row) => row.date === today()).minor, 120000);

  await me('patch', `/khata/entries/${entry.id}`, { direction: 'gave' }).expect(
    400,
  );
  await me('delete', `/khata/entries/${entry.id}`).expect(204);
  assert.equal((await me('get', '/txns').expect(200)).body.items.length, 0);
  totals = await overview(me);
  assert.equal(totals.spentMinor, 0);
  assert.deepEqual(totals.byCategory, []);
  // "Paid for me" only goes with "You got"; a normal "You got" is not spending.
  await me('post', `/khata/contacts/${contact.id}/entries`, {
    direction: 'gave',
    amountMinor: 100,
    date: today(),
    paidForMe: true,
  }).expect(400);
  await me('post', `/khata/contacts/${contact.id}/entries`, {
    direction: 'got',
    amountMinor: 5000,
    date: today(),
  }).expect(201);
  assert.equal((await overview(me)).spentMinor, 0);
});

async function rohanWithCard(me) {
  await me('post', '/khata/import/save', {
    people: [
      { name: 'Rohan', choice: 'totalOnly', statedMinor: 3000000, lines: [] },
    ],
  }).expect(201);
  const card = (
    await me('post', '/accounts', {
      name: "Rohan's add-on card",
      type: 'credit_card',
      last4: '9191',
      ownerName: 'Rohan',
    }).expect(201)
  ).body.account;
  const bank = (
    await me('post', '/accounts', {
      name: 'HDFC Savings',
      last4: '4821',
      openingMinor: 1000000,
    }).expect(201)
  ).body.account;
  return { card, bank };
}

test("c: reimbursement on Rohan's add-on card: claim, office pays more, pay Rohan back", async () => {
  const { me } = moneyFixture();
  const { card, bank } = await rohanWithCard(me);
  const flight = (
    await me(
      'post',
      '/txns',
      spend({
        amountMinor: 1186400,
        title: 'IndiGo',
        category: 'Travel',
        channel: 'Card',
        accountId: card.id,
        date: daysAgo(1),
      }),
    ).expect(201)
  ).body.txn;
  assert.equal(flight.peerTag, 'owe_owner');
  const rohan = await contactByName(me, 'Rohan');
  assert.equal(rohan.balance.actualMinor, -(3000000 + 1186400));
  assert.equal((await overview(me)).spentMinor, 1186400);

  const claimed = (
    await me('post', `/txns/${flight.id}/reimburse/claim`, {}).expect(200)
  ).body.txn;
  assert.deepEqual(
    [claimed.reimburseTag, claimed.reimburseMinor, claimed.ownMinor],
    ['claim', 1186400, 0],
  );
  let totals = await overview(me);
  assert.equal(totals.spentMinor, 0, 'spending drops by 11,864 while waiting');
  assert.deepEqual(totals.reimburse, {
    waitingMinor: 1186400,
    waitingCount: 1,
  });
  let list = (await me('get', '/reimbursements').expect(200)).body;
  assert.equal(list.waitingMinor, 1186400);
  assert.deepEqual(
    [list.items[0].payBackTo, list.items[0].waiting],
    ['Rohan', true],
  );

  const office = (
    await me(
      'post',
      '/txns',
      spend({
        amountMinor: 1500000,
        direction: 'credit',
        title: 'ACME Pvt Ltd',
        category: 'Other income',
        accountId: bank.id,
      }),
    ).expect(201)
  ).body.txn;
  assert.equal((await overview(me)).incomeMinor, 1500000);
  const preview = (
    await me('post', `/txns/${office.id}/reimburse/preview`, {
      claimIds: [flight.id],
    }).expect(200)
  ).body;
  assert.deepEqual(
    [preview.matchedMinor, preview.extraMinor, preview.shortMinor],
    [1186400, 313600, 0],
  );
  assert.equal(
    (await overview(me)).incomeMinor,
    1500000,
    'preview saves nothing',
  );
  const received = (
    await me('post', `/txns/${office.id}/reimburse/received`, {
      claimIds: [flight.id],
    }).expect(200)
  ).body;
  assert.deepEqual(
    [received.matchedMinor, received.extraMinor, received.shortMinor],
    [1186400, 313600, 0],
  );
  assert.deepEqual(
    [received.txn.reimburseTag, received.txn.ownMinor],
    ['received', 313600],
  );
  totals = await overview(me);
  assert.deepEqual(
    [totals.incomeMinor, totals.spentMinor],
    [313600, 0],
    'income +3,136 only',
  );
  list = (await me('get', '/reimbursements').expect(200)).body;
  assert.deepEqual(
    [list.waitingMinor, list.items[0].waiting, list.items[0].paidBy.id],
    [0, false, office.id],
  );

  const payBack = (
    await me(
      'post',
      '/txns',
      spend({
        amountMinor: 1186400,
        title: 'Rohan',
        counterparty: 'Rohan',
        category: 'Other',
        accountId: bank.id,
      }),
    ).expect(201)
  ).body.txn;
  const repaid = (
    await me('post', `/txns/${payBack.id}/peer`, {
      peerTag: 'repaid',
      contactName: 'Rohan',
    }).expect(200)
  ).body.txn;
  assert.deepEqual([repaid.peerShareMinor, repaid.ownMinor], [1186400, 0]);
  assert.equal(
    (await contactByName(me, 'Rohan')).balance.actualMinor,
    -3000000,
    'back to the opening balance',
  );
  totals = await overview(me);
  assert.deepEqual([totals.incomeMinor, totals.spentMinor], [313600, 0]);
  // A paid-back claim cannot change amount until the reimbursement is undone.
  await me('patch', `/txns/${flight.id}`, { amountMinor: 100 }).expect(400);
});

test('c: shortfall counts as spending, undo restores the claim, several claims are covered oldest first', async () => {
  const { me } = moneyFixture();
  const { card, bank } = await rohanWithCard(me);
  const flight = (
    await me(
      'post',
      '/txns',
      spend({
        amountMinor: 1186400,
        title: 'IndiGo',
        category: 'Travel',
        accountId: card.id,
      }),
    ).expect(201)
  ).body.txn;
  await me('post', `/txns/${flight.id}/reimburse/claim`, {}).expect(200);
  const credit = (
    await me(
      'post',
      '/txns',
      spend({
        amountMinor: 1000000,
        direction: 'credit',
        title: 'ACME',
        category: 'Other income',
        accountId: bank.id,
      }),
    ).expect(201)
  ).body.txn;
  const short = (
    await me('post', `/txns/${credit.id}/reimburse/received`, {
      claimIds: [flight.id],
    }).expect(200)
  ).body;
  assert.deepEqual(
    [short.matchedMinor, short.extraMinor, short.shortMinor],
    [1000000, 0, 186400],
  );
  let totals = await overview(me);
  assert.deepEqual(
    [totals.incomeMinor, totals.spentMinor],
    [0, 186400],
    '1,864 counts as spending',
  );

  await me('delete', `/txns/${credit.id}/reimburse/received`).expect(200);
  totals = await overview(me);
  assert.deepEqual([totals.incomeMinor, totals.spentMinor], [1000000, 0]);
  const restored = (await me('get', '/txns?q=IndiGo').expect(200)).body
    .items[0];
  assert.deepEqual(
    [restored.reimburseTag, restored.reimburseMinor, restored.reimbursedById],
    ['claim', 1186400, null],
  );
  // Not getting it back at all.
  await me('delete', `/txns/${flight.id}/reimburse/claim`).expect(200);
  assert.equal((await overview(me)).spentMinor, 1186400);

  // Multi-claim: oldest first.
  const older = (
    await me(
      'post',
      '/txns',
      spend({ amountMinor: 300000, title: 'Uber', date: daysAgo(3) }),
    ).expect(201)
  ).body.txn;
  const newer = (
    await me(
      'post',
      '/txns',
      spend({ amountMinor: 500000, title: 'Hotel', date: daysAgo(2) }),
    ).expect(201)
  ).body.txn;
  await me('post', `/txns/${older.id}/reimburse/claim`, {}).expect(200);
  await me('post', `/txns/${newer.id}/reimburse/claim`, {
    amountMinor: 400000,
  }).expect(200);
  const before = (await overview(me)).spentMinor;
  const pay = (
    await me(
      'post',
      '/txns',
      spend({
        amountMinor: 600000,
        direction: 'credit',
        title: 'ACME',
        category: 'Other income',
      }),
    ).expect(201)
  ).body.txn;
  const split = (
    await me('post', `/txns/${pay.id}/reimburse/received`, {
      claimIds: [newer.id, older.id],
    }).expect(200)
  ).body;
  assert.deepEqual(split.covered, { [older.id]: 300000, [newer.id]: 300000 });
  assert.deepEqual(
    [split.matchedMinor, split.extraMinor, split.shortMinor],
    [600000, 0, 100000],
  );
  assert.equal((await overview(me)).spentMinor, before + 100000);
  // Wrong uses are refused.
  await me('post', `/txns/${pay.id}/reimburse/claim`, {}).expect(400);
  await me('post', `/txns/${older.id}/reimburse/received`, {
    claimIds: [newer.id],
  }).expect(400);
});

test('d: phone capture rules: idempotent keys, SMS + notification merge, new accounts, bank balance, review, owner card', async () => {
  const { me } = moneyFixture();
  const bank = (
    await me('post', '/accounts', {
      name: 'HDFC Savings',
      bank: 'HDFC Bank',
      last4: '4821',
    }).expect(201)
  ).body.account;
  await me('post', '/accounts', {
    name: "Bhaiya's card",
    type: 'credit_card',
    last4: '7070',
    ownerName: 'Bhaiya',
  }).expect(201);

  const first = capture({
    last4: '4821',
    utr: '432109876543',
    amountMinor: 45000,
  });
  const [created] = (
    await me('post', '/txns/ingest', { items: [first] }).expect(200)
  ).body.items;
  assert.equal(created.status, 'created');
  assert.equal(created.txn.accountId, bank.id);
  const [again] = (
    await me('post', '/txns/ingest', { items: [first] }).expect(200)
  ).body.items;
  assert.deepEqual([again.status, again.txn.id], ['duplicate', created.txn.id]);

  const [merged] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          source: 'notification',
          time: '10:01',
          last4: '',
          utr: '432109876543',
          amountMinor: 45000,
          sourceApp: 'com.phonepe.app',
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.deepEqual([merged.status, merged.txn.id], ['merged', created.txn.id]);
  assert.deepEqual(merged.txn.sources.sort(), ['notification', 'sms']);
  assert.equal(merged.txn.sourceApp, 'com.phonepe.app');
  // Re-sending the merged notification is a duplicate too.
  const notificationKey = (await me('get', '/txns').expect(200)).body.items
    .length;
  assert.equal(notificationKey, 1);

  // Same payment by notification and SMS without a UTR, 2 minutes apart → merged.
  const [noUtr] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          source: 'notification',
          time: '13:00',
          amountMinor: 33300,
          title: 'Sharma Store',
          last4: '4821',
        }),
      ],
    }).expect(200)
  ).body.items;
  const [noUtrSms] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          time: '13:02',
          amountMinor: 33300,
          counterparty: 'SHARMA STORES',
          title: '',
          last4: '4821',
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.deepEqual(
    [noUtrSms.status, noUtrSms.txn.id],
    ['merged', noUtr.txn.id],
  );

  // Unknown last digits → a new account that waits for a quick OK.
  const [unknown] = (
    await me('post', '/txns/ingest', {
      items: [capture({ bank: 'SBI', last4: '3344', amountMinor: 1200 })],
    }).expect(200)
  ).body.items;
  const accounts = (await me('get', '/accounts').expect(200)).body.items;
  const found = accounts.find((account) => account.last4 === '3344');
  assert.deepEqual(
    [found.needsConfirm, found.name, unknown.txn.accountId],
    [true, 'SBI ••3344', found.id],
  );

  // "Avl Bal" with followBank moves openingMinor so the balance equals the bank.
  const [withBalance] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          last4: '4821',
          time: '15:00',
          amountMinor: 50000,
          availableBalanceMinor: 1000000,
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.equal(withBalance.status, 'created');
  const hdfc = (await me('get', '/accounts').expect(200)).body.items.find(
    (a) => a.id === bank.id,
  );
  assert.equal(hdfc.balanceMinor, 1000000);
  assert.equal(hdfc.bankSaidMinor, 1000000);
  assert.equal(hdfc.openingMinor, 1000000 + 45000 + 33300 + 50000);

  // Low confidence → review.
  const [unsure] = (
    await me('post', '/txns/ingest', {
      items: [capture({ amountMinor: 7700, confidence: 0.5 })],
    }).expect(200)
  ).body.items;
  assert.equal(unsure.txn.needsReview, true);
  const review = (await me('get', '/txns?review=1').expect(200)).body.items;
  assert.deepEqual(
    review.map((row) => row.id),
    [unsure.txn.id],
  );
  assert.equal((await overview(me)).reviewCount, 1);
  await me('patch', `/txns/${unsure.txn.id}`, { needsReview: false }).expect(
    200,
  );
  assert.equal((await overview(me)).reviewCount, 0);

  // A debit on someone else's card → owe_owner + khata "got".
  const [onOwner] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          last4: '7070',
          channel: 'Card',
          amountMinor: 99900,
          title: 'Amazon',
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.equal(onOwner.txn.peerTag, 'owe_owner');
  assert.equal(onOwner.txn.ownMinor, 99900);
  const bhaiya = await contactByName(me, 'Bhaiya');
  assert.equal(bhaiya.balance.actualMinor, -99900);

  // Validation.
  await me('post', '/txns/ingest', { items: [] }).expect(400);
  await me('post', '/txns/ingest', {
    items: Array.from({ length: 51 }, () => capture()),
  }).expect(400);
  await me('post', '/txns/ingest', {
    items: [{ ...capture(), body: 'Your a/c debited' }],
  }).expect(400);
  await me('post', '/txns/ingest', {
    items: [capture({ amountMinor: 12.5 })],
  }).expect(400);
});

test('e: self-transfer auto-link by UTR, suggestion by amount and time only, manual link and unlink', async () => {
  const { me } = moneyFixture();
  await me('post', '/accounts', {
    name: 'HDFC',
    bank: 'HDFC Bank',
    last4: '1234',
  }).expect(201);
  await me('post', '/accounts', {
    name: 'SBI',
    bank: 'SBI',
    last4: '5678',
  }).expect(201);
  const [out] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({ last4: '1234', utr: '556677889900', amountMinor: 500000 }),
      ],
    }).expect(200)
  ).body.items;
  const [into] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          bank: 'SBI',
          last4: '5678',
          utr: '556677889900',
          amountMinor: 500000,
          direction: 'credit',
          time: '10:01',
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.equal(into.status, 'created');
  assert.equal(into.txn.isTransfer, true);
  const outNow = (await me('get', '/txns?direction=debit').expect(200)).body
    .items[0];
  assert.deepEqual(
    [outNow.id, outNow.isTransfer, outNow.transferId],
    [out.txn.id, true, into.txn.transferId],
  );
  let totals = await overview(me);
  assert.deepEqual(
    [totals.spentMinor, totals.incomeMinor],
    [0, 0],
    'self-transfers count nowhere',
  );

  const [plainOut] = (
    await me('post', '/txns/ingest', {
      items: [capture({ last4: '1234', amountMinor: 70000, time: '11:00' })],
    }).expect(200)
  ).body.items;
  const [plainIn] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({
          bank: 'SBI',
          last4: '5678',
          amountMinor: 70000,
          direction: 'credit',
          time: '12:00',
        }),
      ],
    }).expect(200)
  ).body.items;
  assert.equal(
    plainIn.txn.isTransfer,
    false,
    'amount + time alone never links',
  );
  const suggestions = (await me('get', '/transfers/suggestions').expect(200))
    .body.items;
  assert.equal(suggestions.length, 1);
  assert.deepEqual(
    [suggestions[0].a.id, suggestions[0].b.id],
    [plainOut.txn.id, plainIn.txn.id],
  );

  const linked = (
    await me('post', `/txns/${plainOut.txn.id}/transfer`, {
      otherId: plainIn.txn.id,
    }).expect(200)
  ).body;
  assert.equal(linked.txn.transferId, linked.other.transferId);
  assert.equal(
    (await me('get', '/transfers/suggestions').expect(200)).body.items.length,
    0,
  );
  const unlinked = (
    await me('delete', `/txns/${plainIn.txn.id}/transfer`).expect(200)
  ).body.txn;
  assert.deepEqual([unlinked.isTransfer, unlinked.transferId], [false, null]);
  const partner = (
    await me('get', '/txns?q=Payment&direction=debit').expect(200)
  ).body.items.find((row) => row.id === plainOut.txn.id);
  assert.equal(partner.isTransfer, false);
  totals = await overview(me);
  assert.deepEqual([totals.spentMinor, totals.incomeMinor], [70000, 70000]);

  // "To my untracked account" marks one side only; same-direction links are refused.
  const wallet = (
    await me('post', `/txns/${plainOut.txn.id}/transfer`, {
      untracked: true,
    }).expect(200)
  ).body.txn;
  assert.deepEqual([wallet.isTransfer, wallet.transferId], [true, null]);
  await me('post', `/txns/${out.txn.id}/transfer`, {
    otherId: plainOut.txn.id,
  }).expect(409);
});

test('f: subscriptions from 4 monthly Netflix debits; refunds reduce spending; split with 3 people', async () => {
  const { me } = moneyFixture();
  for (const days of [90, 60, 30, 0])
    await me(
      'post',
      '/txns',
      spend({
        date: daysAgo(days),
        amountMinor: 64900,
        title: 'Netflix',
        category: 'Entertainment',
        channel: 'Card',
      }),
    ).expect(201);
  const subscriptions = (await me('get', '/subscriptions').expect(200)).body
    .items;
  assert.equal(subscriptions.length, 1);
  assert.deepEqual(
    [
      subscriptions[0].title,
      subscriptions[0].period,
      subscriptions[0].amountMinor,
      subscriptions[0].monthlyMinor,
      subscriptions[0].yearlyMinor,
      subscriptions[0].count,
    ],
    ['Netflix', 'monthly', 64900, 64900, 64900 * 12, 4],
  );
  assert.ok(subscriptions[0].nextDate > today());
  const coming = (await overview(me)).comingUp.find(
    (row) => row.kind === 'subscription',
  );
  assert.equal(coming.title, 'Netflix');

  const { me: fresh } = moneyFixture();
  const shoes = (
    await fresh(
      'post',
      '/txns',
      spend({ amountMinor: 200000, title: 'Myntra', category: 'Shopping' }),
    ).expect(201)
  ).body.txn;
  const refund = (
    await fresh(
      'post',
      '/txns',
      spend({
        amountMinor: 50000,
        direction: 'credit',
        title: 'Myntra refund',
        category: 'Refund',
      }),
    ).expect(201)
  ).body.txn;
  assert.equal((await overview(fresh)).incomeMinor, 50000);
  const marked = (
    await fresh('post', `/txns/${refund.id}/refund-of`, {
      originalId: shoes.id,
    }).expect(200)
  ).body.txn;
  assert.deepEqual(
    [marked.refundOfId, marked.category],
    [shoes.id, 'Shopping'],
  );
  let totals = await overview(fresh);
  assert.deepEqual([totals.spentMinor, totals.incomeMinor], [150000, 0]);
  assert.deepEqual(totals.byCategory, [
    { category: 'Shopping', minor: 150000 },
  ]);
  await fresh('post', `/txns/${shoes.id}/refund-of`, {
    originalId: refund.id,
  }).expect(400);
  await fresh('post', `/txns/${refund.id}/refund-of`, {
    originalId: null,
  }).expect(200);
  assert.equal((await overview(fresh)).incomeMinor, 50000);

  const dinner = (
    await fresh(
      'post',
      '/txns',
      spend({ amountMinor: 90000, title: 'Dinner' }),
    ).expect(201)
  ).body.txn;
  await fresh('post', `/txns/${dinner.id}/peer`, {
    peerTag: 'split',
    contactName: 'Rahul',
  }).expect(400);
  const split = (
    await fresh('post', `/txns/${dinner.id}/peer`, {
      peerTag: 'split',
      splitPeople: 3,
      contactName: 'Rahul',
    }).expect(200)
  ).body.txn;
  assert.deepEqual(
    [split.peerShareMinor, split.ownMinor, split.splitPeople],
    [60000, 30000, 3],
  );
  const rahul = await contactByName(fresh, 'Rahul');
  assert.equal(rahul.balance.actualMinor, 60000);
  totals = await overview(fresh);
  assert.equal(
    totals.spentMinor,
    200000 + 30000,
    'the refund link was cleared above',
  );
  // Changing the answer removes the old khata line.
  await fresh('post', `/txns/${dinner.id}/peer`, { peerTag: 'left' }).expect(
    200,
  );
  assert.equal((await contactByName(fresh, 'Rahul')).balance.actualMinor, 0);
  const khata = (await fresh('get', '/khata').expect(200)).body;
  assert.deepEqual(
    khata.left.map((row) => row.id),
    [dinner.id],
  );
  assert.equal((await overview(fresh)).leftCount, 1);
  await fresh('post', `/txns/${dinner.id}/peer`, {
    peerTag: 'borrowed',
  }).expect(400);
  await fresh('post', `/txns/${dinner.id}/peer`, { peerTag: null }).expect(200);
});

test('g: bulk import parse + save with only totals keeps the photo with each person', async () => {
  const { me } = moneyFixture();
  const big = jpeg(200000); // > 16 kb: only the photo route accepts it
  const photo = (
    await me('post', '/photos', {
      ownerType: 'khata_contact',
      ownerId: null,
      mime: 'image/jpeg',
      data: big,
      caption: 'Old notes',
    }).expect(201)
  ).body;
  assert.match(photo.id, /^[a-f\d]{24}$/);
  await me('post', '/khata/import/parse', {
    mode: 'bulk',
    text: 'x'.repeat(20000),
  }).expect(413);

  const parsed = (
    await me('post', '/khata/import/parse', {
      mode: 'bulk',
      text: userNotes,
      today: '2026-11-20',
    }).expect(200)
  ).body;
  assert.deepEqual(
    parsed.people.map((person) => person.name),
    ['Dadaji', 'Maa', 'Rohan'],
  );
  assert.equal(parsed.people[0].lines.length, 15);
  assert.equal(parsed.people[0].statedMinor, 8870000);
  assert.equal(parsed.people[0].choice, 'linesAndFix');
  const person = (
    await me('post', '/khata/import/parse', {
      mode: 'person',
      text: 'Maa - 68000 + 17000 (maa) - 20000 (rakesh mama 3 sep) - 50k geeta aunty',
      today: '2026-11-20',
    }).expect(200)
  ).body;
  assert.deepEqual(
    person.lines.map((line) => line.signedMinor / 100),
    [68000, 17000, -20000, -50000],
  );
  assert.equal(person.lines[2].date, '2026-09-03');
  assert.equal(person.totalMinor, 1500000);

  const saved = (
    await me('post', '/khata/import/save', {
      people: parsed.people.map((row) => ({ ...row, choice: 'totalOnly' })),
      photoIds: [photo.id],
    }).expect(201)
  ).body;
  assert.equal(saved.people, 3);
  assert.equal(
    saved.entries,
    1,
    'Maa and Rohan are settled, so only Dadaji gets a line',
  );
  for (const row of saved.contacts) {
    const detail = (await me('get', `/khata/contacts/${row.id}`).expect(200))
      .body;
    assert.equal(detail.photos.length, 1, row.name);
    assert.equal(detail.photos[0].caption, 'Old notes');
    assert.ok(detail.entries.length <= 1);
  }
  const dadaji = saved.contacts.find((row) => row.name === 'Dadaji');
  const detail = (await me('get', `/khata/contacts/${dadaji.id}`).expect(200))
    .body;
  assert.deepEqual(
    [
      detail.entries[0].note,
      detail.entries[0].isOpening,
      detail.balance.actualMinor,
    ],
    ['Old khata balance', true, -8870000],
  );
  const image = await me('get', `/photos/${detail.photos[0].id}`).expect(200);
  assert.equal(image.headers['content-type'], 'image/jpeg');
  assert.match(image.headers['cache-control'], /private/);
  assert.equal(image.body.length, Buffer.from(big, 'base64').length);

  // Deleting the person removes the photo; non-images and oversize photos are refused.
  await me('delete', `/khata/contacts/${dadaji.id}`).expect(204);
  await me('get', `/photos/${detail.photos[0].id}`).expect(404);
  await me('post', '/photos', {
    ownerType: 'txn',
    mime: 'image/png',
    data: jpeg(),
  }).expect(400);
  await me('post', '/photos', {
    ownerType: 'txn',
    mime: 'image/jpeg',
    data: jpeg(1600000),
  }).expect(413);
});

test('ownership: another user can never read, change or link my money', async () => {
  const { me, other } = moneyFixture();
  const txn = (await me('post', '/txns', spend()).expect(201)).body.txn;
  const contact = (
    await me('post', '/khata/contacts', { name: 'Rahul' }).expect(201)
  ).body.contact;
  const account = (await me('post', '/accounts', { name: 'HDFC' }).expect(201))
    .body.account;
  const entry = (
    await me('post', `/khata/contacts/${contact.id}/entries`, {
      direction: 'gave',
      amountMinor: 100,
      date: today(),
    }).expect(201)
  ).body.entry;
  const photo = (
    await me('post', '/photos', {
      ownerType: 'txn',
      ownerId: txn.id,
      mime: 'image/jpeg',
      data: jpeg(),
    }).expect(201)
  ).body;
  await other('patch', `/txns/${txn.id}`, { title: 'Mine now' }).expect(404);
  await other('delete', `/txns/${txn.id}`).expect(404);
  await other('post', `/txns/${txn.id}/reimburse/claim`, {}).expect(404);
  await other('get', `/khata/contacts/${contact.id}`).expect(404);
  await other('patch', `/khata/entries/${entry.id}`, { note: 'x' }).expect(404);
  await other('delete', `/accounts/${account.id}`).expect(404);
  await other('get', `/photos/${photo.id}`).expect(404);
  // My ids inside another user's body are rejected.
  const theirs = (await other('post', '/txns', spend()).expect(201)).body.txn;
  await other('post', `/txns/${theirs.id}/peer`, {
    peerTag: 'lent',
    contactId: contact.id,
  }).expect(404);
  await other('post', '/txns', spend({ accountId: account.id })).expect(404);
  await other('post', `/txns/${theirs.id}/transfer`, {
    otherId: txn.id,
  }).expect(404);
  await other('post', '/photos', {
    ownerType: 'khata_contact',
    ownerId: contact.id,
    mime: 'image/jpeg',
    data: jpeg(),
  }).expect(404);
  assert.equal((await other('get', '/txns').expect(200)).body.items.length, 1);
  assert.equal(
    (await other('get', '/khata').expect(200)).body.contacts.length,
    0,
  );
  assert.equal(
    (await me('get', '/txns').expect(200)).body.items[0].title,
    'Lunch',
  );
});

test('validation: bad amounts, dates, ids and unknown fields are refused', async () => {
  const { me } = moneyFixture();
  await me('post', '/txns', spend({ amountMinor: 10.5 })).expect(400);
  await me('post', '/txns', spend({ amountMinor: 0 })).expect(400);
  await me('post', '/txns', spend({ date: '2026-02-30' })).expect(400);
  await me('post', '/txns', spend({ category: 'Crypto' })).expect(400);
  await me('post', '/txns', { ...spend(), userId: 'owner-2' }).expect(400);
  await me('patch', '/txns/not-an-id', { title: 'x' }).expect(400);
  await me('patch', `/txns/${'a'.repeat(24)}`, {}).expect(400);
  await me('get', '/txns?limit=9999').expect(400);
  await me('get', '/overview?month=2026-13').expect(400);
  await me('post', '/khata/contacts', { name: '' }).expect(400);
  await me('put', '/budgets', {
    month: '2026-11',
    category: 'Salary',
    limitMinor: 100,
  }).expect(400);
  await me('post', '/khata/import/save', {
    people: [{ name: 'A', choice: 'maybe', lines: [] }],
  }).expect(400);
  const contact = (
    await me('post', '/khata/contacts', { name: 'Dada ji' }).expect(201)
  ).body.contact;
  await me('post', '/khata/contacts', { name: 'DADAJI' }).expect(409);
  await me('post', `/khata/contacts/${contact.id}/adjustments`, {
    type: 'gift',
    amountMinor: 100,
  }).expect(400);
});

test('transactions: manual add is idempotent with clientKey, list filters, paging and soft delete', async () => {
  const { me } = moneyFixture();
  const first = await me(
    'post',
    '/txns',
    spend({ clientKey: 'client-key-1', title: 'Chai' }),
  ).expect(201);
  const retry = await me(
    'post',
    '/txns',
    spend({ clientKey: 'client-key-1', title: 'Chai' }),
  ).expect(200);
  assert.equal(retry.body.txn.id, first.body.txn.id);
  for (let index = 0; index < 4; index++)
    await me(
      'post',
      '/txns',
      spend({
        date: daysAgo(index + 1),
        title: `Item ${index}`,
        amountMinor: 1000 + index,
      }),
    ).expect(201);
  const page = (await me('get', '/txns?limit=2').expect(200)).body;
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  const next = (
    await me('get', `/txns?limit=2&cursor=${page.nextCursor}`).expect(200)
  ).body;
  assert.equal(next.items.length, 2);
  assert.equal(
    new Set([...page.items, ...next.items].map((row) => row.id)).size,
    4,
  );
  const last = (
    await me('get', `/txns?limit=2&cursor=${next.nextCursor}`).expect(200)
  ).body;
  assert.deepEqual([last.items.length, last.nextCursor], [1, null]);
  assert.equal(
    (await me('get', `/txns?from=${daysAgo(2)}&to=${daysAgo(1)}`).expect(200))
      .body.items.length,
    2,
  );
  assert.equal(
    (await me('get', '/txns?q=chai').expect(200)).body.items.length,
    1,
  );
  assert.ok(
    page.items.every(
      (row) => typeof row.ownMinor === 'number' && !('sourceKeys' in row),
    ),
  );

  const edited = (
    await me('patch', `/txns/${first.body.txn.id}`, {
      title: 'Masala chai',
      category: 'Food',
      purpose: 'Office',
    }).expect(200)
  ).body.txn;
  assert.deepEqual([edited.title, edited.purpose], ['Masala chai', 'Office']);
  await me('delete', `/txns/${first.body.txn.id}`).expect(204);
  await me('delete', `/txns/${first.body.txn.id}`).expect(404);
  assert.equal((await me('get', '/txns').expect(200)).body.items.length, 4);
  // A deleted bank capture never comes back when the phone sends it again.
  const item = capture();
  const [made] = (
    await me('post', '/txns/ingest', { items: [item] }).expect(200)
  ).body.items;
  await me('delete', `/txns/${made.txn.id}`).expect(204);
  const [resent] = (
    await me('post', '/txns/ingest', { items: [item] }).expect(200)
  ).body.items;
  assert.equal(resent.status, 'duplicate');
  assert.equal((await me('get', '/txns').expect(200)).body.items.length, 4);
  // CSV export, with formula-looking text neutralised.
  await me('post', '/txns', spend({ title: '=HYPERLINK("x")' })).expect(201);
  const csv = await me('get', '/export.csv').expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /^Date,Time,Title/);
  assert.match(csv.text, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv.text, /,100\.00,100\.00,/);
});

test('accounts: balances, credit card numbers, owner cards past and future, match bank, bill paid', async () => {
  const { me } = moneyFixture();
  const bank = (
    await me('post', '/accounts', {
      name: 'HDFC',
      openingMinor: 500000,
      followBank: false,
    }).expect(201)
  ).body.account;
  assert.equal(bank.balanceMinor, 500000);
  const card = (
    await me('post', '/accounts', {
      name: 'Axis Card',
      type: 'credit_card',
      creditLimitMinor: 10000000,
      statementDay: 5,
      billMinor: 2000000,
      dueDate: daysAgo(-3),
    }).expect(201)
  ).body.account;
  await me(
    'post',
    '/txns',
    spend({ amountMinor: 3000000, accountId: card.id }),
  ).expect(201);
  await me(
    'post',
    '/txns',
    spend({ amountMinor: 100000, accountId: bank.id }),
  ).expect(201);
  let accounts = (await me('get', '/accounts').expect(200)).body.items;
  const axis = accounts.find((row) => row.id === card.id);
  assert.equal(axis.balanceMinor, -3000000);
  assert.deepEqual(
    [
      axis.card.outstanding,
      axis.card.available,
      axis.card.usagePct,
      axis.card.daysToDue,
      axis.card.overdue,
    ],
    [3000000, 7000000, 30, 3, false],
  );
  assert.equal(accounts.find((row) => row.id === bank.id).balanceMinor, 400000);
  let totals = await overview(me);
  assert.equal(totals.netWorthMinor, 400000 - 3000000);
  assert.ok(
    totals.comingUp.some(
      (row) => row.kind === 'card_bill' && row.amountMinor === 2000000,
    ),
  );
  const paid = (await me('post', `/accounts/${card.id}/bill-paid`).expect(200))
    .body.account;
  assert.equal(paid.card.dueState, 'paid');
  await me('post', `/accounts/${bank.id}/bill-paid`).expect(400);

  // followBank:false keeps "Bank said ₹X" until the user matches it.
  await me('post', '/txns/ingest', {
    items: [capture({ last4: '', amountMinor: 100 })],
  }).expect(200);
  await me('patch', `/accounts/${bank.id}`, {
    last4: '4821',
    bank: 'HDFC Bank',
  }).expect(200);
  await me('post', '/txns/ingest', {
    items: [
      capture({
        last4: '4821',
        amountMinor: 20000,
        availableBalanceMinor: 900000,
      }),
    ],
  }).expect(200);
  let hdfc = (await me('get', '/accounts').expect(200)).body.items.find(
    (row) => row.id === bank.id,
  );
  assert.deepEqual([hdfc.balanceMinor, hdfc.bankSaidMinor], [380000, 900000]);
  hdfc = (await me('post', `/accounts/${bank.id}/match-bank`).expect(200)).body
    .account;
  assert.equal(hdfc.balanceMinor, 900000);

  // Setting an owner later tags every past payment on the card; clearing it removes them.
  const old = (
    await me('post', '/accounts', {
      name: 'Old card',
      type: 'credit_card',
    }).expect(201)
  ).body.account;
  await me(
    'post',
    '/txns',
    spend({ amountMinor: 5000, accountId: old.id }),
  ).expect(201);
  await me('patch', `/accounts/${old.id}`, { ownerName: 'Bhaiya' }).expect(200);
  assert.equal((await contactByName(me, 'Bhaiya')).balance.actualMinor, -5000);
  totals = await overview(me);
  assert.equal(totals.khata.iOweMinor, 5000);
  await me('patch', `/accounts/${old.id}`, { ownerName: null }).expect(200);
  assert.equal((await contactByName(me, 'Bhaiya')).balance.actualMinor, 0);
  // Deleting an account keeps its payments.
  await me('delete', `/accounts/${old.id}`).expect(204);
  const kept = (await me('get', '/txns').expect(200)).body.items.find(
    (row) => row.amountMinor === 5000,
  );
  assert.equal(kept.accountId, null);
  accounts = (await me('get', '/accounts').expect(200)).body.items;
  assert.equal(
    accounts.some((row) => row.id === old.id),
    false,
  );
});

test('khata: adjustments, swap, contact edits and deletes keep payments honest', async () => {
  const { me } = moneyFixture();
  const contact = (
    await me('post', '/khata/contacts', {
      name: 'Dadaji',
      phone: '9876543210',
    }).expect(201)
  ).body.contact;
  await me('post', `/khata/contacts/${contact.id}/entries`, {
    direction: 'gave',
    amountMinor: 10000000,
    date: daysAgo(30),
    dueDate: daysAgo(2),
  }).expect(201);
  await me('post', `/khata/contacts/${contact.id}/entries`, {
    direction: 'got',
    amountMinor: 1130000,
    date: daysAgo(10),
  }).expect(201);
  const lent = (
    await me(
      'post',
      '/txns',
      spend({ amountMinor: 20000, title: 'Dadaji', counterparty: 'Dadaji' }),
    ).expect(201)
  ).body.txn;
  await me('post', `/txns/${lent.id}/peer`, {
    peerTag: 'lent',
    contactId: contact.id,
  }).expect(200);
  let detail = (await me('get', `/khata/contacts/${contact.id}`).expect(200))
    .body;
  assert.equal(detail.balance.actualMinor, 10000000 - 1130000 + 20000);
  const khata = (await me('get', '/khata').expect(200)).body;
  assert.equal(khata.contacts[0].overdue, true);
  assert.equal(khata.owedToMeMinor, 10000000 - 1130000 + 20000);
  const fromPayment = detail.entries.find(
    (entry) => entry.linkedTxnId === lent.id,
  );
  await me('patch', `/khata/entries/${fromPayment.id}`, {
    amountMinor: 1,
  }).expect(400);

  const swapped = (
    await me('post', `/khata/contacts/${contact.id}/swap`, {}).expect(200)
  ).body;
  assert.equal(swapped.changed, 2);
  assert.equal(swapped.balance.actualMinor, -10000000 + 1130000 + 20000);

  const waived = (
    await me('post', `/khata/contacts/${contact.id}/adjustments`, {
      type: 'waived',
      amountMinor: 50000,
      note: 'Diwali',
    }).expect(201)
  ).body.adjustment;
  assert.equal(waived.deltaMinor, 50000, 'toward zero from a negative balance');
  detail = (await me('get', `/khata/contacts/${contact.id}`).expect(200)).body;
  assert.equal(
    detail.balance.adjustedMinor,
    detail.balance.actualMinor + 50000,
  );
  await me('patch', `/khata/adjustments/${waived.id}`, {
    active: false,
  }).expect(200);
  detail = (await me('get', `/khata/contacts/${contact.id}`).expect(200)).body;
  assert.equal(detail.balance.adjustedMinor, detail.balance.actualMinor);
  await me('delete', `/khata/adjustments/${waived.id}`).expect(204);

  await me('patch', `/khata/contacts/${contact.id}`, {
    name: 'Dada ji',
    note: 'Dad',
  }).expect(200);
  // Deleting the person removes their lines; the bank payment counts normally again.
  await me('delete', `/khata/contacts/${contact.id}`).expect(204);
  const again = (await me('get', '/txns').expect(200)).body.items.find(
    (row) => row.id === lent.id,
  );
  assert.deepEqual(
    [again.peerTag, again.peerShareMinor, again.contactId],
    [null, 0, null],
  );
  assert.equal((await overview(me)).spentMinor, 20000);
});

test('budgets and merchant memory: categories are remembered and back-filled', async () => {
  const { me } = moneyFixture();
  const month = today().slice(0, 7);
  await me('put', '/budgets', {
    month,
    category: '*',
    limitMinor: 5000000,
  }).expect(200);
  const food = (
    await me('put', '/budgets', {
      month,
      category: 'Food',
      limitMinor: 600000,
    }).expect(200)
  ).body.budget;
  await me('put', '/budgets', {
    month,
    category: 'Food',
    limitMinor: 700000,
  }).expect(200);
  await me(
    'post',
    '/txns',
    spend({ amountMinor: 25000, title: 'Swiggy', category: 'Food' }),
  ).expect(201);
  const budgets = (await me('get', `/budgets?month=${month}`).expect(200)).body
    .items;
  assert.deepEqual(
    budgets.map((row) => [row.category, row.limitMinor, row.usedMinor]),
    [
      ['*', 5000000, 25000],
      ['Food', 700000, 25000],
    ],
  );
  assert.deepEqual((await overview(me)).budget, {
    limitMinor: 5000000,
    usedMinor: 25000,
  });
  await me('delete', `/budgets/${food.id}`).expect(204);

  // A capture from the same merchant gets the remembered category.
  const [swiggy] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({ counterparty: 'SWIGGY', title: '', amountMinor: 30000 }),
      ],
    }).expect(200)
  ).body.items;
  assert.equal(swiggy.txn.category, 'Food');
  assert.equal(swiggy.txn.title, 'Swiggy');
  const [uber] = (
    await me('post', '/txns/ingest', {
      items: [
        capture({ counterparty: 'UBER INDIA', title: '', amountMinor: 30100 }),
      ],
    }).expect(200)
  ).body.items;
  assert.equal(uber.txn.category, 'Other');
  const merchants = (await me('get', '/merchants').expect(200)).body.items;
  assert.deepEqual(
    merchants.map((row) => [row.key, row.category]),
    [['SWIGGY', 'Food']],
  );
  const result = (
    await me(
      'patch',
      `/merchants/${encodeURIComponent(uber.txn.merchantKey)}`,
      { category: 'Travel' },
    ).expect(200)
  ).body;
  assert.equal(result.updatedTxns, 1);
  const backfilled = (await me('get', '/txns?category=Travel').expect(200)).body
    .items;
  assert.deepEqual(
    backfilled.map((row) => row.id),
    [uber.txn.id],
  );
  await me('patch', '/merchants/NOPE', { category: 'Travel' }).expect(404);
});

test('overview shape: trend for 12 months, daily rows for the whole month, top merchants', async () => {
  const { me } = moneyFixture();
  await me(
    'post',
    '/txns',
    spend({ amountMinor: 30000, title: 'Swiggy' }),
  ).expect(201);
  await me(
    'post',
    '/txns',
    spend({ amountMinor: 20000, title: 'Swiggy' }),
  ).expect(201);
  await me(
    'post',
    '/txns',
    spend({
      amountMinor: 900000,
      direction: 'credit',
      title: 'Salary',
      category: 'Salary',
    }),
  ).expect(201);
  const body = await overview(me);
  assert.equal(body.month, today().slice(0, 7));
  assert.equal(body.trend.length, 12);
  assert.equal(body.trend.at(-1).month, body.month);
  assert.deepEqual(
    [body.trend.at(-1).spentMinor, body.trend.at(-1).incomeMinor],
    [50000, 900000],
  );
  assert.equal(
    body.daily.length,
    new Date(
      Date.UTC(
        Number(body.month.slice(0, 4)),
        Number(body.month.slice(5, 7)),
        0,
      ),
    ).getUTCDate(),
  );
  assert.deepEqual(body.topMerchants, [
    { title: 'Swiggy', minor: 50000, count: 2 },
  ]);
  assert.deepEqual(body.khata, { owedToMeMinor: 0, iOweMinor: 0, netMinor: 0 });
  assert.equal(body.netMinor, 850000);
  for (const key of [
    'budget',
    'byCategory',
    'netWorthMinor',
    'reviewCount',
    'leftCount',
    'reimburse',
    'comingUp',
  ])
    assert.ok(key in body, key);
});
