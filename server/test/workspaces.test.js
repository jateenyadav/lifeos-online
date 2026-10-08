import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth.js';

function fixture() {
  const rows = new Map();
  let counter = 0;
  const publicRow = (row) => {
    if (!row || row.deleted) return null;
    const copy = { ...row };
    delete copy.userId;
    delete copy.notificationKey;
    delete copy.deleted;
    return copy;
  };
  const find = (collection, owner, id) => {
    const row = rows.get(`${collection}:${id}`);
    return row?.userId === owner ? row : null;
  };
  const store = {
    list: async (collection, owner) =>
      [...rows.entries()]
        .filter(
          ([key, row]) =>
            key.startsWith(`${collection}:`) &&
            row.userId === owner &&
            !row.deleted,
        )
        .map(([, row]) => publicRow(row)),
    find: async (collection, owner, id) =>
      publicRow(find(collection, owner, id)),
    create: async (collection, owner, values) => {
      const existing =
        collection === 'budgets' &&
        [...rows.entries()].find(
          ([key, row]) =>
            key.startsWith('budgets:') &&
            row.userId === owner &&
            row.month === values.month,
        );
      const id = existing
        ? existing[1].id
        : (++counter).toString(16).padStart(24, '0');
      const row = {
        id,
        userId: owner,
        ...values,
        ...(collection === 'routines' ? { completedDates: [] } : {}),
      };
      rows.set(`${collection}:${id}`, row);
      return publicRow(row);
    },
    update: async (collection, owner, id, values) => {
      const row = find(collection, owner, id);
      if (!row) return null;
      Object.assign(row, values);
      return publicRow(row);
    },
    remove: async (collection, owner, id) => {
      const row = find(collection, owner, id);
      if (!row || row.deleted) return false;
      if (['notification', 'payment'].includes(row.source)) {
        row.deleted = true;
        return true;
      }
      return rows.delete(`${collection}:${id}`);
    },
    importExpense: async (owner, values) => {
      const previous = [...rows.entries()].find(
        ([key, row]) =>
          key.startsWith('expenses:') &&
          row.userId === owner &&
          row.notificationKey === values.notificationKey,
      )?.[1];
      return previous
        ? publicRow(previous)
        : store.create('expenses', owner, {
            ...values,
            source: values.source ?? 'notification',
          });
    },
    capturePayment: async (owner, values) => {
      const existing = [...rows.entries()].find(
        ([key, row]) =>
          key.startsWith('payments:') &&
          row.userId === owner &&
          row.notificationKey === values.notificationKey,
      )?.[1];
      return existing
        ? publicRow(existing)
        : store.create('payments', owner, values);
    },
    confirmPayment: async (owner, id, values) => {
      const row = find('payments', owner, id);
      if (!row || row.status === 'dismissed') return null;
      if (
        row.status === 'confirmed' &&
        Object.entries(values).some(([key, value]) => row[key] !== value)
      )
        return null;
      Object.assign(row, values, { status: 'confirmed' });
      return { ...publicRow(row), notificationKey: row.notificationKey };
    },
    dismissPayment: async (owner, id) => {
      const row = find('payments', owner, id);
      if (!row || row.status === 'confirmed') return null;
      row.status = 'dismissed';
      return publicRow(row);
    },
    findPayee: async (owner, recipientKey) =>
      publicRow(
        [...rows.entries()].find(
          ([key, row]) =>
            key.startsWith('payees:') &&
            row.userId === owner &&
            row.recipientKey === recipientKey,
        )?.[1],
      ),
    rememberPayee: async (owner, values) => {
      const previous = await store.findPayee(owner, values.recipientKey);
      return previous
        ? store.update('payees', owner, previous.id, values)
        : store.create('payees', owner, values);
    },
    createTripItem: async (owner, values) => {
      const existing = [...rows.entries()].find(
        ([key, row]) =>
          key.startsWith('tripItems:') &&
          row.userId === owner &&
          row.clientKey === values.clientKey,
      )?.[1];
      return existing
        ? publicRow(existing)
        : store.create('tripItems', owner, values);
    },
    checkRoutine: async (owner, id, date, completed) => {
      const row = find('routines', owner, id);
      if (!row) return null;
      row.completedDates = completed
        ? [...new Set([...row.completedDates, date])]
        : row.completedDates.filter((value) => value !== date);
      return publicRow(row);
    },
  };
  const tokens = ['a'.repeat(43), 'b'.repeat(43)];
  const owners = [
    { _id: 'owner-1', name: 'First', email: 'first@example.com' },
    { _id: 'owner-2', name: 'Second', email: 'second@example.com' },
  ];
  const app = createApp({
    config: {
      webOrigins: ['http://localhost:5173'],
      sessionDays: 7,
      production: false,
      cookieSameSite: 'lax',
      trustProxyHops: 0,
    },
    users: { findById: async (id) => owners.find((owner) => owner._id === id) },
    sessions: {
      findActive: async (hash) => {
        const index = tokens.findIndex((token) => hashToken(token) === hash);
        return index < 0
          ? null
          : {
              userId: owners[index]._id,
              expiresAt: new Date(Date.now() + 60000),
            };
      },
    },
    verifyGoogle: async () => {},
    workspaces: store,
  });
  return { app, tokens };
}
const call = (app, token, method, path) => {
  const agent = request(app);
  return agent[method](`/api/workspaces${path}`)
    .set('X-Client-Type', 'mobile')
    .set('Authorization', `Bearer ${token}`);
};
const note = { title: 'A useful thought', body: 'Keep this body', tag: 'Work' };
const routine = {
  title: 'Evening skin care',
  category: 'Skin care',
  time: 'Evening',
  days: [0, 1, 2, 3, 4, 5, 6],
};

