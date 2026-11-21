import request from 'supertest';
import { createApp } from '../../src/app.js';
import { hashToken } from '../../src/auth.js';
import { createMemoryMoneyStore } from '../../src/money/memory-store.js';

/** Old spending-space rows for the migration (only `list` is needed). */
export function fakeWorkspaces(rows = {}) {
  return {
    list: async (collection, userId) =>
      (rows[collection] ?? []).filter(
        (row) => (row.userId ?? 'owner-1') === userId,
      ),
    listForAi: async () => [],
  };
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (days) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

/** An app with two signed-in users and an in-memory Money store. */
export function moneyFixture({ workspaces = fakeWorkspaces() } = {}) {
  const money = createMemoryMoneyStore();
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
    workspaces,
    money,
  });
  const as = (index) => (method, path, body) => {
    const agent = request(app);
    const call = agent[method](`/api/money${path}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${tokens[index]}`);
    return body === undefined ? call : call.send(body);
  };
  return { app, money, me: as(0), other: as(1), tokens };
}
