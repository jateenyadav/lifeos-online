import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ApiError, createGoogleVerifier, hashToken } from '../src/auth.js';
import { readConfig } from '../src/config.js';

let passwordHash;
before(async () => {
  passwordHash = await bcrypt.hash('a-correct-password', 12);
});

function fixture({
  verifyGoogle = async () => ({
    googleId: 'google-1',
    email: 'google@example.com',
    name: 'Google Learner',
  }),
  configOverrides = {},
  userOverrides = {},
} = {}) {
  const storedUsers = [
    {
      _id: 'user-1',
      loginId: 'demo',
      name: 'LifeOS Learner',
      email: 'demo@lifeos.local',
      passwordHash,
    },
  ];
  const storedSessions = new Map();
  const users = {
    findByIdentifier: async (identifier) =>
      storedUsers.find(
        (user) => user.loginId === identifier || user.email === identifier,
      ),
    findByEmail: async (email) =>
      storedUsers.find((user) => user.email === email),
    findByGoogleId: async (googleId) =>
      storedUsers.find((user) => user.googleId === googleId),
    findById: async (userId) => storedUsers.find((user) => user._id === userId),
    create: async (values) => {
      const user = { _id: `user-${storedUsers.length + 1}`, ...values };
      storedUsers.push(user);
      return user;
    },
    ...userOverrides,
  };
  const sessions = {
    create: async (values) => storedSessions.set(values.tokenHash, values),
    findActive: async (tokenHash, now) => {
      const session = storedSessions.get(tokenHash);
      return session?.expiresAt > now ? session : null;
    },
    remove: async (tokenHash) => storedSessions.delete(tokenHash),
  };
  const config = {
    webOrigins: ['http://localhost:5173'],
    sessionDays: 7,
    production: false,
    cookieSameSite: 'lax',
    trustProxyHops: 0,
    ...configOverrides,
  };
  return {
    app: createApp({ config, users, sessions, verifyGoogle }),
    storedSessions,
    storedUsers,
  };
}

const mobileLogin = (app, values = {}) =>
  request(app)
    .post('/api/auth/login')
    .set('X-Client-Type', 'mobile')
    .send({ identifier: 'demo', password: 'a-correct-password', ...values });

const registration = {
  name: 'New Learner',
  email: 'learner@example.com',
  password: 'a-new-password',
  confirmPassword: 'a-new-password',
};
const mobileRegister = (app, values = {}) =>
  request(app)
    .post('/api/auth/register')
    .set('X-Client-Type', 'mobile')
    .send({ ...registration, ...values });