const reviewedPayment = {
  title: 'Lunch',
  date: '2026-10-07',
  amountMinor: 12550,
  kind: 'expense',
  person: 'Lunch shop',
  recipientKey: 'shop@upi',
  category: 'Food',
  payment: 'UPI',
  note: '',
  remember: true,
};
const capturedPayment = {
  title: 'Notification lunch',
  date: '2026-10-07',
  amountMinor: 12550,
  category: 'Other',
  payment: 'UPI',
  note: '',
  notificationKey: 'a'.repeat(64),
  sourceApp: 'com.example.bank',
  currency: 'INR',
  recipientKey: 'shop@upi',
  direction: 'outgoing',
};

test('new notifications await review and remembered recipients prefill only details', async () => {
  const { app, tokens } = fixture();
  const candidate = await call(app, tokens[0], 'post', '/money/notifications')
    .send(capturedPayment)
    .expect(200);
  assert.equal(candidate.body.entry.status, 'pending');
  assert.equal((await call(app, tokens[0], 'get', '')).body.expenses.length, 0);
  const path = `/money/payments/${candidate.body.entry.id}/confirm`;
  const confirmed = await call(app, tokens[0], 'post', path)
    .send(reviewedPayment)
    .expect(200);
  assert.equal(confirmed.body.entry.notificationKey, undefined);
  await call(app, tokens[0], 'post', path).send(reviewedPayment).expect(200);
  const saved = (await call(app, tokens[0], 'get', '')).body;
  assert.equal(saved.expenses.length, 1);
  assert.equal(saved.expenses[0].amountMinor, 12550);
  assert.equal(saved.payees.length, 1);
  const next = await call(app, tokens[0], 'post', '/money/notifications')
    .send({
      ...capturedPayment,
      notificationKey: 'b'.repeat(64),
      amountMinor: 25000,
    })
    .expect(200);
  assert.equal(next.body.entry.title, 'Lunch');
  assert.equal(next.body.entry.person, 'Lunch shop');
  assert.equal(next.body.entry.suggested, true);
  assert.equal(next.body.entry.amountMinor, 25000);
  assert.equal(next.body.entry.status, 'pending');
  const other = await call(app, tokens[1], 'post', '/money/notifications')
    .send({ ...capturedPayment, notificationKey: 'b'.repeat(64) })
    .expect(200);
  assert.notEqual(other.body.entry.suggested, true);
});

