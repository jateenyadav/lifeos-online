import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { checkGoogle, configureGoogle } from '../setup-google.mjs';

const webClientId = '123456789-web-test.apps.googleusercontent.com';
const iosClientId = '123456789-ios-test.apps.googleusercontent.com';
const oldClientId = '123456789-previous-test.apps.googleusercontent.com';

async function fixture(context, { examplesOnly = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), 'lifeos-google-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    [`server/.env${examplesOnly ? '.example' : ''}`]: `# Keep this comment\nMONGODB_URI=mongodb://127.0.0.1:27017/lifeos\nGOOGLE_CLIENT_IDS="${oldClientId}"\nSEED_PASSWORD=keep-this-password\n`,
    [`apps/web/.env${examplesOnly ? '.example' : ''}`]:
      'VITE_API_URL=/api\nVITE_GOOGLE_CLIENT_ID=\n',
    [`apps/mobile/config/development${examplesOnly ? '.example' : ''}.json`]:
      JSON.stringify({
        API_BASE_URL: 'http://192.168.1.5:4000/api',
        GOOGLE_WEB_CLIENT_ID: '',
        GOOGLE_IOS_CLIENT_ID: '',
        CUSTOM_SETTING: 'keep',
      }),
    'apps/mobile/ios/Flutter/GoogleAuth.xcconfig':
      'OTHER_SETTING = keep\nGOOGLE_REVERSED_CLIENT_ID = placeholder\n',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(resolve(root, path, '..'), { recursive: true });
    await writeFile(resolve(root, path), content);
  }
  return root;
}

test('configures web, backend and Flutter without changing unrelated settings', async (context) => {
  const root = await fixture(context);
  const paths = await configureGoogle({ root, webClientId });
  assert.equal(paths.length, 3);
  const server = await readFile(resolve(root, 'server/.env'), 'utf8');
  assert.match(server, /# Keep this comment/);
  assert.match(server, /SEED_PASSWORD=keep-this-password/);
  assert.ok(server.includes(`GOOGLE_CLIENT_IDS=${oldClientId},${webClientId}`));
  const web = await readFile(resolve(root, 'apps/web/.env'), 'utf8');
  assert.ok(web.includes(`VITE_GOOGLE_CLIENT_ID=${webClientId}`));
  assert.match(web, /VITE_API_URL=\/api/);
  const mobile = JSON.parse(
    await readFile(
      resolve(root, 'apps/mobile/config/development.json'),
      'utf8',
    ),
  );
  assert.equal(mobile.GOOGLE_WEB_CLIENT_ID, webClientId);
  assert.equal(mobile.API_BASE_URL, 'http://192.168.1.5:4000/api');
  assert.equal(mobile.CUSTOM_SETTING, 'keep');
  assert.deepEqual(await checkGoogle(root), {
    webReady: true,
    androidReady: true,
    iosReady: false,
  });
});

test('sets the iOS return URL and preserves existing iOS setup on reruns', async (context) => {
  const root = await fixture(context);
  const paths = await configureGoogle({ root, webClientId, iosClientId });
  assert.equal(paths.length, 4);
  const ios = await readFile(
    resolve(root, 'apps/mobile/ios/Flutter/GoogleAuth.xcconfig'),
    'utf8',
  );
  assert.match(
    ios,
    /GOOGLE_REVERSED_CLIENT_ID=com\.googleusercontent\.apps\.123456789-ios-test/,
  );
  assert.match(ios, /OTHER_SETTING = keep/);
  assert.ok(ios.includes(`GOOGLE_WEB_CLIENT_ID=${webClientId}`));
  assert.ok(ios.includes(`GOOGLE_IOS_CLIENT_ID=${iosClientId}`));
  await configureGoogle({ root, webClientId });
  assert.deepEqual(await checkGoogle(root), {
    webReady: true,
    androidReady: true,
    iosReady: true,
  });
  const server = await readFile(resolve(root, 'server/.env'), 'utf8');
  assert.equal(server.split(webClientId).length, 2);
});

test('creates missing local configuration from the example files', async (context) => {
  const root = await fixture(context, { examplesOnly: true });
  await configureGoogle({ root, webClientId });
  assert.equal((await checkGoogle(root)).webReady, true);
  const example = await readFile(
    resolve(root, 'apps/web/.env.example'),
    'utf8',
  );
  assert.equal(example, 'VITE_API_URL=/api\nVITE_GOOGLE_CLIENT_ID=\n');
});

test('rejects missing IDs, placeholders, secrets and line injection without writing', async (context) => {
  const root = await fixture(context);
  const path = resolve(root, 'server/.env');
  const original = await readFile(path, 'utf8');
  for (const invalid of [
    undefined,
    '',
    'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
    'GOCSPX-client-secret',
    `${webClientId}\nNODE_ENV=production`,
  ]) {
    await assert.rejects(
      configureGoogle({ root, webClientId: invalid }),
      /Web application client ID/,
    );
  }
  await assert.rejects(
    configureGoogle({ root, webClientId, iosClientId: 'wrong' }),
    /iOS client ID/,
  );
  await assert.rejects(
    configureGoogle({ root, webClientId, iosClientId: webClientId }),
    /separate iOS/,
  );
  assert.equal(await readFile(path, 'utf8'), original);
});

test('reports mismatched web, server, mobile and iOS configuration', async (context) => {
  const root = await fixture(context);
  assert.deepEqual(await checkGoogle(root), {
    webReady: false,
    androidReady: false,
    iosReady: false,
  });
  await configureGoogle({ root, webClientId, iosClientId });
  await writeFile(
    resolve(root, 'server/.env'),
    `GOOGLE_CLIENT_IDS=${oldClientId}\n`,
  );
  assert.equal((await checkGoogle(root)).webReady, false);
  await configureGoogle({ root, webClientId });
  await writeFile(
    resolve(root, 'apps/mobile/ios/Flutter/GoogleAuth.xcconfig'),
    'GOOGLE_REVERSED_CLIENT_ID=wrong\n',
  );
  assert.equal((await checkGoogle(root)).iosReady, false);
});

test('replaces duplicate and exported environment settings instead of leaving stale IDs', async (context) => {
  const root = await fixture(context);
  await writeFile(
    resolve(root, 'apps/web/.env'),
    `export VITE_GOOGLE_CLIENT_ID="${oldClientId}"\nVITE_GOOGLE_CLIENT_ID=${oldClientId}`,
  );
  await configureGoogle({ root, webClientId });
  const web = await readFile(resolve(root, 'apps/web/.env'), 'utf8');
  assert.ok(!web.includes(oldClientId));
  assert.equal((await checkGoogle(root)).webReady, true);
});

test('detects a missing native iOS web client ID even when Flutter IDs and return URL match', async (context) => {
  const root = await fixture(context);
  await configureGoogle({ root, webClientId, iosClientId });
  const path = resolve(root, 'apps/mobile/ios/Flutter/GoogleAuth.xcconfig');
  const original = await readFile(path, 'utf8');
  for (const key of ['GOOGLE_WEB_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID']) {
    await writeFile(
      path,
      original.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=`),
    );
    assert.equal((await checkGoogle(root)).iosReady, false);
  }
  await configureGoogle({ root, webClientId });
  assert.equal((await checkGoogle(root)).iosReady, true);
});
