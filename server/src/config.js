import 'dotenv/config';
import { z } from 'zod';
import { validateOllamaUrl } from './ai-providers.js';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  WEB_ORIGINS: z.string().default(''),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  OLLAMA_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).max(200).default('llama3.2:3b'),
  // "LifeOS AI": free cloud models with server-held keys (any subset works).
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
});

export function readConfig(environment = process.env) {
  const values = environmentSchema.parse(environment);
  const webOrigins = values.WEB_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    webOrigins.some((origin) => {
      const parsed = new URL(origin);
      return (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin
      );
    })
  ) {
    throw new Error(
      'WEB_ORIGINS must contain exact http/https origins without paths or trailing slashes.',
    );
  }
  if (values.COOKIE_SAME_SITE === 'none' && values.NODE_ENV !== 'production') {
    throw new Error(
      'SameSite=None requires secure production HTTPS cookies. Use lax locally.',
    );
  }
  if (
    values.NODE_ENV === 'production' &&
    webOrigins.some((origin) => !origin.startsWith('https://'))
  ) {
    throw new Error('Production WEB_ORIGINS must use HTTPS.');
  }
  return {
    port: values.PORT,
    mongoUri: values.MONGODB_URI,
    webOrigins,
    googleClientIds: values.GOOGLE_CLIENT_IDS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    sessionDays: values.SESSION_DAYS,
    production: values.NODE_ENV === 'production',
    cookieSameSite: values.COOKIE_SAME_SITE,
    trustProxyHops: values.TRUST_PROXY_HOPS,
    ollamaUrl: validateOllamaUrl(values.OLLAMA_URL),
    cloudAi: {
      env: {
        GROQ_API_KEY: values.GROQ_API_KEY,
        GROQ_MODEL: values.GROQ_MODEL,
        GEMINI_API_KEY: values.GEMINI_API_KEY,
        GEMINI_MODEL: values.GEMINI_MODEL,
        OPENROUTER_API_KEY: values.OPENROUTER_API_KEY,
        OPENROUTER_MODEL: values.OPENROUTER_MODEL,
      },
      dailyLimit: values.AI_DAILY_LIMIT,
    },
    ollamaModel: values.OLLAMA_MODEL,
  };
}