test('self transfers and ignored alerts never become expenses', async () => {
  const { app, tokens } = fixture();
  const candidate = await call(app, tokens[0], 'post', '/money/notifications')
    .send(capturedPayment)
    .expect(200);
  await call(
    app,
    tokens[1],
    'post',
    `/money/payments/${candidate.body.entry.id}/confirm`,
  )
    .send(reviewedPayment)
    .expect(404);
  await call(
    app,
    tokens[0],
    'post',
    `/money/payments/${candidate.body.entry.id}/confirm`,
  )
    .send({ ...reviewedPayment, kind: 'self_transfer' })
    .expect(200);
  const ignored = await call(app, tokens[0], 'post', '/money/notifications')
    .send({ ...capturedPayment, notificationKey: 'c'.repeat(64) })
    .expect(200);
  await call(
    app,
    tokens[0],
    'post',
    `/money/payments/${ignored.body.entry.id}/dismiss`,
  )
    .send({})
    .expect(200);
  await call(
    app,
    tokens[0],
    'post',
    `/money/payments/${ignored.body.entry.id}/confirm`,
  )
    .send(reviewedPayment)
    .expect(409);
  const retried = await call(app, tokens[0], 'post', '/money/notifications')
    .send({ ...capturedPayment, notificationKey: 'c'.repeat(64) })
    .expect(200);
  assert.equal(retried.body.entry.status, 'dismissed');
  assert.equal((await call(app, tokens[0], 'get', '')).body.expenses.length, 0);
});

test('money with people tracks lending, returns, further lending and borrowing', async () => {
  const { app, tokens } = fixture();
  for (const [clientKey, kind, amountMinor] of [
    ['money-0001', 'lent', 100000],
    ['money-0002', 'repayment_received', 40000],
    ['money-0003', 'lent', 20000],
  ])
    await call(app, tokens[0], 'post', '/money/payments')
      .send({
        ...reviewedPayment,
        clientKey,
        kind,
        amountMinor,
        person: 'Amit',
        remember: false,
      })
      .expect(200);
  const summary = await call(app, tokens[0], 'get', '/money/summary').expect(
    200,
  );
  assert.deepEqual(summary.body.people, [
    {
      person: 'Amit',
      balanceMinor: 80000,
      gaveMinor: 120000,
      receivedMinor: 40000,
    },
  ]);
  const retry = {
    ...reviewedPayment,
    clientKey: 'money-0003',
    kind: 'lent',
    amountMinor: 20000,
    person: 'Amit',
    remember: false,
  };
  await call(app, tokens[0], 'post', '/money/payments').send(retry).expect(200);
  await call(app, tokens[0], 'post', '/money/payments')
    .send({ ...retry, amountMinor: 50000 })
    .expect(409);
  assert.equal((await call(app, tokens[0], 'get', '')).body.payments.length, 3);
  assert.equal((await call(app, tokens[0], 'get', '')).body.expenses.length, 0);
});

test('incoming payment review accepts repayments but not spending', async () => {
  const { app, tokens } = fixture();
  const candidate = await call(app, tokens[0], 'post', '/money/notifications')
    .send({ ...capturedPayment, direction: 'incoming' })
    .expect(200);
  const path = `/money/payments/${candidate.body.entry.id}/confirm`;
  await call(app, tokens[0], 'post', path).send(reviewedPayment).expect(400);
  await call(app, tokens[0], 'post', path)
    .send({ ...reviewedPayment, kind: 'repayment_received' })
    .expect(200);
  assert.equal((await call(app, tokens[0], 'get', '')).body.expenses.length, 0);
});

test('trip splits preserve every paise and repayments change balances only', async () => {
  const { app, tokens } = fixture();
  const trip = await call(app, tokens[0], 'post', '/money/trips')
    .send({
      title: 'Goa',
      members: ['Me', 'Amit', 'Riya'],
      budgetMinor: 100000,
    })
    .expect(201);
  const item = {
    clientKey: 'trip-cost-0001',
    tripId: trip.body.entry.id,
    title: 'Hotel',
    date: '2026-10-07',
    amountMinor: 10001,
    kind: 'expense',
    payer: 'Me',
    participants: ['Me', 'Amit', 'Riya'],
  };
  await call(app, tokens[0], 'post', '/money/trip-items')
    .send(item)
    .expect(200);
  await call(app, tokens[0], 'post', '/money/trip-items')
    .send(item)
    .expect(200);
  let summary = await call(app, tokens[0], 'get', '/money/summary').expect(200);
  assert.deepEqual(summary.body.trips[0].balances, {
    Me: 6667,
    Amit: -3334,
    Riya: -3333,
  });
  assert.equal(
    Object.values(summary.body.trips[0].balances).reduce(
      (sum, value) => sum + value,
      0,
    ),
    0,
  );
  await call(app, tokens[0], 'post', '/money/trip-items')
    .send({
      ...item,
      clientKey: 'trip-return-001',
      title: 'Repayment',
      kind: 'settlement',
      payer: 'Amit',
      participants: ['Me'],
      amountMinor: 3334,
    })
    .expect(200);
  summary = await call(app, tokens[0], 'get', '/money/summary').expect(200);
  assert.deepEqual(summary.body.trips[0].balances, {
    Me: 3333,
    Amit: 0,
    Riya: -3333,
  });
  await call(app, tokens[1], 'post', '/money/trip-items')
    .send(item)
    .expect(404);
  await call(app, tokens[0], 'post', '/money/trip-items')
    .send({ ...item, clientKey: 'trip-bad-0001', participants: ['Unknown'] })
    .expect(400);
  await call(app, tokens[0], 'post', '/money/trip-items')
    .send({
      ...item,
      clientKey: 'trip-bad-0002',
      kind: 'settlement',
      participants: ['Me'],
      payer: 'Me',
    })
    .expect(400);
});

