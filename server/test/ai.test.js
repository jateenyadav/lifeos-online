import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth.js';
import { buildAiContext } from '../src/ai-context.js';
import { createMemoryMoneyStore } from '../src/money/memory-store.js';
import { newTxn } from '../src/money/service.js';

function fixture({ answer, cloudAi } = {}) {
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
  // Stands in for the free server-side "LifeOS AI" (the only AI the server offers).
  const fakeCloud = {
    available: () => true,
    status: () => ({
      available: true,
      providers: ['test'],
      dailyLimit: 30,
      message: 'LifeOS AI is ready.',
    }),
    spend: async () => ({ used: 1, remaining: 29 }),
    ai: {},
    answer: async (values) => {
      calls.push(values);
      const text = answer
        ? await answer(values)
        : 'You saved one workout. [S1]';
      return { text, provider: 'test', quota: { remaining: 29 } };
    },
  };
  const money = createMemoryMoneyStore();
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
    money,
    aiKnowledge: knowledge,
    cloudAi: cloudAi ?? fakeCloud,
  });
  const call = (method, path, owner = 0) => {
    const agent = request(app);
    return agent[method](`/api/ai${path}`)
      .set('X-Client-Type', 'mobile')
      .set('Authorization', `Bearer ${tokens[owner]}`);
  };
  return { app, call, calls, store, money, knowledge, documents };
}
const localQuestion = {
  provider: 'lifeos',
  cloudConsent: true,
  topics: ['workouts'],
  question: 'What workouts have I saved?',
};

