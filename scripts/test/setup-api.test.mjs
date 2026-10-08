import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  checkBackend,
  checkConfiguredApi,
  configureApi,
  normalizeApiUrl,
} from '../setup-api.mjs';

const healthyBackend = async () =>
  new Response(JSON.stringify({ status: 'ok', database: 'connected' }), {
    headers: { 'Content-Type': 'application/json' },
  });

async function fixture(context) {
  const root = await mkdtemp(resolve(tmpdir(), 'lifeos-api-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'apps/mobile/config'), { recursive: true });
  const development = {
    API_BASE_URL: '',
    GOOGLE_WEB_CLIENT_ID: 'keep-web-client',
    GOOGLE_IOS_CLIENT_ID: 'keep-ios-client',
    CUSTOM_SETTING: 'keep',
  };
  await writeFile(
    resolve(root, 'apps/mobile/config/development.json'),
    JSON.stringify(development),
  );
  return { root, development };
}

test('accepts a hosted service home URL or /api URL without doubled slashes', () => {
  assert.equal(
    normalizeApiUrl(' https://lifeos.test/ '),
    'https://lifeos.test/api',
  );
  assert.equal(
    normalizeApiUrl('https://lifeos.test/api///'),
    'https://lifeos.test/api',
  );
  assert.equal(
    normalizeApiUrl('https://lifeos.test/prefix/api/'),
    'https://lifeos.test/prefix/api',
  );
});

test('rejects emulator, private, HTTP, credential and wrong-path URLs', () => {
  for (const value of [
    '',
    '/api',
    'http://lifeos.test/api',
    'https://10.0.2.2/api',
    'https://192.168.1.5/api',
    'https://127.0.0.1/api',
    'https://[::1]/api',
    'https://localhost/api',
    'https://computer.local/api',
    'https://computer.localhost/api',
    'https://user:password@lifeos.test/api',
    'https://lifeos.test/api?token=secret',
    'https://lifeos.test/api#fragment',
    'https://lifeos.test/api/health',
    'https://lifeos.test/api/auth/login',
  ]) {
    assert.throws(() => normalizeApiUrl(value), undefined, value);
  }
});

test('checks the database over HTTPS without forwarding redirects', async () => {
  const baseUrl = await checkBackend(
    'https://lifeos.test',
    async (url, options) => {
      assert.equal(url, 'https://lifeos.test/api/health');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Accept, 'application/json');
      assert.ok(options.signal instanceof AbortSignal);
      return healthyBackend();
    },
  );
  assert.equal(baseUrl, 'https://lifeos.test/api');
});

test('copies Google settings and saves the online URL for debug and release', async (context) => {
  const { root, development } = await fixture(context);
  await configureApi({
    root,
    apiUrl: 'https://lifeos.test',
    fetchBackend: healthyBackend,
  });
  for (const path of ['development', 'production']) {
    const settings = JSON.parse(
      await readFile(resolve(root, `apps/mobile/config/${path}.json`), 'utf8'),
    );
    assert.deepEqual(settings, {
      ...development,
      API_BASE_URL: 'https://lifeos.test/api',
    });
  }
  assert.equal(
    await checkConfiguredApi({ root, fetchBackend: healthyBackend }),
    'https://lifeos.test/api',
  );
});

test('keeps existing release Google IDs and unrelated settings', async (context) => {
  const { root } = await fixture(context);
  const production = {
    GOOGLE_WEB_CLIENT_ID: 'release-client',
    CUSTOM_SETTING: 'release-only',
  };
  await writeFile(
    resolve(root, 'apps/mobile/config/production.json'),
    JSON.stringify(production),
  );
  await configureApi({
    root,
    apiUrl: 'https://lifeos.test/api',
    fetchBackend: healthyBackend,
  });
  assert.deepEqual(
    JSON.parse(
      await readFile(
        resolve(root, 'apps/mobile/config/production.json'),
        'utf8',
      ),
    ),
    {
      ...production,
      API_BASE_URL: 'https://lifeos.test/api',
    },
  );
});

test('a failed deployment does not overwrite working app settings', async (context) => {
  const { root, development } = await fixture(context);
  for (const fetchBackend of [
    async () => new Response('{}', { status: 503 }),
    async () => new Response('<html>Loading</html>'),
    async () =>
      new Response(JSON.stringify({ status: 'ok', database: 'disconnected' })),
    async () => {
      throw new Error('Network unavailable');
    },
  ]) {
    await assert.rejects(
      configureApi({ root, apiUrl: 'https://lifeos.test', fetchBackend }),
      /Cannot verify/,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(
          resolve(root, 'apps/mobile/config/development.json'),
          'utf8',
        ),
      ),
      development,
    );
    await assert.rejects(
      readFile(resolve(root, 'apps/mobile/config/production.json')),
      { code: 'ENOENT' },
    );
  }
});

test('release checks fail clearly until an actual online URL is configured', async (context) => {
  const { root } = await fixture(context);
  await assert.rejects(
    checkConfiguredApi({ root, fetchBackend: healthyBackend }),
    /npm run setup:api/,
  );
});