test('money routes reject unsafe data and unsupported direct edits', async () => {
  const { app, tokens } = fixture();
  await call(app, '', 'post', '/money/payments')
    .send({ ...reviewedPayment, clientKey: 'missing-auth' })
    .expect(401);
  for (const patch of [
    { person: '', kind: 'lent' },
    { recipientKey: 'account number' },
    { recipientKey: '', remember: true },
    { amountMinor: 1.2 },
    { rawText: 'Do not store this' },
    { userId: 'owner-2' },
  ]) {
    await call(app, tokens[0], 'post', '/money/payments')
      .send({ ...reviewedPayment, clientKey: 'invalid-0001', ...patch })
      .expect(400);
  }
  await call(app, tokens[0], 'post', '/payments')
    .send(reviewedPayment)
    .expect(404);
  await call(app, tokens[0], 'post', '/money/trips')
    .send({ title: 'Trip', members: ['Me', 'me'] })
    .expect(400);
});

test('workspaces require a valid session for reads and writes', async () => {
  const { app } = fixture();
  for (const [method, path] of [
    ['get', ''],
    ['post', '/notes'],
    ['post', '/notification-expenses'],
    ['patch', '/notes/000000000000000000000001'],
    ['delete', '/notes/000000000000000000000001'],
  ])
    await call(app, '', method, path)
      .send(method === 'get' ? undefined : note)
      .expect(401);
});

const notificationExpense = {
  title: 'Payment to Lunch shop',
  date: '2026-10-07',
  amountMinor: 12550,
  category: 'Other',
  payment: 'UPI',
  note: 'Auto-added. Check the details.',
  notificationKey: 'a'.repeat(64),
  sourceApp: 'com.example.bank',
  currency: 'INR',
};

test('notification expenses are private, validated and saved once on retry', async () => {
  const { app, tokens } = fixture();
  const first = await call(app, tokens[0], 'post', '/notification-expenses')
    .send(notificationExpense)
    .expect(200);
  assert.equal(first.body.entry.source, 'notification');
  assert.equal(first.body.entry.sourceApp, notificationExpense.sourceApp);
  assert.equal(first.body.entry.notificationKey, undefined);
  const retry = await call(app, tokens[0], 'post', '/notification-expenses')
    .send(notificationExpense)
    .expect(200);
  assert.equal(retry.body.entry.id, first.body.entry.id);
  assert.equal((await call(app, tokens[0], 'get', '')).body.expenses.length, 1);
  assert.equal((await call(app, tokens[1], 'get', '')).body.expenses.length, 0);
  const separate = await call(app, tokens[1], 'post', '/notification-expenses')
    .send(notificationExpense)
    .expect(200);
  assert.notEqual(separate.body.entry.id, first.body.entry.id);
  for (const invalid of [
    { currency: 'USD' },
    { amountMinor: 1.5 },
    { amountMinor: 0 },
    { notificationKey: 'wrong' },
    { sourceApp: '' },
    { date: '2026-02-30' },
    { userId: 'owner-2' },
    { rawText: 'Do not upload full messages' },
  ]) {
    await call(app, tokens[0], 'post', '/notification-expenses')
      .send({ ...notificationExpense, ...invalid })
      .expect(400);
  }
});

