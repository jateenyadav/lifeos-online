import { ApiError } from './auth.js';
import { createAi, providersFromEnv } from './lib/kit-ai.js';

const DAY = 86400000;

/** In-memory usage counter (tests and local dev). Production uses mongoAiUsage. */
export function memoryUsage() {
  const counts = new Map();
  return {
    async hit(key, windowMs, now = Date.now()) {
      const current = counts.get(key);
      if (!current || current.expiresAt <= now) {
        counts.set(key, { n: 1, expiresAt: now + windowMs });
        return 1;
      }
      current.n += 1;
      return current.n;
    },
  };
}

/**
 * "LifeOS AI": free cloud models with keys held by the server (Groq → Gemini → OpenRouter),
 * so the live website works without Ollama and without users bringing their own key.
 * Each user gets a daily question allowance to protect the free quotas.
 */
export function createCloudAi({
  env = process.env,
  usage = memoryUsage(),
  dailyLimit = 30,
  fetchImpl,
  log,
} = {}) {
  const providers = providersFromEnv(env);
  const ai = createAi({ providers, timeoutMs: 30000, appName: 'LifeOS', log, ...(fetchImpl ? { fetch: fetchImpl } : {}) });

  async function spend(userId) {
    const day = new Date().toISOString().slice(0, 10);
    const used = await usage.hit(`ai:${userId}:${day}`, DAY);
    if (used > dailyLimit)
      throw new ApiError(
        429,
        `You've used today's ${dailyLimit} free AI questions. They reset at midnight (UTC).`,
      );
    return { used, remaining: dailyLimit - used };
  }

  return {
    available: () => providers.length > 0,
    status: () => ({
      available: providers.length > 0,
      providers: providers.map((p) => p.name),
      dailyLimit,
      message: providers.length
        ? 'LifeOS AI is ready. Free, no key needed.'
        : 'LifeOS AI is not set up on this server yet.',
    }),
    ai,
    spend,
    async answer({ userId, system, messages }) {
      if (!providers.length) throw new ApiError(503, 'LifeOS AI is not set up on this server yet. Use local AI or your own key.');
      const quota = await spend(userId);
      try {
        const { text, provider } = await ai.chat({ system, messages, maxTokens: 1000, temperature: 0.3, label: 'lifeos-chat' });
        return { text: text.slice(0, 12000), provider, quota };
      } catch (error) {
        if (error?.status === 503) throw new ApiError(503, 'LifeOS AI is busy right now. Please try again in a minute.');
        throw error;
      }
    },
  };
}
