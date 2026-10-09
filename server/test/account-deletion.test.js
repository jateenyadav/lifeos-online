import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth.js';
import { createAccountDeletion } from '../src/account-deletion.js';
import { workspaceModels } from '../src/workspace-models.js';

let passwordHash;
before(async () => {
  passwordHash = await bcrypt.hash('account-password', 12);
});

function fixture({
  google = false,
  failureCollection,
  configured = true,
  missingUserAtDeletion = false,
} = {}) {
  const token = randomBytes(32).toString('base64url');
  const secondToken = randomBytes(32).toString('base64url');
  const otherToken = randomBytes(32).toString('base64url');
  const collections = [...Object.keys(workspaceModels), 'aiKnowledge'];
  const records = {
    users: [
      {
        _id: 'owner',
        name: 'Deletion Learner',
        email: 'owner@example.com',
        ...(google ? { googleId: 'google-owner' } : { passwordHash }),
      },
      { _id: 'other', name: 'Other Learner', email: 'other@example.com' },
    ],
    sessions: [token, secondToken, otherToken].map((value, index) => ({
      tokenHash: hashToken(value),
      userId: index === 2 ? 'other' : 'owner',
      expiresAt: new Date(Date.now() + 60000),
    })),
    ...Object.fromEntries(
      collections.map((name) => [
        name,
        [
          { userId: 'owner', id: `${name}-saved` },
          { userId: 'owner', id: `${name}-hidden`, deleted: true },
          { userId: 'other', id: `${name}-other` },
        ],
      ]),
    ),
  };
  const original = structuredClone(records);
  const deletionCalls = [];
  const googleTokens = [];
  const transactionSession = {};
  const models = Object.fromEntries(
    Object.keys(records).map((name) => [
      name,
      {
        async deleteMany(filter, options) {
          assert.equal(options.session, transactionSession);
          assert.deepEqual(filter, { userId: 'owner' });
          deletionCalls.push(name);
          if (name === failureCollection) throw new Error('Deletion failed');
          records[name] = records[name].filter(
            (entry) => entry.userId !== filter.userId,
          );
        },
        async deleteOne(filter, options) {
          assert.equal(options.session, transactionSession);
          assert.deepEqual(filter, { _id: 'owner' });
          deletionCalls.push(name);
          if (missingUserAtDeletion) return { deletedCount: 0 };
          const beforeCount = records[name].length;
          records[name] = records[name].filter(
            (entry) => entry._id !== filter._id,
          );
          return { deletedCount: beforeCount - records[name].length };
        },
      },
    ]),
  );
  const deleteAccountData = createAccountDeletion({
    users: models.users,
    sessions: models.sessions,
    aiKnowledge: models.aiKnowledge,
    workspaces: Object.fromEntries(
      Object.keys(workspaceModels).map((name) => [name, models[name]]),
    ),
    transaction: async (action) => {
      const snapshot = structuredClone(records);
      try {
        await action(transactionSession);
      } catch (failure) {
        Object.assign(records, snapshot);
        throw failure;
      }
    },
  });
  const app = createApp({
    config: {
      webOrigins: ['http://localhost:5173'],
      sessionDays: 7,
      production: false,
      cookieSameSite: 'lax',
      trustProxyHops: 0,
    },
    users: {
      findById: async (userId) =>
        records.users.find((user) => user._id === userId),
      findByIdentifier: async (email) =>
        records.users.find((user) => user.email === email),
    },
    sessions: {
      findActive: async (tokenHash, now) =>
        records.sessions.find(
          (session) =>
            session.tokenHash === tokenHash && session.expiresAt > now,
        ),
    },
    verifyGoogle: async (idToken) => {
      googleTokens.push(idToken);
      return {
        googleId:
          idToken === 'same-google-token' ? 'google-owner' : 'google-other',
      };
    },
    deleteAccountData: configured ? deleteAccountData : undefined,
  });
  const remove = (values = {}) =>
    request(app)
      .delete('/api/auth/account')
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmation: 'DELETE',
        password: 'account-password',
        ...values,
      });
  return {
    app,
    remove,
    records,
    original,
    token,
    secondToken,
    otherToken,
    deletionCalls,
    googleTokens,
  };
}