test('notification retry never overwrites edits or restores a deleted expense', async () => {
  const { app, tokens } = fixture();
  const first = await call(app, tokens[0], 'post', '/notification-expenses')
    .send(notificationExpense)
    .expect(200);
  const path = `/expenses/${first.body.entry.id}`;
  await call(app, tokens[0], 'patch', path)
    .send({ title: 'Corrected lunch', category: 'Food' })
    .expect(200);
  const retried = await call(app, tokens[0], 'post', '/notification-expenses')
    .send(notificationExpense)
    .expect(200);
  assert.equal(retried.body.entry.title, 'Corrected lunch');
  assert.equal(retried.body.entry.category, 'Food');
  await call(app, tokens[1], 'delete', path).expect(404);
  await call(app, tokens[0], 'delete', path).expect(204);
  await call(app, tokens[0], 'delete', path).expect(404);
  const deleted = await call(app, tokens[0], 'post', '/notification-expenses')
    .send(notificationExpense)
    .expect(200);
  assert.equal(deleted.body.entry, null);
  assert.equal((await call(app, tokens[0], 'get', '')).body.expenses.length, 0);
  await call(app, tokens[0], 'patch', path)
    .send({ title: 'Restore secretly' })
    .expect(404);
});

test('creates and lists real entries for every space without exposing ownership', async () => {
  const { app, tokens } = fixture();
  for (const [collection, values] of [
    ['notes', note],
    ['notes', { title: 'A reminder', kind: 'reminder', dueDate: '2026-10-07' }],
    [
      'workouts',
      { title: 'Walk', date: '2026-10-07', type: 'Cardio', duration: 20 },
    ],
    ['routines', routine],
    [
      'expenses',
      {
        title: 'Lunch',
        date: '2026-10-07',
        category: 'Food',
        amountMinor: 12550,
      },
    ],
  ]) {
    const result = await call(app, tokens[0], 'post', `/${collection}`)
      .send(values)
      .expect(201);
    assert.match(result.body.entry.id, /^[a-f\d]{24}$/);
    assert.equal(result.body.entry.userId, undefined);
  }
  const snapshot = await call(app, tokens[0], 'get', '').expect(200);
  assert.equal(snapshot.body.notes.length, 2);
  assert.equal(snapshot.body.workouts[0].effort, 'Moderate');
  assert.deepEqual(snapshot.body.routines[0].completedDates, []);
  assert.equal(snapshot.body.expenses[0].amountMinor, 12550);
  const other = await call(app, tokens[1], 'get', '').expect(200);
  assert.ok(Object.values(other.body).every((entries) => entries.length === 0));
});

test('partial edits preserve unedited fields and cannot change protected fields', async () => {
  const { app, tokens } = fixture();
  const created = await call(app, tokens[0], 'post', '/notes')
    .send(note)
    .expect(201);
  const id = created.body.entry.id;
  const edited = await call(app, tokens[0], 'patch', `/notes/${id}`)
    .send({ pinned: true })
    .expect(200);
  assert.equal(edited.body.entry.body, note.body);
  assert.equal(edited.body.entry.tag, 'Work');
  assert.equal(edited.body.entry.pinned, true);
  for (const patch of [
    { userId: 'owner-2' },
    { id: 'other' },
    {},
    { title: '' },
  ])
    await call(app, tokens[0], 'patch', `/notes/${id}`).send(patch).expect(400);
  await call(app, tokens[1], 'patch', `/notes/${id}`)
    .send({ title: 'Take over' })
    .expect(404);
  await call(app, tokens[1], 'delete', `/notes/${id}`).expect(404);
  await call(app, tokens[0], 'delete', `/notes/${id}`).expect(204);
  assert.equal((await call(app, tokens[0], 'get', '')).body.notes.length, 0);
});

test('reminder completion and archive edits do not erase the reminder date or body', async () => {
  const { app, tokens } = fixture();
  const created = await call(app, tokens[0], 'post', '/notes').send({
    ...note,
    kind: 'reminder',
    dueDate: '2026-10-07',
  });
  const result = await call(
    app,
    tokens[0],
    'patch',
    `/notes/${created.body.entry.id}`,
  )
    .send({ completed: true, archived: true })
    .expect(200);
  assert.equal(result.body.entry.kind, 'reminder');
  assert.equal(result.body.entry.dueDate, '2026-10-07');
  assert.equal(result.body.entry.body, note.body);
});

