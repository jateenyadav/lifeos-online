/**
 * Dev-only mock API (never bundled). Start with:
 *   MOCK_API=1 npm run dev -w apps/web          (LifeOS AI off)
 *   MOCK_API=1 MOCK_AI=1 npm run dev -w apps/web (LifeOS AI on)
 * Sign in with the demo button. Money data comes from the in-memory fake (fake-money.js).
 */
import { createFakeMoney } from './fake-money.js';

const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function sampleSpaces() {
  return {
    notes: [
      {
        id: 'n1',
        title: 'Pay electricity bill',
        body: '',
        tag: 'Home',
        kind: 'reminder',
        pinned: false,
        completed: false,
        archived: false,
        dueDate: day(0),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'n2',
        title: 'Gift ideas for Mom',
        body: 'Saree from Nalli\nPlant for the balcony',
        tag: 'Family',
        kind: 'note',
        pinned: true,
        completed: false,
        archived: false,
        dueDate: null,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'n3',
        title: 'Book dentist',
        body: '',
        tag: 'Health',
        kind: 'reminder',
        pinned: false,
        completed: false,
        archived: false,
        dueDate: day(-1),
        updatedAt: new Date().toISOString(),
      },
    ],
    workouts: [
      {
        id: 'w1',
        title: 'Morning run',
        date: day(-1),
        duration: 32,
        type: 'Cardio',
        effort: 'Moderate',
        exercises: '5 km easy pace',
      },
      {
        id: 'w2',
        title: 'Upper body',
        date: day(-3),
        duration: 45,
        type: 'Strength',
        effort: 'Hard',
        exercises: 'Bench 3×8\nRows 3×10',
      },
      {
        id: 'w3',
        title: 'Yoga',
        date: day(-5),
        duration: 25,
        type: 'Mobility',
        effort: 'Easy',
        exercises: '',
      },
    ],
    routines: [
      {
        id: 'r1',
        title: 'Drink 8 glasses of water',
        time: 'Morning',
        category: 'Water',
        days: [0, 1, 2, 3, 4, 5, 6],
        completedDates: [day(0), day(-1)],
      },
      {
        id: 'r2',
        title: 'Vitamin D',
        time: 'Morning',
        category: 'Medicine',
        days: [0, 1, 2, 3, 4, 5, 6],
        completedDates: [day(-1)],
      },
      {
        id: 'r3',
        title: 'Night skin care',
        time: 'Evening',
        category: 'Skin care',
        days: [0, 1, 2, 3, 4, 5, 6],
        completedDates: [],
      },
    ],
    expenses: [],
    budgets: [],
    payments: [],
    payees: [],
    trips: [
      {
        id: 't1',
        title: 'Goa with college gang',
        members: ['Me', 'Amit', 'Riya'],
        budgetMinor: 3000000,
        startDate: day(-40),
        endDate: day(-36),
      },
    ],
    tripItems: [
      {
        id: 'ti1',
        tripId: 't1',
        title: 'Villa',
        date: day(-40),
        kind: 'expense',
        payer: 'Me',
        participants: ['Me', 'Amit', 'Riya'],
        amountMinor: 1800000,
      },
      {
        id: 'ti2',
        tripId: 't1',
        title: 'Scooters',
        date: day(-39),
        kind: 'expense',
        payer: 'Amit',
        participants: ['Me', 'Amit', 'Riya'],
        amountMinor: 240000,
      },
    ],
  };
}

export function mockApi() {
  const money = createFakeMoney({ seed: true });
  const spaces = sampleSpaces();
  const user = {
    id: 'demo-user',
    name: 'Aarav Sharma',
    email: 'aarav@lifeos.example',
    provider: 'demo',
  };
  const ai = Boolean(process.env.MOCK_AI);
  return {
    name: 'lifeos-mock-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url.startsWith('/api/')) return next();
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : undefined;
        const signedIn = /(?:^|;\s*)mock=1/.test(request.headers.cookie || '');
        const send = (status, payload, headers = {}) => {
          response.statusCode = status;
          for (const [key, value] of Object.entries({
            'Content-Type': 'application/json',
            ...headers,
          }))
            response.setHeader(key, value);
          response.end(
            payload === null
              ? ''
              : typeof payload === 'string' || Buffer.isBuffer(payload)
                ? payload
                : JSON.stringify(payload),
          );
        };
        const url = request.url;
        const method = request.method;
        if (url.startsWith('/api/auth/')) {
          if (url === '/api/auth/me')
            return signedIn
              ? send(200, { user })
              : send(401, { message: 'Please sign in.' });
          if (url === '/api/auth/logout')
            return send(204, null, {
              'Set-Cookie': 'mock=; Path=/; Max-Age=0',
            });
          return send(
            200,
            { user },
            { 'Set-Cookie': 'mock=1; Path=/; SameSite=Lax' },
          );
        }
        if (!signedIn) return send(401, { message: 'Please sign in.' });
        if (url === '/api/ai/status')
          return send(200, {
            lifeos: { available: ai, dailyLimit: 30, remaining: 27 },
          });
        if (url === '/api/ai/knowledge') return send(200, { documents: [] });
        if (url.startsWith('/api/money')) {
          const result = money.handle(method, url, body);
          if (result.bytes)
            return send(200, Buffer.from(result.bytes.base64, 'base64'), {
              'Content-Type': result.bytes.mime,
            });
          if (result.text != null)
            return send(200, result.text, {
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="lifeos-money.csv"',
            });
          return send(result.status, result.body);
        }
        if (url.startsWith('/api/workspaces')) {
          const [collection, id, action] = url
            .replace('/api/workspaces', '')
            .split('/')
            .filter(Boolean);
          if (!collection) return send(200, spaces);
          if (collection === 'money') return send(200, { entry: { id: 'x' } });
          const list = spaces[collection];
          if (!list) return send(404, { message: 'Unknown collection.' });
          if (method === 'DELETE') {
            spaces[collection] = list.filter((entry) => entry.id !== id);
            return send(204, null);
          }
          let entry = list.find((row) => row.id === id);
          if (action === 'check') {
            entry.completedDates = body.completed
              ? [...new Set([...entry.completedDates, body.date])]
              : entry.completedDates.filter((d) => d !== body.date);
            return send(200, { entry });
          }
          entry = {
            completedDates: [],
            ...entry,
            ...body,
            id: entry?.id ?? `id${Date.now()}`,
          };
          spaces[collection] = [
            entry,
            ...list.filter((row) => row.id !== entry.id),
          ];
          return send(200, { entry });
        }
        return send(404, { message: `Mock has no route for ${url}` });
      });
    },
  };
}
