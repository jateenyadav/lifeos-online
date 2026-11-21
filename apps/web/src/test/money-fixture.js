import { vi } from 'vitest';
import { createFakeMoney } from '../dev/fake-money.js';
import { workspaceFixture } from './workspace-fixture.js';
import { dateKey } from '../workspaces/utils.js';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * One fake fetch for the whole app: /api/money/* → the in-memory Money fake,
 * /api/workspaces → workspaceFixture, /api/ai/status → { lifeos: { available } }.
 */
export function appFixture({
  ai = false,
  seed = false,
  today = dateKey(),
  workspaces = {},
} = {}) {
  const money = createFakeMoney({ seed, today });
  const spaces = workspaceFixture(workspaces);
  const fetch = vi.fn(async (url, options = {}) => {
    const path = String(url);
    if (path.startsWith('/api/money')) {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const result = money.handle(options.method || 'GET', path, body);
      if (result.status === 204) return new Response(null, { status: 204 });
      if (result.text != null)
        return new Response(result.text, {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        });
      return json(result.body, result.status);
    }
    if (path === '/api/ai/status')
      return json({
        lifeos: {
          available: ai,
          dailyLimit: 30,
          providers: ai ? ['groq'] : [],
        },
      });
    if (path === '/api/ai/knowledge') return json({ documents: [] });
    if (path.startsWith('/api/workspaces')) return spaces.fetch(path, options);
    return json({ message: `No fake for ${path}` }, 404);
  });
  const calls = (method, pattern) =>
    fetch.mock.calls
      .filter(
        ([url, options = {}]) =>
          (options.method || 'GET') === method && pattern.test(String(url)),
      )
      .map(([url, options = {}]) => ({
        url: String(url),
        body: options.body ? JSON.parse(options.body) : undefined,
      }));
  return { fetch, money, spaces, calls };
}
