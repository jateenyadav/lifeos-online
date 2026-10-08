import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { parseArgs, parseEnv } from 'node:util';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientIdPattern = /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

async function readSettings(root) {
  async function read(relativePath, examplePath) {
    try {
      return await readFile(resolve(root, relativePath), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT' || !examplePath) throw error;
      return readFile(resolve(root, examplePath), 'utf8');
    }
  }
  const [server, web, mobile, ios] = await Promise.all([
    read('server/.env', 'server/.env.example'),
    read('apps/web/.env', 'apps/web/.env.example'),
    read(
      'apps/mobile/config/development.json',
      'apps/mobile/config/development.example.json',
    ),
    read('apps/mobile/ios/Flutter/GoogleAuth.xcconfig'),
  ]);
  return { server, web, mobile: JSON.parse(mobile), ios };
}

function setEnvironmentValue(content, key, value) {
  const pattern = new RegExp(
    `^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`,
    'gm',
  );
  if (pattern.test(content)) return content.replace(pattern, `${key}=${value}`);
  return `${content}${content.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
}

function validateClientId(value, label) {
  if (!clientIdPattern.test(value)) {
    throw new Error(
      `${label} must be a real client ID copied from Google Auth Platform > Clients. Do not paste a client secret or an example ID.`,
    );
  }
}

function reversedClientId(clientId) {
  return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;
}

export async function configureGoogle({
  root = projectRoot,
  webClientId,
  iosClientId,
}) {
  const webId = webClientId?.trim() || '';
  validateClientId(webId, 'The Web application client ID');
  const settings = await readSettings(root);
  const iosId =
    iosClientId?.trim() || settings.mobile.GOOGLE_IOS_CLIENT_ID || '';
  if (iosId) {
    validateClientId(iosId, 'The iOS client ID');
    if (iosId === webId)
      throw new Error(
        'Use a separate iOS client ID, not the Web application client ID.',
      );
  }
  const clientIds = new Set(
    (parseEnv(settings.server).GOOGLE_CLIENT_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  clientIds.add(webId);
  const updates = [
    [
      'server/.env',
      setEnvironmentValue(
        settings.server,
        'GOOGLE_CLIENT_IDS',
        [...clientIds].join(','),
      ),
    ],
    [
      'apps/web/.env',
      setEnvironmentValue(settings.web, 'VITE_GOOGLE_CLIENT_ID', webId),
    ],
    [
      'apps/mobile/config/development.json',
      `${JSON.stringify(
        {
          ...settings.mobile,
          GOOGLE_WEB_CLIENT_ID: webId,
          GOOGLE_IOS_CLIENT_ID: iosId,
        },
        null,
        2,
      )}\n`,
    ],
  ];
  if (iosId) {
    updates.push([
      'apps/mobile/ios/Flutter/GoogleAuth.xcconfig',
      setEnvironmentValue(
        setEnvironmentValue(
          setEnvironmentValue(settings.ios, 'GOOGLE_WEB_CLIENT_ID', webId),
          'GOOGLE_IOS_CLIENT_ID',
          iosId,
        ),
        'GOOGLE_REVERSED_CLIENT_ID',
        reversedClientId(iosId),
      ),
    ]);
  }
  await Promise.all(
    updates.map(([path, content]) =>
      writeFile(resolve(root, path), content, { mode: 0o600 }),
    ),
  );
  return updates.map(([path]) => path);
}

export async function checkGoogle(root = projectRoot) {
  const settings = await readSettings(root);
  const webId = parseEnv(settings.web).VITE_GOOGLE_CLIENT_ID || '';
  const serverIds = (parseEnv(settings.server).GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map((value) => value.trim());
  const webReady = clientIdPattern.test(webId) && serverIds.includes(webId);
  const androidReady =
    webReady && settings.mobile.GOOGLE_WEB_CLIENT_ID === webId;
  const iosId = settings.mobile.GOOGLE_IOS_CLIENT_ID || '';
  const iosReady =
    androidReady &&
    clientIdPattern.test(iosId) &&
    iosId !== webId &&
    parseEnv(settings.ios).GOOGLE_WEB_CLIENT_ID === webId &&
    parseEnv(settings.ios).GOOGLE_IOS_CLIENT_ID === iosId &&
    parseEnv(settings.ios).GOOGLE_REVERSED_CLIENT_ID ===
      reversedClientId(iosId);
  return { webReady, androidReady, iosReady };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'web-client-id': { type: 'string' },
      'ios-client-id': { type: 'string' },
      check: { type: 'boolean' },
    },
  });
  if (values.check) {
    if (values['web-client-id'] || values['ios-client-id']) {
      throw new Error('Use --check alone. It only reads your settings.');
    }
    const status = await checkGoogle();
    console.log(
      `Web: ${status.webReady ? 'client IDs match' : 'missing or mismatched client IDs'}`,
    );
    console.log(
      `Android: ${status.androidReady ? 'web client ID matches; also register the package and SHA-1 in Google' : 'web client ID is missing or mismatched'}`,
    );
    console.log(
      `iOS: ${status.iosReady ? 'Flutter/native client IDs and return URL match' : 'needs matching Flutter/native web/iOS IDs and the reversed iOS ID'}`,
    );
    console.log(
      'This checks local files only. Test a real Google account after completing docs/GOOGLE_AUTH.md.',
    );
    if (!status.webReady) process.exitCode = 1;
    return;
  }
  let webClientId = values['web-client-id'];
  let iosClientId = values['ios-client-id'];
  if (!webClientId) {
    if (!process.stdin.isTTY) {
      throw new Error(
        'Run npm run setup:google in your terminal, or pass --web-client-id YOUR_REAL_WEB_CLIENT_ID. See docs/GOOGLE_AUTH.md.',
      );
    }
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      webClientId = await prompt.question(
        'Paste your Google Web application client ID: ',
      );
      iosClientId ??= await prompt.question(
        'Paste your iOS client ID, or press Enter to skip iOS: ',
      );
    } finally {
      prompt.close();
    }
  }
  const paths = await configureGoogle({ webClientId, iosClientId });
  for (const path of paths) console.log(`Updated ${path}`);
  console.log(
    'Restart npm run dev. Fully restart Flutter after changing its settings.',
  );
  console.log(
    'Android still needs its package and SHA-1 registered in Google. See docs/GOOGLE_AUTH.md.',
  );
  console.log(
    'No client secret is needed. A real Google login has not been tested by this command.',
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