test('AI requires an authenticated session and isolates personal data', async () => {
  const { app, call, calls } = fixture();
  await request(app).get('/api/ai/status').expect(401);
  const result = await call('post', '/chat').send(localQuestion).expect(200);
  assert.equal(result.body.provider, 'lifeos');
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

test('only LifeOS AI is offered: local models and your own keys are gone', async () => {
  const { call, calls, documents } = fixture();
  for (const provider of ['local', 'openai', 'bedrock'])
    await call('post', '/chat')
      .send({ ...localQuestion, provider })
      .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, credentials: { apiKey: 'private-api-key' } })
    .expect(400);
  await call('post', '/chat')
    .send({ ...localQuestion, cloudConsent: undefined })
    .expect(400);
  assert.equal(calls.length, 0);
  assert.equal(documents.length, 0);
  const status = await call('get', '/status').expect(200);
  assert.deepEqual(Object.keys(status.body), ['lifeos']);
  assert.deepEqual(Object.keys(status.body.lifeos).sort(), [
    'available',
    'dailyLimit',
    'message',
    'providers',
  ]);
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

test('context reads Money v2, sums my own part exactly and keeps prompts bounded', async () => {
  const money = createMemoryMoneyStore();
  const add = (values) =>
    money.create(
      'txns',
      'owner',
      newTxn({
        date: '2026-10-07',
        direction: 'debit',
        category: 'Food',
        ...values,
      }),
    );
  await add({ title: 'Food', amountMinor: 101 });
  await add({ title: 'Tea', amountMinor: 202 });
  // Rahul's share of a split, a self-transfer and a deleted row never count as my spending.
  await add({
    title: 'Dinner',
    amountMinor: 900,
    peerShareMinor: 600,
    peerTag: 'split',
  });
  await add({ title: 'To SBI', amountMinor: 50000, isTransfer: true });
  await add({ title: 'Gone', amountMinor: 70000, deleted: true });
  await money.create(
    'txns',
    'someone-else',
    newTxn({
      date: '2026-10-07',
      direction: 'debit',
      title: 'Theirs',
      amountMinor: 999,
    }),
  );
  const context = await buildAiContext({
    store: { listForAi: async () => [] },
    money,
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
  assert.match(context.context, /INR 6.03/);
  assert.doesNotMatch(context.context, /Gone|Theirs/);
  assert.equal(context.counts.txns, 4);
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

// ---- "LifeOS AI": free server-side models ----
import { createCloudAi } from '../src/ai-cloud.js';

const reply = (content) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: async () => '',
});
const lifeosQuestion = {
  provider: 'lifeos',
  cloudConsent: true,
  topics: ['workouts'],
  question: 'What workouts have I saved?',
};

test('LifeOS AI answers with server keys, falls back between providers and counts the daily allowance', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    if (url.includes('groq'))
      return {
        ok: false,
        status: 429,
        json: async () => ({}),
        text: async () => 'busy',
      };
    return reply('You saved one workout: My leg day. [S1]');
  };
  const cloudAi = createCloudAi({
    env: { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm' },
    dailyLimit: 2,
    fetchImpl,
  });
  const { call } = fixture({ cloudAi });
  const status = await call('get', '/status').expect(200);
  assert.equal(status.body.lifeos.available, true);
  const first = await call('post', '/chat').send(lifeosQuestion).expect(200);
  assert.match(first.body.answer, /leg day/);
  assert.equal(first.body.model, 'gemini');
  assert.equal(first.body.remainingToday, 1);
  // Only this user's data went to the model.
  const system = seen.at(-1).body.messages[0].content;
  assert.match(system, /My leg day/);
  assert.doesNotMatch(system, /PRIVATE OTHER USER/);
  await call('post', '/chat').send(lifeosQuestion).expect(200);
  const third = await call('post', '/chat').send(lifeosQuestion).expect(429);
  assert.match(third.body.message, /today's 2 free AI questions/);
  // Another user has their own allowance.
  await call('post', '/chat', 1).send(lifeosQuestion).expect(200);
});

test('LifeOS AI without server keys says so clearly', async () => {
  const { call } = fixture({ cloudAi: createCloudAi({ env: {} }) });
  const status = await call('get', '/status').expect(200);
  assert.equal(status.body.lifeos.available, false);
  const result = await call('post', '/chat').send(lifeosQuestion).expect(503);
  assert.match(result.body.message, /not set up/);
});

test('LifeOS AI requires the cloud consent flag', async () => {
  const { call } = fixture({
    cloudAi: createCloudAi({
      env: { GROQ_API_KEY: 'g' },
      fetchImpl: async () => reply('x'),
    }),
  });
  const withoutConsent = { ...lifeosQuestion };
  delete withoutConsent.cloudConsent;
  await call('post', '/chat').send(withoutConsent).expect(400);
});

// ---- "Tell LifeOS": tool calling that proposes records ----
const toolCall = (name, args) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [
      {
        message: {
          content: '',
          tool_calls: [
            {
              id: 't1',
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  }),
  text: async () => '',
});

test('Tell LifeOS turns a sentence into a proposed expense, without saving it', async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return toolCall('add_expense', {
      title: 'Lunch with Rahul',
      amount: 250,
      category: 'Food',
      date: '2026-11-10',
      payment: 'UPI',
    });
  };
  const cloudAi = createCloudAi({ env: { GROQ_API_KEY: 'g' }, fetchImpl });
  const { call, money } = fixture({ cloudAi });
  const result = await call('post', '/act')
    .send({
      message: 'spent 250 on lunch with Rahul yesterday',
      today: '2026-11-11',
    })
    .expect(200);
  assert.equal(result.body.proposal.collection, 'txns');
  assert.equal(result.body.proposal.path, '/money/txns');
  assert.deepEqual(result.body.proposal.values, {
    date: '2026-11-10',
    amountMinor: 25000,
    direction: 'debit',
    title: 'Lunch with Rahul',
    category: 'Food',
    channel: 'UPI',
    note: '',
  });
  assert.equal(
    (await money.list('txns', 'owner-1')).length,
    0,
    'nothing is saved before the user confirms',
  );
  assert.match(result.body.reply, /₹250/);
  assert.match(bodies[0].messages[0].content, /Today is 2026-11-11/);
  assert.ok(bodies[0].tools.some((t) => t.function.name === 'add_expense'));
});

test("Tell LifeOS answers spending questions from the user's own Money data only", async () => {
  let step = 0;
  const fetchImpl = async (_url, init) => {
    step += 1;
    if (step === 1)
      return toolCall('spending_summary', {
        from: '2026-11-01',
        to: '2026-11-30',
        category: 'Food',
      });
    const tool = JSON.parse(init.body).messages.find((m) => m.role === 'tool');
    const data = JSON.parse(tool.content);
    return reply(`You spent ${data.total} on food.`);
  };
  const cloudAi = createCloudAi({ env: { GROQ_API_KEY: 'g' }, fetchImpl });
  const { call, money } = fixture({ cloudAi });
  const add = (owner, values) =>
    money.create(
      'txns',
      owner,
      newTxn({ direction: 'debit', category: 'Food', ...values }),
    );
  await add('owner-1', {
    title: 'Lunch',
    date: '2026-11-03',
    amountMinor: 25000,
  });
  await add('owner-1', {
    title: 'Dinner',
    date: '2026-11-05',
    amountMinor: 100100,
    peerShareMinor: 50050,
    peerTag: 'split',
  });
  await add('owner-1', {
    title: 'Cab',
    date: '2026-11-05',
    amountMinor: 30000,
    category: 'Travel',
  });
  await add('owner-1', {
    title: 'Old',
    date: '2026-10-05',
    amountMinor: 99900,
  });
  await add('owner-2', {
    title: 'Theirs',
    date: '2026-11-05',
    amountMinor: 77700,
  });
  const result = await call('post', '/act')
    .send({ message: 'how much on food this month?', today: '2026-11-11' })
    .expect(200);
  assert.equal(result.body.reply, 'You spent ₹750.5 on food.');
});

test('Tell LifeOS rejects an invalid proposal instead of showing it', async () => {
  const fetchImpl = async () =>
    toolCall('add_expense', {
      title: 'Weird',
      amount: -5,
      category: 'Food',
      date: 'not-a-date',
    });
  const { call } = fixture({
    cloudAi: createCloudAi({ env: { GROQ_API_KEY: 'g' }, fetchImpl }),
  });
  const result = await call('post', '/act')
    .send({ message: 'spent minus five', today: '2026-11-11' })
    .expect(200);
  assert.equal(result.body.proposal, undefined);
  assert.match(
    result.body.reply,
    /couldn't turn that into a valid entry|Done|amount/i,
  );
});
