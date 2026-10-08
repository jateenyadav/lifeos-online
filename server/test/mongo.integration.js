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
      aiProviders: {
        status: async () => ({ available: true, models: [] }),
        answer: async (values) => {
          calls.push(values);
          return 'Personal answer [S1]';
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
      provider: 'local',
      model: 'llama3.2:3b',
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
