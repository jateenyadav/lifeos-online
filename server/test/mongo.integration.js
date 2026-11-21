import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth.js';
import { User, Session, mongoUsers, mongoSessions } from '../src/models.js';
import { workspaceModels, mongoWorkspaces } from '../src/workspace-models.js';
import { AiKnowledge, mongoAiKnowledge } from '../src/ai-models.js';
import { moneyModels, mongoMoney } from '../src/money/store-mongo.js';
import { createAccountDeletion } from '../src/account-deletion.js';

test('password login, shared sessions, expiry and logout against real MongoDB', async () => {
  const uri =
    process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/lifeos_test';
  const databaseName = new URL(uri).pathname.slice(1);
  if (!databaseName.endsWith('_test'))
    throw new Error(
      'Integration tests require a database name ending in _test.',
    );
  let user;
  let registeredUser;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    await Promise.all(
      [User, Session, ...Object.values(workspaceModels)].map((model) =>
        model.createIndexes(),
      ),
    );
    const loginId = `test-${randomUUID()}`;
    user = await User.create({
      loginId,
      name: 'Integration Learner',
      email: `${loginId}@example.com`,
      passwordHash: await bcrypt.hash('integration-password', 12),
    });
    const app = createApp({
      config: {
        webOrigins: ['http://localhost:5173'],
        sessionDays: 7,
        cookieSameSite: 'lax',
        production: false,
        trustProxyHops: 0,
      },
      users: mongoUsers,
      sessions: mongoSessions,
      workspaces: mongoWorkspaces,
      verifyGoogle: async () => {
        throw new Error(
          'Google is not mocked into the database integration test.',
        );
      },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Type', 'mobile')
      .send({ identifier: loginId, password: 'integration-password' })
      .expect(200);
    const token = login.body.token;
    const persisted = await Session.findOne({
      tokenHash: hashToken(token),
    }).lean();
    assert.equal(String(persisted.userId), String(user._id));
    assert.notEqual(persisted.tokenHash, token);
    const website = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ identifier: user.email, password: 'integration-password' })
      .expect(200);
    assert.equal(website.body.user.id, login.body.user.id);
    const webCookie = website.headers['set-cookie'];
    const savedNote = await request(app)
      .post('/api/workspaces/notes')
      .set('Cookie', webCookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        title: 'Cross-device note',
        body: 'Saved in real MongoDB',
        tag: 'Integration',
      })
      .expect(201);
    const snapshot = await request(app)
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.equal(snapshot.body.notes[0].id, savedNote.body.entry.id);
    assert.equal(snapshot.body.notes[0].body, 'Saved in real MongoDB');
    assert.equal(snapshot.body.notes[0].userId, undefined);
    const pinned = await request(app)
      .patch(`/api/workspaces/notes/${savedNote.body.entry.id}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({ pinned: true })
      .expect(200);
    assert.equal(pinned.body.entry.body, 'Saved in real MongoDB');
    assert.equal(pinned.body.entry.tag, 'Integration');
    const savedRoutine = await request(app)
      .post('/api/workspaces/routines')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A test routine',
        category: 'Other',
        time: 'Morning',
        days: [0, 1, 2, 3, 4, 5, 6],
      })
      .expect(201);
    await Promise.all(
      [0, 1].map(() =>
        request(app)
          .post(`/api/workspaces/routines/${savedRoutine.body.entry.id}/check`)
          .set('X-Client-Type', 'mobile')
          .set('Authorization', `Bearer ${token}`)
          .send({ date: '2026-10-07', completed: true })
          .expect(200),
      ),
    );
    const routineRecord = await workspaceModels.routines
      .findById(savedRoutine.body.entry.id)
      .lean();
    assert.deepEqual(routineRecord.completedDates, ['2026-10-07']);
    const savedWorkout = await request(app)
      .post('/api/workspaces/workouts')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Test walk',
        type: 'Cardio',
        date: '2026-10-07',
        duration: 20,
      })
      .expect(201);
    assert.equal(
      (
        await workspaceModels.workouts
          .findById(savedWorkout.body.entry.id)
          .lean()
      ).duration,
      20,
    );
    const savedExpense = await request(app)
      .post('/api/workspaces/expenses')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Test lunch',
        category: 'Food',
        date: '2026-10-07',
        amountMinor: 12505,
      })
      .expect(201);
    assert.equal(
      (
        await workspaceModels.expenses
          .findById(savedExpense.body.entry.id)
          .lean()
      ).amountMinor,
      12505,
    );
    const notification = {
      title: 'Notification lunch',
      category: 'Other',
      date: '2026-10-07',
      amountMinor: 12505,
      notificationKey: 'f'.repeat(64),
      sourceApp: 'com.example.bank',
      currency: 'INR',
    };
    const importNotification = () =>
      request(app)
        .post('/api/workspaces/notification-expenses')
        .set('X-Client-Type', 'mobile')
        .set('Authorization', `Bearer ${token}`)
        .send(notification)
        .expect(200);
    const notifications = await Promise.all(
      Array.from({ length: 5 }, importNotification),
    );
    const notificationId = notifications[0].body.entry.id;
    assert.ok(
      notifications.every((result) => result.body.entry.id === notificationId),
    );
    assert.equal(
      await workspaceModels.expenses.countDocuments({
        userId: user._id,
        source: 'notification',
      }),
      1,
    );
    await request(app)
      .patch(`/api/workspaces/expenses/${notificationId}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'Food' })
      .expect(200);
    assert.equal((await importNotification()).body.entry.category, 'Food');
    const fromWeb = await request(app)
      .get('/api/workspaces')
      .set('Cookie', webCookie)
      .expect(200);
    assert.ok(
      fromWeb.body.expenses.some(
        (entry) =>
          entry.id === notificationId && entry.source === 'notification',
      ),
    );
    await request(app)
      .delete(`/api/workspaces/expenses/${notificationId}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    assert.equal((await importNotification()).body.entry, null);
    await request(app)
      .patch(`/api/workspaces/expenses/${notificationId}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Must not restore' })
      .expect(404);
    const paymentAlert = {
      ...notification,
      notificationKey: 'e'.repeat(64),
      recipientKey: 'lunch@upi',
      direction: 'outgoing',
      payment: 'Wallet',
    };
    const capturePayment = () =>
      request(app)
        .post('/api/workspaces/money/notifications')
        .set('X-Client-Type', 'mobile')
        .set('Authorization', `Bearer ${token}`)
        .send(paymentAlert)
        .expect(200);
    const captures = await Promise.all(
      Array.from({ length: 5 }, capturePayment),
    );
    const paymentId = captures[0].body.entry.id;
    assert.ok(captures.every((result) => result.body.entry.id === paymentId));
    assert.equal(captures[0].body.entry.status, 'pending');
    assert.equal(
      await workspaceModels.expenses.countDocuments({
        userId: user._id,
        source: 'payment',
      }),
      0,
    );
    const reviewed = {
      title: 'Lunch',
      date: '2026-10-07',
      amountMinor: 12505,
      kind: 'expense',
      person: 'Lunch shop',
      recipientKey: 'lunch@upi',
      category: 'Food',
      payment: 'Wallet',
      note: '',
      remember: true,
    };
    const confirmPayment = () =>
      request(app)
        .post(`/api/workspaces/money/payments/${paymentId}/confirm`)
        .set('X-Client-Type', 'mobile')
        .set('Authorization', `Bearer ${token}`)
        .send(reviewed)
        .expect(200);
    const confirmations = await Promise.all(
      Array.from({ length: 5 }, confirmPayment),
    );
    assert.ok(
      confirmations.every(
        (result) =>
          result.body.entry.status === 'confirmed' &&
          result.body.entry.notificationKey === undefined,
      ),
    );
    assert.equal(
      await workspaceModels.expenses.countDocuments({
        userId: user._id,
        source: 'payment',
      }),
      1,
    );
    assert.equal(
      await workspaceModels.payees.countDocuments({
        userId: user._id,
        recipientKey: 'lunch@upi',
      }),
      1,
    );
    const remembered = await request(app)
      .post('/api/workspaces/money/notifications')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...paymentAlert,
        notificationKey: 'd'.repeat(64),
        amountMinor: 25000,
      })
      .expect(200);
    assert.equal(remembered.body.entry.suggested, true);
    assert.equal(remembered.body.entry.title, 'Lunch');
    assert.equal(remembered.body.entry.amountMinor, 25000);
    const reviewedExpense = await workspaceModels.expenses
      .findOne({ userId: user._id, source: 'payment' })
      .lean();
    await request(app)
      .delete(`/api/workspaces/expenses/${reviewedExpense._id}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await confirmPayment();
    assert.equal(
      await workspaceModels.expenses.countDocuments({
        userId: user._id,
        source: 'payment',
        deleted: { $ne: true },
      }),
      0,
    );
    const moneySnapshot = await request(app)
      .get('/api/workspaces')
      .set('Cookie', webCookie)
      .expect(200);
    assert.equal(moneySnapshot.body.payments.length, 2);
    assert.equal(moneySnapshot.body.payees[0].recipientKey, 'lunch@upi');
    for (const limitMinor of [10000, 20000])
      await request(app)
        .post('/api/workspaces/budgets')
        .set('X-Client-Type', 'mobile')
        .set('Authorization', `Bearer ${token}`)
        .send({ month: '2026-10', limitMinor })
        .expect(201);
    const budgets = await workspaceModels.budgets
      .find({ userId: user._id })
      .lean();
    assert.equal(budgets.length, 1);
    assert.equal(budgets[0].limitMinor, 20000);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await Session.updateOne(
      { tokenHash: hashToken(token) },
      { expiresAt: new Date(0) },
    );
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(app)
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(app)
      .post('/api/auth/logout')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    assert.equal(
      await Session.countDocuments({ tokenHash: hashToken(token) }),
      0,
    );
    const email = `registration-${randomUUID()}@example.com`;
    const created = await request(app)
      .post('/api/auth/register')
      .set('X-Client-Type', 'mobile')
      .send({
        name: 'Registered Learner',
        email,
        password: 'registration-password',
        confirmPassword: 'registration-password',
      })
      .expect(201);
    registeredUser = await User.findById(created.body.user.id)
      .select('+passwordHash')
      .lean();
    assert.ok(
      await bcrypt.compare(
        'registration-password',
        registeredUser.passwordHash,
      ),
    );
    assert.equal(registeredUser.loginId, undefined);
    assert.equal(created.body.user.passwordHash, undefined);
    await request(app)
      .post('/api/auth/register')
      .set('X-Client-Type', 'mobile')
      .send({
        name: 'Duplicate',
        email: email.toUpperCase(),
        password: 'registration-password',
        confirmPassword: 'registration-password',
      })
      .expect(409);
    const registeredWebsite = request.agent(app);
    const registeredLogin = await registeredWebsite
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ identifier: email, password: 'registration-password' })
      .expect(200);
    assert.equal(registeredLogin.body.user.id, created.body.user.id);
    await registeredWebsite.get('/api/auth/me').expect(200);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${created.body.token}`)
      .expect(200);
    await registeredWebsite
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .expect(204);
    await registeredWebsite.get('/api/auth/me').expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${created.body.token}`)
      .expect(200);
  } finally {
    if (user) {
      await Promise.all(
        Object.values(workspaceModels).map((model) =>
          model.deleteMany({ userId: user._id }),
        ),
      );
      await Session.deleteMany({ userId: user._id });
      await User.deleteOne({ _id: user._id });
    }
    if (registeredUser) {
      await Session.deleteMany({ userId: registeredUser._id });
      await User.deleteOne({ _id: registeredUser._id });
    }
    await mongoose.disconnect();
  }
});

test('AI knowledge persists privately and reads fresh tracker data from MongoDB', async () => {
  const uri =
    process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/lifeos_test';
  if (!new URL(uri).pathname.slice(1).endsWith('_test'))
    throw new Error(
      'Integration tests require a database name ending in _test.',
    );
  const owners = [];
  const tokens = [];
  const calls = [];
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    await AiKnowledge.createIndexes();
    for (const name of ['AI learner', 'Other AI learner']) {
      const owner = await User.create({
        name,
        email: `${randomUUID()}@example.com`,
      });
      owners.push(owner);
      const token = randomBytes(32).toString('base64url');
      tokens.push(token);
      await Session.create({
        userId: owner._id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60000),
      });
    }
    const app = createApp({
      config: {
        webOrigins: ['http://localhost:5173'],
        sessionDays: 7,
        cookieSameSite: 'lax',
        production: false,
        trustProxyHops: 0,
      },
      users: mongoUsers,
      sessions: mongoSessions,
      workspaces: mongoWorkspaces,
      aiKnowledge: mongoAiKnowledge,
      verifyGoogle: async () => {},
      cloudAi: {
        available: () => true,
        status: () => ({
          available: true,
          providers: ['test'],
          dailyLimit: 30,
          message: '',
        }),
        spend: async () => ({ used: 1, remaining: 29 }),
        ai: {},
        answer: async (values) => {
          calls.push(values);
          return {
            text: 'Personal answer [S1]',
            provider: 'test',
            quota: { remaining: 29 },
          };
        },
      },
    });
    const call = (method, path, owner = 0) => {
      const agent = request(app);
      return agent[method](`/api/ai${path}`)
        .set('X-Client-Type', 'mobile')
        .set('Authorization', `Bearer ${tokens[owner]}`);
    };
    const created = await call('post', '/knowledge')
      .send({
        title: 'Skin plan',
        topic: 'routines',
        content: 'My saved product is Example Cream.',
      })
      .expect(201);
    const persisted = await AiKnowledge.findById(
      created.body.document.id,
    ).lean();
    assert.equal(String(persisted.userId), String(owners[0]._id));
    assert.equal(persisted.content, 'My saved product is Example Cream.');
    assert.equal(created.body.document.userId, undefined);
    assert.equal(
      (await call('get', '/knowledge', 1).expect(200)).body.documents.length,
      0,
    );
    await call('delete', `/knowledge/${created.body.document.id}`, 1).expect(
      404,
    );
    const routine = await mongoWorkspaces.create(
      'routines',
      String(owners[0]._id),
      {
        title: 'Morning care',
        category: 'Skin care',
        time: 'Morning',
        days: [1, 2],
      },
    );
    const question = {
      provider: 'lifeos',
      cloudConsent: true,
      question: 'What skin care did I save?',
      topics: ['routines'],
    };
    await call('post', '/chat').send(question).expect(200);
    assert.match(calls[0].system, /Morning care/);
    assert.match(calls[0].system, /Example Cream/);
    await mongoWorkspaces.update(
      'routines',
      String(owners[0]._id),
      routine.id,
      { title: 'Evening care' },
    );
    await call('delete', `/knowledge/${created.body.document.id}`).expect(204);
    await call('post', '/chat').send(question).expect(200);
    assert.match(calls[1].system, /Evening care/);
    assert.doesNotMatch(calls[1].system, /Example Cream|Morning care/);
    await call('post', '/chat', 1).send(question).expect(200);
    assert.doesNotMatch(calls[2].system, /Evening care/);
  } finally {
    for (const owner of owners) {
      await AiKnowledge.deleteMany({ userId: owner._id });
      await workspaceModels.routines.deleteMany({ userId: owner._id });
      await Session.deleteMany({ userId: owner._id });
      await User.deleteOne({ _id: owner._id });
    }
    await mongoose.disconnect();
  }
});

test('Money v2 against real MongoDB: migration, ingest, khata, reimbursement, deletion', async () => {
  const uri =
    process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/lifeos_test';
  if (!new URL(uri).pathname.slice(1).endsWith('_test'))
    throw new Error(
      'Integration tests require a database name ending in _test.',
    );
  let owner;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    await Promise.all(
      [
        User,
        Session,
        ...Object.values(workspaceModels),
        ...Object.values(moneyModels),
      ].map((model) => model.createIndexes()),
    );
    owner = await User.create({
      name: 'Money learner',
      email: `${randomUUID()}@example.com`,
    });
    const userId = String(owner._id);
    const token = randomBytes(32).toString('base64url');
    await Session.create({
      userId: owner._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60000),
    });
    // Old spending space rows that the lazy migration copies.
    await mongoWorkspaces.create('expenses', userId, {
      title: 'Old groceries',
      date: '2026-10-03',
      amountMinor: 128050,
      category: 'Food',
      payment: 'Card',
      note: '',
    });
    await mongoWorkspaces.create('budgets', userId, {
      month: '2026-10',
      limitMinor: 2500000,
    });
    const app = createApp({
      config: {
        webOrigins: ['http://localhost:5173'],
        sessionDays: 7,
        cookieSameSite: 'lax',
        production: false,
        trustProxyHops: 0,
      },
      users: mongoUsers,
      sessions: mongoSessions,
      workspaces: mongoWorkspaces,
      money: mongoMoney,
      verifyGoogle: async () => {},
    });
    const call = (method, path, body) => {
      const agent = request(app)[method](`/api/money${path}`);
      const authed = agent
        .set('X-Client-Type', 'mobile')
        .set('Authorization', `Bearer ${token}`);
      return body === undefined ? authed : authed.send(body);
    };

    const october = (await call('get', '/overview?month=2026-10').expect(200))
      .body;
    assert.equal(october.spentMinor, 128050);
    assert.deepEqual(october.budget, {
      limitMinor: 2500000,
      usedMinor: 128050,
    });
    assert.ok((await User.findById(owner._id).lean()).moneyMigratedAt);
    await call('get', '/overview').expect(200);
    assert.equal(
      await moneyModels.txns.countDocuments({ userId: owner._id }),
      1,
    );

    // Old khata as opening balance, then Rohan's add-on card through phone capture.
    await call('post', '/khata/import/save', {
      people: [
        { name: 'Rohan', choice: 'totalOnly', statedMinor: 3000000, lines: [] },
      ],
    }).expect(201);
    await call('post', '/accounts', {
      name: "Rohan's add-on card",
      type: 'credit_card',
      last4: '9191',
      ownerName: 'Rohan',
    }).expect(201);
    const day = new Date().toISOString().slice(0, 10);
    const item = {
      sourceKey: `it-${randomUUID()}`,
      source: 'sms',
      date: day,
      time: '10:00',
      amountMinor: 1186400,
      direction: 'debit',
      title: 'IndiGo',
      channel: 'Card',
      last4: '9191',
      utr: '987654321012',
      confidence: 0.9,
    };
    const [created] = (
      await call('post', '/txns/ingest', { items: [item] }).expect(200)
    ).body.items;
    assert.equal(created.status, 'created');
    assert.equal(created.txn.peerTag, 'owe_owner');
    const [again] = (
      await call('post', '/txns/ingest', { items: [item] }).expect(200)
    ).body.items;
    assert.equal(again.status, 'duplicate');
    const [merged] = (
      await call('post', '/txns/ingest', {
        items: [
          {
            ...item,
            sourceKey: `it-${randomUUID()}`,
            source: 'notification',
            time: '10:01',
          },
        ],
      }).expect(200)
    ).body.items;
    assert.deepEqual(
      [merged.status, merged.txn.id],
      ['merged', created.txn.id],
    );
    // The unique index keeps one row per sourceKey in MongoDB too.
    await assert.rejects(
      moneyModels.txns.create({
        userId: owner._id,
        date: day,
        amountMinor: 1,
        direction: 'debit',
        sourceKey: item.sourceKey,
      }),
      (error) => error.code === 11000,
    );

    const khata = (await call('get', '/khata').expect(200)).body;
    const rohan = khata.contacts.find((row) => row.contact.name === 'Rohan');
    assert.equal(rohan.balance.actualMinor, -(3000000 + 1186400));
    const detail = (
      await call('get', `/khata/contacts/${rohan.contact.id}`).expect(200)
    ).body;
    assert.deepEqual(
      detail.entries.map((entry) => entry.isOpening),
      [false, true],
    );

    // Reimbursement: claim, office pays ₹15,000, only ₹3,136 is income.
    await call('post', `/txns/${created.txn.id}/reimburse/claim`, {}).expect(
      200,
    );
    const office = (
      await call('post', '/txns', {
        date: day,
        amountMinor: 1500000,
        direction: 'credit',
        title: 'ACME',
        category: 'Other income',
      }).expect(201)
    ).body.txn;
    const received = (
      await call('post', `/txns/${office.id}/reimburse/received`, {
        claimIds: [created.txn.id],
      }).expect(200)
    ).body;
    assert.deepEqual(
      [received.matchedMinor, received.extraMinor],
      [1186400, 313600],
    );
    const now = (await call('get', '/overview').expect(200)).body;
    assert.deepEqual([now.spentMinor, now.incomeMinor], [0, 313600]);

    // Photos are stored privately and come back as bytes.
    const photo = (
      await call('post', '/photos', {
        ownerType: 'khata_contact',
        ownerId: rohan.contact.id,
        mime: 'image/jpeg',
        data: Buffer.concat([
          Buffer.from([0xff, 0xd8, 0xff]),
          Buffer.alloc(30000),
        ]).toString('base64'),
      }).expect(201)
    ).body;
    const image = await call('get', `/photos/${photo.id}`).expect(200);
    assert.equal(image.headers['content-type'], 'image/jpeg');

    // Account deletion removes every Money v2 collection (needs a replica set for transactions).
    const replicaSet = Boolean(
      (await mongoose.connection.db.admin().command({ hello: 1 })).setName,
    );
    if (replicaSet) {
      await createAccountDeletion()(owner._id);
      for (const model of Object.values(moneyModels))
        assert.equal(
          await model.countDocuments({ userId: owner._id }),
          0,
          model.modelName,
        );
      owner = null;
    }
  } finally {
    if (owner) {
      for (const model of [
        ...Object.values(moneyModels),
        ...Object.values(workspaceModels),
      ])
        await model.deleteMany({ userId: owner._id });
      await Session.deleteMany({ userId: owner._id });
      await User.deleteOne({ _id: owner._id });
    }
    await mongoose.disconnect();
  }
});