test('email registration hashes the password, signs in, and works across web and mobile', async () => {
  const { app, storedUsers } = fixture();
  const created = await mobileRegister(app, {
    name: '  New Learner  ',
    email: '  LEARNER@EXAMPLE.COM  ',
    googleId: 'attacker-controlled',
    loginId: 'admin',
  }).expect(201);
  assert.equal(created.body.user.name, 'New Learner');
  assert.equal(created.body.user.email, 'learner@example.com');
  assert.equal(created.body.user.provider, 'password');
  assert.equal(created.body.user.passwordHash, undefined);
  assert.equal(created.body.password, undefined);
  const stored = storedUsers[1];
  assert.notEqual(stored.passwordHash, registration.password);
  assert.ok(await bcrypt.compare(registration.password, stored.passwordHash));
  assert.equal(stored.googleId, undefined);
  assert.equal(stored.loginId, undefined);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${created.body.token}`)
    .expect(200);
  await request(app)
    .post('/api/auth/logout')
    .set('X-Client-Type', 'mobile')
    .set('Authorization', `Bearer ${created.body.token}`)
    .expect(204);
  const website = request.agent(app);
  const login = await website
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({
      identifier: registration.email.toUpperCase(),
      password: registration.password,
    })
    .expect(200);
  assert.equal(login.body.user.id, created.body.user.id);
  assert.equal(login.body.token, undefined);
  await website.get('/api/auth/me').expect(200);
});

test('web registration creates an HttpOnly cookie and mobile can log into that account', async () => {
  const { app } = fixture();
  const website = request.agent(app);
  const created = await website
    .post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send(registration)
    .expect(201);
  assert.equal(created.body.token, undefined);
  assert.match(created.headers['set-cookie'][0], /HttpOnly/);
  await website.get('/api/auth/me').expect(200);
  const login = await mobileLogin(app, {
    identifier: registration.email,
    password: registration.password,
  }).expect(200);
  assert.equal(login.body.user.id, created.body.user.id);
});

test('registration rejects duplicate password and Google accounts without overwriting them', async () => {
  const { app, storedUsers } = fixture();
  await mobileRegister(app, { email: 'DEMO@lifeos.local' }).expect(409);
  await request(app)
    .post('/api/auth/google')
    .set('X-Client-Type', 'mobile')
    .send({ idToken: 'google-token' })
    .expect(200);
  await mobileRegister(app, { email: 'google@example.com' }).expect(409);
  assert.equal(storedUsers.length, 2);
  await mobileLogin(app).expect(200);
});

test('registration handles a duplicate email race without leaking database errors', async () => {
  const { app } = fixture({
    userOverrides: {
      create: async () => {
        throw Object.assign(new Error('duplicate index'), { code: 11000 });
      },
    },
  });
  const response = await mobileRegister(app).expect(409);
  assert.match(response.body.message, /already has an account/);
});

test('registration validates names, email, password length, UTF-8 bytes and confirmation', async () => {
  const { app, storedUsers } = fixture();
  for (const values of [
    { name: ' ' },
    { name: 'a'.repeat(101) },
    { email: 'invalid' },
    { password: 'short', confirmPassword: 'short' },
    { password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) },
    { password: '🌿'.repeat(19), confirmPassword: '🌿'.repeat(19) },
    { confirmPassword: 'different-password' },
    { confirmPassword: undefined },
  ])
    await mobileRegister(app, values).expect(400);
  assert.equal(storedUsers.length, 1);
  await mobileRegister(app, {
    password: 'a'.repeat(72),
    confirmPassword: 'a'.repeat(72),
  }).expect(201);
});

test('registration preserves password whitespace and rejects hostile or missing origins', async () => {
  const { app } = fixture();
  await request(app).post('/api/auth/register').send(registration).expect(403);
  await request(app)
    .post('/api/auth/register')
    .set('Origin', 'https://evil.example')
    .set('X-Client-Type', 'mobile')
    .send(registration)
    .expect(403);
  const password = '  keep these spaces  ';
  await mobileRegister(app, { password, confirmPassword: password }).expect(
    201,
  );
  await mobileLogin(app, { identifier: registration.email, password }).expect(
    200,
  );
  await mobileLogin(app, {
    identifier: registration.email,
    password: password.trim(),
  }).expect(401);
});

test('registration rotates an existing mobile session', async () => {
  const { app } = fixture();
  const previous = await mobileLogin(app).expect(200);
  await mobileRegister(app)
    .set('Authorization', `Bearer ${previous.body.token}`)
    .expect(201);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${previous.body.token}`)
    .expect(401);
});

test('registration is rate limited along with password login', async () => {
  const { app } = fixture();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await mobileRegister(app, { email: 'invalid' }).expect(400);
  }
  await mobileRegister(app).expect(429);
  await mobileLogin(app).expect(429);
});

test('mobile password login creates a hashed, revocable shared session', async () => {
  const { app, storedSessions } = fixture();
  const response = await mobileLogin(app).expect(200);
  assert.equal(response.body.user.loginId, 'demo');
  assert.equal(response.body.user.passwordHash, undefined);
  assert.match(response.body.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.ok(storedSessions.has(hashToken(response.body.token)));
  assert.ok(!storedSessions.has(response.body.token));
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(200);
  await request(app)
    .post('/api/auth/logout')
    .set('X-Client-Type', 'mobile')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(204);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(401);
});

test('website login uses an HttpOnly cookie, not a JavaScript-visible token', async () => {
  const { app } = fixture();
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ identifier: 'DEMO@lifeos.local', password: 'a-correct-password' })
    .expect(200);
  assert.equal(response.body.token, undefined);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
  assert.equal(response.headers['cache-control'], 'no-store');
  await agent.get('/api/auth/me').expect(200);
  await agent
    .post('/api/auth/logout')
    .set('Origin', 'http://localhost:5173')
    .expect(204);
  await agent.get('/api/auth/me').expect(401);
});

