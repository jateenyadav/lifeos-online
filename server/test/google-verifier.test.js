import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OAuth2Client } from 'google-auth-library';
import { createGoogleVerifier } from '../src/auth.js';

test('asks Google to verify the token against the configured audience', async (context) => {
  const clientIds = ['123456789-web-test.apps.googleusercontent.com'];
  const verify = context.mock.method(
    OAuth2Client.prototype,
    'verifyIdToken',
    async () => ({
      getPayload: () => ({
        sub: 'google-user',
        email: 'Learner@Example.com',
        email_verified: true,
        name: 'Google Learner',
      }),
    }),
  );
  assert.deepEqual(await createGoogleVerifier(clientIds)('identity-token'), {
    googleId: 'google-user',
    email: 'learner@example.com',
    name: 'Google Learner',
  });
  assert.deepEqual(verify.mock.calls[0].arguments[0], {
    idToken: 'identity-token',
    audience: clientIds,
  });
});

test('rejects Google profiles without a stable ID and a verified email', async (context) => {
  const profiles = [
    { email: 'user@example.com', email_verified: true },
    { sub: 'google-user', email_verified: true },
    { sub: 'google-user', email: 'user@example.com', email_verified: false },
    { sub: 'google-user', email: 'user@example.com', email_verified: 'true' },
    undefined,
  ];
  context.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => profiles.shift(),
  }));
  const verify = createGoogleVerifier(['test-client']);
  while (profiles.length) {
    await assert.rejects(
      verify('identity-token'),
      (error) => error.status === 401,
    );
  }
});

test('rejects verification failures without leaking Google token details', async (context) => {
  context.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => {
    throw new Error('Expired token with private token details');
  });
  await assert.rejects(
    createGoogleVerifier(['test-client'])('expired-token'),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(
        error.message,
        'Google could not verify your sign-in. Please try again.',
      );
      return true;
    },
  );
});

test('does not call Google verification before client IDs are configured', async (context) => {
  const verify = context.mock.method(OAuth2Client.prototype, 'verifyIdToken');
  await assert.rejects(
    createGoogleVerifier([])('identity-token'),
    (error) => error.status === 503,
  );
  assert.equal(verify.mock.callCount(), 0);
});
