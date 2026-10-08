import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const developmentPath = 'apps/mobile/config/development.json';
const productionPath = 'apps/mobile/config/production.json';

export function normalizeApiUrl(value) {
  let address;
  try {
    address = new URL(value.trim());
  } catch {
    throw new Error('Enter the complete HTTPS backend URL from Render.');
  }
  const host = address.hostname.replace(/^\[|\]$/g, '');
  if (
    address.protocol !== 'https:' ||
    address.username ||
    address.password ||
    address.search ||
    address.hash ||
    !host.includes('.') ||
    isIP(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw new Error(
      'Use a public HTTPS backend domain, without passwords, query strings, or fragments. Local and emulator addresses cannot work on other networks.',
    );
  }
  const path = address.pathname.replace(/\/+$/, '');
  if (path && !path.endsWith('/api')) {
    throw new Error(
      'Use the backend home URL or its /api URL, not a login or health URL.',
    );
  }
  address.pathname = path || '/api';
  return address.toString();
}

async function readSettings(root, path, fallback) {
  try {
    return JSON.parse(await readFile(resolve(root, path), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return fallback;
  }
}

export async function checkBackend(apiUrl, fetchBackend = fetch) {
  const baseUrl = normalizeApiUrl(apiUrl);
  try {
    const response = await fetchBackend(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(90000),
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Health check returned HTTP ${response.status}.`);
    }
    const health = await response.json();
    if (health.status !== 'ok' || health.database !== 'connected') {
      throw new Error('The LifeOS backend is not connected to MongoDB.');
    }
  } catch (error) {
    throw new Error(
      `Cannot verify ${baseUrl}/health. ${error.message} Check the Render service logs and MongoDB network access. No app settings were changed.`,
      { cause: error },
    );
  }
  return baseUrl;
}

export async function configureApi({
  root = projectRoot,
  apiUrl,
  fetchBackend = fetch,
}) {
  const baseUrl = await checkBackend(apiUrl, fetchBackend);
  const defaults = await readSettings(
    root,
    'apps/mobile/config/development.example.json',
    {},
  );
  const development = await readSettings(root, developmentPath, defaults);
  const production = await readSettings(root, productionPath, development);
  await mkdir(resolve(root, 'apps/mobile/config'), { recursive: true });
  for (const [path, settings] of [
    [developmentPath, development],
    [productionPath, production],
  ]) {
    await writeFile(
      resolve(root, path),
      `${JSON.stringify({ ...settings, API_BASE_URL: baseUrl }, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  return baseUrl;
}

export async function checkConfiguredApi({
  root = projectRoot,
  fetchBackend = fetch,
} = {}) {
  const settings = await readSettings(root, productionPath, {});
  if (!settings.API_BASE_URL) {
    throw new Error(
      'No online backend is configured. Run npm run setup:api -- YOUR_HTTPS_BACKEND_URL first. Use the real URL from your hosting account.',
    );
  }
  return checkBackend(settings.API_BASE_URL, fetchBackend);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2);
    let baseUrl;
    if (args.length === 1 && args[0] === '--check') {
      baseUrl = await checkConfiguredApi();
    } else if (
      !args.length ||
      (args.length === 1 && !args[0].startsWith('--'))
    ) {
      let apiUrl = args[0];
      if (!apiUrl) {
        const prompt = createInterface({ input: stdin, output: stdout });
        try {
          apiUrl = await prompt.question(
            'Paste your deployed backend HTTPS address: ',
          );
        } finally {
          prompt.close();
        }
      }
      console.log(
        'Checking the backend and database. A sleeping server may take up to 90 seconds.',
      );
      baseUrl = await configureApi({ apiUrl });
      console.log(
        `Saved ${developmentPath} and ${productionPath}. Google settings were kept.`,
      );
    } else {
      throw new Error(
        'Usage: npm run setup:api -- YOUR_HTTPS_BACKEND_URL, or npm run api:check',
      );
    }
    console.log(`LifeOS backend ready: ${baseUrl}`);
    console.log(
      'Rebuild and reinstall the Android app with npm run build:android.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