test('wrong passwords and unknown users return the same generic error', async () => {
  const { app } = fixture();
  const wrong = await mobileLogin(app, { password: 'wrong' }).expect(401);
  const unknown = await mobileLogin(app, {
    identifier: 'unknown',
    password: 'wrong',
  }).expect(401);
  assert.equal(wrong.body.message, unknown.body.message);
});

test('expired sessions are rejected even before MongoDB TTL cleanup', async () => {
  const { app, storedSessions } = fixture();
  const response = await mobileLogin(app).expect(200);
  storedSessions.get(hashToken(response.body.token)).expiresAt = new Date(0);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(401);
});

test('re-login rotates the old session', async () => {
  const { app } = fixture();
  const first = await mobileLogin(app).expect(200);
  await request(app)
    .post('/api/auth/login')
    .set('X-Client-Type', 'mobile')
    .set('Authorization', `Bearer ${first.body.token}`)
    .send({ identifier: 'demo', password: 'a-correct-password' })
    .expect(200);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${first.body.token}`)
    .expect(401);
});

test('rejects hostile origins, including attempts to impersonate mobile', async () => {
  const { app } = fixture();
  await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://evil.example')
    .set('X-Client-Type', 'mobile')
    .send({ identifier: 'demo', password: 'a-correct-password' })
    .expect(403);
  await request(app).post('/api/auth/logout').expect(403);
});

test('rejects invalid JSON, missing values and overlong UTF-8 passwords', async () => {
  const { app } = fixture();
  await request(app)
    .post('/api/auth/login')
    .set('X-Client-Type', 'mobile')
    .send({})
    .expect(400);
  await mobileLogin(app, { password: '🌿'.repeat(19) }).expect(400);
  await request(app)
    .post('/api/auth/login')
    .set('X-Client-Type', 'mobile')
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
});

test('Google login creates one account shared by subsequent sign-ins', async () => {
  const { app, storedUsers } = fixture();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/google')
      .set('X-Client-Type', 'mobile')
      .send({ idToken: 'test-token' })
      .expect(200);
    assert.equal(response.body.user.provider, 'google');
    assert.equal(response.body.user.id, 'user-2');
  }
  assert.equal(storedUsers.length, 2);
});

test('Google web and mobile sessions share one user and log out independently', async () => {
  const { app, storedUsers } = fixture();
  const website = request.agent(app);
  const web = await website
    .post('/api/auth/google')
    .set('Origin', 'http://localhost:5173')
    .send({ idToken: 'test-google-token' })
    .expect(200);
  assert.equal(web.body.token, undefined);
  assert.match(web.headers['set-cookie'][0], /HttpOnly/);
  const mobile = await request(app)
    .post('/api/auth/google')
    .set('X-Client-Type', 'mobile')
    .send({ idToken: 'test-google-token' })
    .expect(200);
  assert.equal(web.body.user.id, mobile.body.user.id);
  assert.equal(storedUsers.length, 2);
  await website.get('/api/auth/me').expect(200);
  await website
    .post('/api/auth/logout')
    .set('Origin', 'http://localhost:5173')
    .expect(204);
  await website.get('/api/auth/me').expect(401);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${mobile.body.token}`)
    .expect(200);
});

test('Google cannot silently take over an existing password account by email', async () => {
  const { app, storedUsers } = fixture({
    verifyGoogle: async () => ({
      googleId: 'google-1',
      email: 'demo@lifeos.local',
      name: 'Google Learner',
    }),
  });
  await request(app)
    .post('/api/auth/google')
    .set('X-Client-Type', 'mobile')
    .send({ idToken: 'test-token' })
    .expect(409);
  assert.equal(storedUsers.length, 1);
  assert.equal(storedUsers[0].googleId, undefined);
});

test('invalid Google credentials fail without creating a session', async () => {
  const { app, storedSessions } = fixture({
    verifyGoogle: async () => {
      throw new ApiError(401, 'Invalid Google token.');
    },
  });
  await request(app)
    .post('/api/auth/google')
    .set('X-Client-Type', 'mobile')
    .send({ idToken: 'invalid' })
    .expect(401);
  assert.equal(storedSessions.size, 0);
});

