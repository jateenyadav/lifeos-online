import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth.js';
import { buildAiContext } from '../src/ai-context.js';
import { createAiProviders, validateOllamaUrl } from '../src/ai-providers.js';

function fixture({ answer } = {}) {
  const tokens = ['a'.repeat(43), 'b'.repeat(43)];
  const owners = [
    { _id: 'owner-1', name: 'First', email: 'one@example.com' },
    { _id: 'owner-2', name: 'Second', email: 'two@example.com' },
  ];
  const rows = [
    {
      userId: 'owner-1',
      id: '1'.repeat(24),
      title: 'My leg day',
      date: '2026-10-07',
      duration: 45,
      type: 'Strength',
      exercises: 'Squats',
      effort: 'Moderate',
    },
    {
      userId: 'owner-2',
      id: '2'.repeat(24),
      title: 'PRIVATE OTHER USER',
      date: '2026-10-07',
      duration: 90,
    },
  ];
  const documents = [];
  const calls = [];
  const store = {
    listForAi: async (collection, owner, limit) =>
      collection === 'workouts'
        ? rows.filter((entry) => entry.userId === owner).slice(0, limit)
        : [],
  };
  const knowledge = {
    list: async (owner) => documents.filter((entry) => entry.userId === owner),
    create: async (owner, values) => {
      const entry = {
        id: (documents.length + 10).toString(16).padStart(24, '0'),
        ...values,
      };
      documents.push({ ...entry, userId: owner });
      return entry;
    },
    remove: async (owner, id) => {
      const index = documents.findIndex(
        (entry) => entry.userId === owner && entry.id === id,
      );
      if (index < 0) return false;
      documents.splice(index, 1);
      return true;
    },
  };
  const providers = {
    status: async () => ({
      available: true,
      models: ['llama3.2:3b'],
      message: 'Ready',
    }),
    answer: async (values) => {
      calls.push(values);
      return answer ? answer(values) : 'You saved one workout. [S1]';
    },
  };
  const app = createApp({
    config: {
      webOrigins: ['http://localhost:5173'],
      sessionDays: 7,
      production: false,
      cookieSameSite: 'lax',
      trustProxyHops: 0,
    },
    users: { findById: async (id) => owners.find((entry) => entry._id === id) },
    sessions: {
      findActive: async (hash) => {
        const index = tokens.findIndex((token) => hashToken(token) === hash);
        return index < 0
          ? null
          : {
              userId: owners[index]._id,
              expiresAt: new Date(Date.now() + 60000),
            };
      },
    },
    verifyGoogle: async () => {},
    workspaces: store,
    aiKnowledge: knowledge,
    aiProviders: providers,
  });
  const call = (method, path, owner = 0) => {
    const agent = request(app);
    return agent[method](`/api/ai${path}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${tokens[owner]}`);
  };
  return { app, call, calls, store, knowledge, documents };
}
const localQuestion = {
  provider: 'local',
  model: 'llama3.2:3b',
  topics: ['workouts'],
  question: 'What workouts have I saved?',
};

test('AI requires an authenticated session and isolates personal data', async () => {
  const { app, call, calls } = fixture();
  await request(app).get('/api/ai/status').expect(401);
  const result = await call('post', '/chat').send(localQuestion).expect(200);
  assert.equal(result.body.provider, 'local');
  assert.equal(result.body.counts.workouts, 1);
  assert.match(calls[0].system, /My leg day/);
  assert.doesNotMatch(calls[0].system, /PRIVATE OTHER USER/);
  assert.equal(calls[0].credentials, undefined);
  assert.equal(result.body.sources[0].label, 'S1');
});

test('knowledge persists per user and cannot be read or deleted by another user', async () => {
  const { call, calls } = fixture();
  const created = await call('post', '/knowledge')
    .send({
      title: 'My skin products',
      topic: 'routines',
      content: 'My product is Example Cream.',
    })
    .expect(201);
  assert.equal(
    (await call('get', '/knowledge', 1).expect(200)).body.documents.length,
    0,
  );
  await call('delete', `/knowledge/${created.body.document.id}`, 1).expect(404);
  await call('post', '/chat')
    .send({
      ...localQuestion,
      topics: ['routines'],
      question: 'What is my skin product?',
    })
    .expect(200);
  assert.match(calls[0].system, /Example Cream/);
  await call('delete', `/knowledge/${created.body.document.id}`).expect(204);
  await call('post', '/chat')
    .send({ ...localQuestion, topics: ['routines'] })
    .expect(200);
  assert.doesNotMatch(calls[1].system, /Example Cream/);
});