test('routine check-ins are idempotent, reversible, and private', async () => {
  const { app, tokens } = fixture();
  const created = await call(app, tokens[0], 'post', '/routines')
    .send(routine)
    .expect(201);
  const path = `/routines/${created.body.entry.id}/check`;
  for (let count = 0; count < 2; count++)
    await call(app, tokens[0], 'post', path)
      .send({ date: '2026-10-07', completed: true })
      .expect(200);
  assert.deepEqual(
    (await call(app, tokens[0], 'get', '')).body.routines[0].completedDates,
    ['2026-10-07'],
  );
  await call(app, tokens[1], 'post', path)
    .send({ date: '2026-10-07', completed: true })
    .expect(404);
  const edited = await call(
    app,
    tokens[0],
    'patch',
    `/routines/${created.body.entry.id}`,
  )
    .send({ title: 'New routine name' })
    .expect(200);
  assert.deepEqual(edited.body.entry.completedDates, ['2026-10-07']);
  const undone = await call(app, tokens[0], 'post', path)
    .send({ date: '2026-10-07', completed: false })
    .expect(200);
  assert.deepEqual(undone.body.entry.completedDates, []);
});

test('budgets update one month without replacing another month or another owner', async () => {
  const { app, tokens } = fixture();
  const first = await call(app, tokens[0], 'post', '/budgets').send({
    month: '2026-10',
    limitMinor: 100000,
  });
  const second = await call(app, tokens[0], 'post', '/budgets').send({
    month: '2026-10',
    limitMinor: 200000,
  });
  assert.equal(first.body.entry.id, second.body.entry.id);
  await call(app, tokens[0], 'post', '/budgets')
    .send({ month: '2026-09', limitMinor: 50000 })
    .expect(201);
  await call(app, tokens[1], 'post', '/budgets')
    .send({ month: '2026-10', limitMinor: 70000 })
    .expect(201);
  assert.equal((await call(app, tokens[0], 'get', '')).body.budgets.length, 2);
  assert.equal(
    (await call(app, tokens[1], 'get', '')).body.budgets[0].limitMinor,
    70000,
  );
});

test('rejects impossible dates, invalid amounts, duplicate days, and unknown fields', async () => {
  const { app, tokens } = fixture();
  for (const [collection, values] of [
    ['notes', { title: 'Reminder', kind: 'reminder' }],
    ['notes', { ...note, dueDate: '2026-02-29' }],
    ['routines', { ...routine, days: [1, 1] }],
    ['routines', { ...routine, completedDates: ['2026-10-07'] }],
    [
      'expenses',
      {
        title: 'Lunch',
        date: '2026-10-07',
        category: 'Food',
        amountMinor: 1.1,
      },
    ],
    [
      'expenses',
      { title: 'Lunch', date: '2026-10-07', category: 'Food', amountMinor: -1 },
    ],
    [
      'workouts',
      { title: 'Walk', date: '2026-13-01', type: 'Cardio', duration: 20 },
    ],
    [
      'workouts',
      { title: 'Walk', date: '2026-10-07', type: 'Cardio', duration: 1.5 },
    ],
    ['budgets', { month: '2026-13', limitMinor: 1000 }],
  ])
    await call(app, tokens[0], 'post', `/${collection}`)
      .send(values)
      .expect(400);
  await call(app, tokens[0], 'post', '/missing').send(note).expect(404);
  await call(app, tokens[0], 'patch', '/notes/not-an-id')
    .send({ pinned: true })
    .expect(400);
});

test('origin protection applies to all workspace write methods', async () => {
  const { app, tokens } = fixture();
  const created = await call(app, tokens[0], 'post', '/notes').send(note);
  for (const [method, path] of [
    ['post', '/notes'],
    ['patch', `/notes/${created.body.entry.id}`],
    ['delete', `/notes/${created.body.entry.id}`],
  ]) {
    const agent = request(app);
    await agent[method](`/api/workspaces${path}`)
      .set('Origin', 'https://hostile.example')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${tokens[0]}`)
      .send(note)
      .expect(403);
  }
  const preflight = await request(app)
    .options('/api/workspaces/notes')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'PATCH')
    .expect(204);
  assert.match(preflight.headers['access-control-allow-methods'], /PATCH/);
  assert.match(preflight.headers['access-control-allow-methods'], /DELETE/);
});