test('unconfigured Google auth and unsigned tokens are rejected', async () => {
  await assert.rejects(
    createGoogleVerifier([])('anything'),
    (error) => error.status === 503,
  );
  await assert.rejects(
    createGoogleVerifier(['test-client'])('not-a-jwt'),
    (error) => error.status === 401,
  );
});

test('rate limits repeated sign-in attempts', async () => {
  const { app } = fixture();
  for (let attempt = 0; attempt < 20; attempt += 1)
    await mobileLogin(app, { identifier: '' }).expect(400);
  const response = await mobileLogin(app, { identifier: '' }).expect(429);
  assert.match(response.body.message, /Too many sign-in attempts/);
});

test('production cookie uses the secure host-only prefix', async () => {
  const { app } = fixture({ configOverrides: { production: true } });
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ identifier: 'demo', password: 'a-correct-password' })
    .expect(200);
  assert.match(response.headers['set-cookie'][0], /^__Host-lifeos_session=/);
  assert.match(response.headers['set-cookie'][0], /Secure/);
});

test('config validates origins and secure production requirements', () => {
  const environment = {
    MONGODB_URI: 'mongodb://localhost/lifeos',
    WEB_ORIGINS: 'http://localhost:5173',
  };
  assert.equal(readConfig(environment).port, 4000);
  const hosted = readConfig({
    ...environment,
    PORT: '10000',
    MONGODB_URI: 'mongodb+srv://cluster.example/lifeos',
  });
  assert.equal(hosted.port, 10000);
  assert.equal(hosted.mongoUri, 'mongodb+srv://cluster.example/lifeos');
  assert.throws(() => readConfig({ ...environment, WEB_ORIGINS: '*' }));
  assert.throws(() => readConfig({ ...environment, NODE_ENV: 'production' }));
  assert.throws(() => readConfig({ ...environment, COOKIE_SAME_SITE: 'none' }));
});

test('a mobile-only production backend can disable all browser origins', async () => {
  const config = readConfig({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://localhost/lifeos',
    TRUST_PROXY_HOPS: '1',
  });
  assert.deepEqual(config.webOrigins, []);
  assert.equal(config.trustProxyHops, 1);
  const { app } = fixture({ configOverrides: config });
  const login = await mobileLogin(app).expect(200);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${login.body.token}`)
    .expect(200);
  await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://unknown.example')
    .send({ identifier: 'demo', password: 'a-correct-password' })
    .expect(403);
});

test('health checks fail when the database disconnects', async () => {
  const app = createApp({
    config: { webOrigins: [], production: true, sessionDays: 7 },
    users: {},
    sessions: {},
    verifyGoogle: async () => {},
    isDatabaseReady: () => false,
  });
  const response = await request(app).get('/api/health').expect(503);
  assert.deepEqual(response.body, {
    status: 'unavailable',
    database: 'disconnected',
  });
});

test('both health routes await a database check and report its result', async () => {
  let ready = true;
  let checks = 0;
  const app = createApp({
    config: { webOrigins: [], production: true, sessionDays: 7 },
    users: {},
    sessions: {},
    verifyGoogle: async () => {},
    isDatabaseReady: async () => {
      checks += 1;
      return ready;
    },
  });
  for (const path of ['/health', '/api/health']) {
    const response = await request(app).get(path).expect(200);
    assert.deepEqual(response.body, { status: 'ok', database: 'connected' });
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  ready = false;
  for (const path of ['/health', '/api/health']) {
    const response = await request(app).get(path).expect(503);
    assert.deepEqual(response.body, {
      status: 'unavailable',
      database: 'disconnected',
    });
  }
  assert.equal(checks, 4);
});

test('a failed database ping returns 503 without exposing credentials', async () => {
  const app = createApp({
    config: { webOrigins: [], production: true, sessionDays: 7 },
    users: {},
    sessions: {},
    verifyGoogle: async () => {},
    isDatabaseReady: async () => {
      throw new Error('Database error containing private credentials');
    },
  });
  for (const path of ['/health', '/api/health']) {
    const response = await request(app).get(path).expect(503);
    assert.deepEqual(response.body, {
      status: 'unavailable',
      database: 'disconnected',
    });
  }
});
