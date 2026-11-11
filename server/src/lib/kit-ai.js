// shared-kit v1 (copied from ~/Desktop/RND/shared-kit/lib/ai.js) — AI client with provider fallback.
// Grown from Exam-AI/lib/ai/index.ts (generateJson + zod + fallback). Every provider here speaks the
// OpenAI chat-completions format, so one code path covers Groq, Gemini (OpenAI-compatible endpoint)
// and OpenRouter. Model output is untrusted input: JSON is schema-checked before use.

import { createHash } from 'node:crypto';

export class AiUnavailableError extends Error {
  constructor(message = 'The AI is busy right now. Please try again in a minute.') {
    super(message);
    this.status = 503;
  }
}

const PRESETS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', vision: true },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free' },
};

/**
 * Build the provider list from env. Only providers with a key are included.
 * Model names come from env so they can change without a code change:
 * GROQ_MODEL, GROQ_VISION_MODEL, GEMINI_MODEL, OPENROUTER_MODEL, OPENROUTER_VISION_MODEL.
 */
export function providersFromEnv(env = process.env) {
  const list = [];
  if (env.GROQ_API_KEY) {
    list.push({ name: 'groq', ...PRESETS.groq, apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL || PRESETS.groq.model, visionModel: env.GROQ_VISION_MODEL || null });
  }
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || PRESETS.gemini.model;
    list.push({ name: 'gemini', ...PRESETS.gemini, apiKey: env.GEMINI_API_KEY, model, visionModel: model });
  }
  if (env.OPENROUTER_API_KEY) {
    list.push({ name: 'openrouter', ...PRESETS.openrouter, apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL || PRESETS.openrouter.model, visionModel: env.OPENROUTER_VISION_MODEL || null });
  }
  return list;
}

/** Models often wrap JSON in ``` fences or add prose — pull out the JSON value. */
export function extractJson(text) {
  const cleaned = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI response was not JSON');
  }
}

const hashKey = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * @param {object} opts
 * @param {Array} [opts.providers]  from providersFromEnv()
 * @param {number} [opts.timeoutMs] per provider attempt
 * @param {{get:(k:string)=>Promise<any>, set:(k:string,v:any,ttlMs:number)=>Promise<void>}} [opts.cache]
 * @param {(level:string,data:object)=>void} [opts.log]
 * @param {typeof fetch} [opts.fetch]
 * @param {string} [opts.appName]  sent to OpenRouter as X-Title
 */