test('deletion removes the owner, all sessions, every space, hidden payments and AI knowledge only', async () => {
  const saved = fixture();
  const response = await saved.remove().expect(204);
  assert.match(response.headers['set-cookie'][0], /lifeos_session=;/);
  assert.deepEqual(
    saved.records.users.map((user) => user._id),
    ['other'],
  );
  for (const [name, entries] of Object.entries(saved.records)) {
    if (name !== 'users') {
      assert.ok(
        entries.every((entry) => entry.userId === 'other'),
        name,
      );
      assert.equal(entries.length, 1, name);
    }
  }
  assert.equal(saved.deletionCalls.at(-1), 'users');
  assert.equal(saved.deletionCalls.length, Object.keys(saved.records).length);
  for (const token of [saved.token, saved.secondToken]) {
    await request(saved.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  }
  await request(saved.app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${saved.otherToken}`)
    .expect(200);
});

test('a wrong password leaves the account, sessions and saved data intact', async () => {
  const saved = fixture();
  await saved.remove({ password: 'incorrect-password' }).expect(401);
  assert.deepEqual(saved.records, saved.original);
  assert.deepEqual(saved.deletionCalls, []);
});

test('deletion requires explicit confirmation and rejects another account ID', async () => {
  const saved = fixture();
  await saved.remove({ confirmation: 'delete' }).expect(400);
  await saved.remove({ confirmation: undefined }).expect(400);
  await saved.remove({ userId: 'other' }).expect(400);
  assert.deepEqual(saved.records, saved.original);
  assert.deepEqual(saved.deletionCalls, []);
});

test('password accounts cannot bypass their password with a Google token', async () => {
  const saved = fixture();
  await saved
    .remove({ password: undefined, idToken: 'same-google-token' })
    .expect(400);
  assert.deepEqual(saved.records, saved.original);
});

test('Google accounts can delete only after verifying the same Google identity', async () => {
  const saved = fixture({ google: true });
  await saved
    .remove({ password: undefined, idToken: 'same-google-token' })
    .expect(204);
  assert.deepEqual(saved.googleTokens, ['same-google-token']);
  assert.deepEqual(
    saved.records.users.map((user) => user._id),
    ['other'],
  );
});

test('a different Google account or a password cannot authorize Google account deletion', async () => {
  const saved = fixture({ google: true });
  await saved.remove({ idToken: 'different-google-token' }).expect(403);
  await saved.remove().expect(400);
  assert.deepEqual(saved.records, saved.original);
  assert.deepEqual(saved.deletionCalls, []);
});

test('missing and expired sessions cannot delete an account', async () => {
  const saved = fixture();
  await request(saved.app)
    .delete('/api/auth/account')
    .set('X-Client-Type', 'mobile')
    .send({ confirmation: 'DELETE', password: 'account-password' })
    .expect(401);
  saved.records.sessions[0].expiresAt = new Date(0);
  await saved.remove().expect(401);
  assert.deepEqual(saved.deletionCalls, []);
});

test('untrusted website origins cannot delete an account', async () => {
  const saved = fixture();
  await saved.remove().set('Origin', 'https://untrusted.example').expect(403);
  assert.deepEqual(saved.records, saved.original);
});

test('web session cookies can authorize deletion and are cleared afterward', async () => {
  const saved = fixture();
  await request(saved.app)
    .delete('/api/auth/account')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', `lifeos_session=${saved.token}`)
    .send({ confirmation: 'DELETE', password: 'account-password' })
    .expect(204);
  assert.deepEqual(
    saved.records.users.map((user) => user._id),
    ['other'],
  );
});

test('a failed cleanup aborts the transaction instead of reporting success', async (context) => {
  context.mock.method(console, 'error', () => {});
  const saved = fixture({ failureCollection: 'payees' });
  await saved.remove().expect(500);
  assert.deepEqual(saved.records, saved.original);
  assert.ok(!saved.deletionCalls.includes('users'));
});

test('a missing account during deletion rolls back the data cleanup', async () => {
  const saved = fixture({ missingUserAtDeletion: true });
  await saved.remove().expect(401);
  assert.deepEqual(saved.records, saved.original);
});

test('an unconfigured deletion service does not remove any data', async () => {
  const saved = fixture({ configured: false });
  await saved.remove().expect(503);
  assert.deepEqual(saved.records, saved.original);
});