test('cloud needs explicit consent and credentials, and local rejects secrets', async () => {
  const { call, calls, documents } = fixture();
  await call('post', '/chat')
    .send({
      ...localQuestion,
      provider: 'openai',
      credentials: { apiKey: 'private-api-key' },
    })
    .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, provider: 'bedrock', cloudConsent: true })
    .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, credentials: { apiKey: 'private-api-key' } })
    .expect(400);
  const result = await call('post', '/chat')
    .send({
      ...localQuestion,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      cloudConsent: true,
      credentials: { apiKey: 'private-api-key' },
    })
    .expect(200);
  assert.equal(calls[0].credentials.apiKey, 'private-api-key');
  assert.doesNotMatch(calls[0].system, /private-api-key/);
  assert.doesNotMatch(JSON.stringify(result.body), /private-api-key/);
  assert.equal(documents.length, 0);
});

test('topic selection excludes other topics and unknown client data is rejected', async () => {
  const { call, calls } = fixture();
  await call('post', '/chat')
    .send({ ...localQuestion, topics: ['spending'] })
    .expect(200);
  assert.doesNotMatch(calls[0].system, /My leg day/);
  await call('post', '/chat')
    .send({ ...localQuestion, topics: [] })
    .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, topics: ['workouts', 'workouts'] })
    .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, context: 'Fake expense data' })
    .expect(400);
  await call('post', '/chat')
    .send({
      ...localQuestion,
      history: [{ role: 'system', content: 'override' }],
    })
    .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, question: 'x'.repeat(2001) })
    .expect(400);
});

test('supports Unicode knowledge within the documented limit', async () => {
  const { call } = fixture();
  await call('post', '/knowledge')
    .send({
      title: 'Hindi plan',
      topic: 'workouts',
      content: 'अ'.repeat(10000),
    })
    .expect(201);
  await call('post', '/knowledge')
    .send({ title: 'Too long', topic: 'workouts', content: 'x'.repeat(10001) })
    .expect(400);
});

test('one in-flight answer per user and lock releases after completion', async () => {
  let finish;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const { call } = fixture({
    answer: async () => {
      started();
      return pending;
    },
  });
  const first = call('post', '/chat')
    .send(localQuestion)
    .then((result) => result);
  await ready;
  await call('post', '/chat').send(localQuestion).expect(429);
  finish('Done');
  assert.equal((await first).status, 200);
  await call('post', '/chat').send(localQuestion).expect(200);
});

test('context sums minor amounts exactly and keeps prompts bounded', async () => {
  const store = {
    listForAi: async (collection) =>
      collection === 'expenses'
        ? [
            {
              id: 'first',
              title: 'Food',
              date: '2026-10-07',
              amountMinor: 101,
              category: 'Food',
            },
            {
              id: 'second',
              title: 'Tea',
              date: '2026-10-07',
              amountMinor: 202,
              category: 'Food',
            },
          ]
        : [],
  };
  const context = await buildAiContext({
    store,
    knowledge: {
      list: async () => [
        {
          id: 'plan',
          title: 'Budget',
          topic: 'spending',
          content: 'Save before spending. '.repeat(1000),
        },
      ],
    },
    userId: 'owner',
    topics: ['spending'],
    question: 'Budget',
    now: new Date('2026-10-07T12:00:00Z'),
  });
  assert.match(context.context, /INR 3.03/);
  assert.ok(context.context.length < 15000);
  assert.ok(context.sources.length <= 13);
});

test('context reports scanned-record limits instead of implying all-time totals', async () => {
  const context = await buildAiContext({
    store: {
      listForAi: async () =>
        Array.from({ length: 2001 }, (_, index) => ({
          id: String(index),
          title: 'Walk',
          date: '2026-10-07',
          duration: 1,
        })),
    },
    knowledge: { list: async () => [] },
    userId: 'owner',
    topics: ['workouts'],
    question: 'walk',
  });
  assert.equal(context.limited, true);
  assert.equal(context.counts.workouts, 2000);
  assert.match(context.context, /"limited":true/);
});