export function createAi({ providers = providersFromEnv(), timeoutMs = 30000, cache, log = () => {}, fetch: fetchImpl = globalThis.fetch, appName = 'app' } = {}) {
  /** Providers able to serve this request, in try order. Images go to vision-capable models first. */
  function order(needsVision) {
    if (!needsVision) return providers.map((p) => ({ ...p, use: p.model }));
    return providers
      .filter((p) => p.visionModel)
      .sort((a, b) => (b.vision ? 1 : 0) - (a.vision ? 1 : 0))
      .map((p) => ({ ...p, use: p.visionModel }));
  }

  function buildMessages({ system, messages, prompt, image }) {
    const out = [];
    if (system) out.push({ role: 'system', content: system });
    if (messages) out.push(...messages);
    if (prompt !== undefined) {
      out.push({
        role: 'user',
        content: image
          ? [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
            ]
          : prompt,
      });
    }
    return out;
  }

  async function callOnce(p, body, signal) {
    const res = await fetchImpl(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        'Content-Type': 'application/json',
        ...(p.name === 'openrouter' ? { 'X-Title': appName } : {}),
      },
      body: JSON.stringify({ ...body, model: p.use }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`${p.name} ${res.status} ${detail.slice(0, 160)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /** Try each provider until one returns a result that passes `accept` (which may throw). */
  async function withFallback(label, req, body, accept) {
    const list = order(Boolean(req.image));
    if (!list.length) throw new AiUnavailableError(req.image ? 'No AI model that can read images is configured.' : 'AI is not configured on this server.');
    let lastError;
    for (const p of list) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? timeoutMs);
      try {
        const data = await callOnce(p, body, controller.signal);
        const result = accept(data, p);
        log('info', { ai: label, provider: p.name, model: p.use, ms: Date.now() - started, ok: true });
        return result;
      } catch (err) {
        lastError = err;
        log('warn', { ai: label, provider: p.name, model: p.use, ms: Date.now() - started, ok: false, msg: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err).slice(0, 200) });
      } finally {
        clearTimeout(timer);
      }
    }
    const e = new AiUnavailableError();
    e.cause = lastError;
    throw e;
  }

  async function cached(req, compute) {
    if (!cache || !req.cacheTtlMs) return compute();
    const key = `ai:${req.label || 'x'}:${hashKey(req.cacheKey ?? [req.system, req.messages, req.prompt, req.image?.base64?.length])}`;
    const hit = await cache.get(key).catch(() => null);
    if (hit !== null && hit !== undefined) return hit;
    const value = await compute();
    await cache.set(key, value, req.cacheTtlMs).catch(() => {});
    return value;
  }

  /**
   * Plain chat. Returns { text, provider, model }.
   * req: { system, messages?, prompt?, image?: {mimeType, base64}, maxTokens?, temperature?, label?, cacheTtlMs?, cacheKey? }
   */
  async function chat(req) {
    return cached(req, () =>
      withFallback(
        req.label || 'chat',
        req,
        { messages: buildMessages(req), max_tokens: req.maxTokens ?? 1200, temperature: req.temperature ?? 0.4 },
        (data, p) => {
          const text = data?.choices?.[0]?.message?.content;
          if (!text || !String(text).trim()) throw new Error('empty answer');
          return { text: String(text).trim(), provider: p.name, model: p.use };
        },
      ),
    );
  }

  /**
   * Ask for JSON matching a zod schema. A provider "fails" if it errors, times out or returns
   * output that doesn't match — then the next provider is tried.
   */
  async function json(schema, req) {
    const system = `${req.system || ''}\n\nReply with ONLY valid JSON. No markdown, no commentary.`.trim();
    return cached(req, () =>
      withFallback(
        req.label || 'json',
        req,
        {
          messages: buildMessages({ ...req, system }),
          max_tokens: req.maxTokens ?? 2000,
          temperature: req.temperature ?? 0.2,
          response_format: { type: 'json_object' },
        },
        (data) => {
          const parsed = schema.safeParse(extractJson(data?.choices?.[0]?.message?.content));
          if (!parsed.success) throw new Error(`schema mismatch: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
          return parsed.data;
        },
      ),
    );
  }

  /**
   * Small agent loop with tool calling.
   * tools: { name: { description, parameters (JSON Schema), run: async (args, ctx) => result } }
   * Returns { text, steps: [{tool, args, result}] }. Tool results are sent back to the model as JSON.
   * A tool can return { confirm: true, preview } to stop the loop and ask the user first.
   */
  async function agent({ system, messages, tools, maxSteps = 4, label = 'agent', ctx }) {
    const toolDefs = Object.entries(tools).map(([name, t]) => ({
      type: 'function',
      function: { name, description: t.description, parameters: t.parameters },
    }));
    const convo = buildMessages({ system, messages });
    const steps = [];
    for (let i = 0; i < maxSteps; i++) {
      const msg = await withFallback(label, {}, { messages: convo, tools: toolDefs, tool_choice: 'auto', max_tokens: 1200, temperature: 0.2 }, (data) => {
        const m = data?.choices?.[0]?.message;
        if (!m) throw new Error('empty answer');
        return m;
      });
      const calls = msg.tool_calls || [];
      if (!calls.length) return { text: String(msg.content || '').trim(), steps };
      convo.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        const tool = tools[call.function?.name];
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* bad args → tool sees {} */ }
        let result;
        if (!tool) result = { error: 'unknown tool' };
        else {
          try { result = await tool.run(args, ctx); } catch (err) { result = { error: String(err?.message || err) }; }
        }
        steps.push({ tool: call.function?.name, args, result });
        if (result && result.confirm) return { text: result.message || '', steps, pending: result };
        convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }
    return { text: 'I could not finish that in a few steps. Try asking in a simpler way.', steps };
  }

  return {
    chat,
    json,
    agent,
    status: () => ({ providers: providers.map((p) => ({ name: p.name, model: p.model, vision: Boolean(p.visionModel) })) }),
    configured: () => providers.length > 0,
  };
}