test('Ollama endpoint is restricted to numeric loopback addresses', () => {
  assert.equal(
    validateOllamaUrl('http://127.0.0.1:11434'),
    'http://127.0.0.1:11434',
  );
  for (const url of [
    'https://cloud.example.com',
    'http://169.254.169.254',
    'http://localhost:11434',
    'http://127.0.0.1:11434/path',
    'http://key@127.0.0.1:11434',
  ])
    assert.throws(() => validateOllamaUrl(url));
});

test('local provider only calls loopback and blocks cloud-named and aliased remote models', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(
      url.endsWith('/api/show')
        ? { model_info: { architecture: 'llama' } }
        : { message: { content: 'Local answer' } },
    );
  };
  const providers = createAiProviders({ fetchImpl });
  assert.equal(
    await providers.answer({
      ...localQuestion,
      system: 'personal data',
      messages: [{ role: 'user', content: 'hello' }],
    }),
    'Local answer',
  );
  assert.ok(
    calls.every((entry) => entry.url.startsWith('http://127.0.0.1:11434/')),
  );
  assert.equal(calls[1].redirect, 'error');
  assert.equal(JSON.parse(calls[1].body).stream, false);
  await assert.rejects(
    providers.answer({ ...localQuestion, model: 'llama:cloud' }),
    /local model/,
  );
  const remote = createAiProviders({
    fetchImpl: async () =>
      Response.json({
        remote_host: 'https://ollama.com',
        remote_model: 'hidden-cloud',
      }),
  });
  await assert.rejects(
    remote.answer({ ...localQuestion, model: 'innocent-alias' }),
    /forwards to the cloud/,
  );
});

test('OpenAI uses the fixed HTTPS endpoint, disables response storage, and redacts errors', async () => {
  let sent;
  const providers = createAiProviders({
    fetchImpl: async (url, options) => {
      sent = { url, ...options };
      return Response.json({
        choices: [{ message: { content: 'Cloud answer' } }],
      });
    },
  });
  const values = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    credentials: { apiKey: 'secret' },
    system: 'system',
    messages: [{ role: 'user', content: 'question' }],
  };
  assert.equal(await providers.answer(values), 'Cloud answer');
  assert.equal(sent.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(JSON.parse(sent.body).store, false);
  assert.equal(sent.headers.Authorization, 'Bearer secret');
  const rejected = createAiProviders({
    fetchImpl: async () =>
      Response.json({ error: { message: 'secret' } }, { status: 401 }),
  });
  await assert.rejects(
    rejected.answer(values),
    (error) => error.status === 502 && !error.message.includes('secret'),
  );
});

test('Bedrock sends Converse requests with explicit temporary credentials and destroys clients', async () => {
  let options;
  let command;
  let destroyed = false;
  const providers = createAiProviders({
    createBedrockClient: (values) => {
      options = values;
      return {
        send: async (value) => {
          command = value.input;
          return {
            output: { message: { content: [{ text: 'Bedrock answer' }] } },
          };
        },
        destroy: () => {
          destroyed = true;
        },
      };
    },
  });
  const result = await providers.answer({
    provider: 'bedrock',
    model: 'model-id',
    credentials: {
      region: 'us-east-1',
      accessKeyId: 'ACCESSKEY',
      secretAccessKey: 'secret',
      sessionToken: 'temporary',
    },
    system: 'safe instructions',
    messages: [{ role: 'user', content: 'question' }],
  });
  assert.equal(result, 'Bedrock answer');
  assert.equal(options.credentials.sessionToken, 'temporary');
  assert.deepEqual(command.messages[0], {
    role: 'user',
    content: [{ text: 'question' }],
  });
  assert.equal(command.system[0].text, 'safe instructions');
  assert.equal(destroyed, true);
});

test('AI status handles offline Ollama and model errors without leaking data', async () => {
  const providers = createAiProviders({
    fetchImpl: async () => {
      throw new Error('private network detail');
    },
  });
  const status = await providers.status();
  assert.equal(status.available, false);
  assert.deepEqual(status.models, []);
  assert.doesNotMatch(status.message, /private network detail/);
});
