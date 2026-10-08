import { vi } from 'vitest';

export function workspaceFixture(initial = {}) {
  const data = structuredClone({
    notes: [],
    workouts: [],
    routines: [],
    expenses: [],
    budgets: [],
    ...initial,
  });
  let counter = 0;
  const response = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetch = vi.fn(async (path, options = {}) => {
    const [collection, id, action] = path
      .replace('/api/workspaces', '')
      .split('/')
      .filter(Boolean);
    if (!collection) return response(data);
    const values = options.body ? JSON.parse(options.body) : {};
    if (options.method === 'DELETE') {
      data[collection] = data[collection].filter((entry) => entry.id !== id);
      return new Response(null, { status: 204 });
    }
    let previous = data[collection].find(
      (entry) =>
        entry.id === id ||
        (collection === 'budgets' && entry.month === values.month),
    );
    if (action === 'check') {
      previous.completedDates = values.completed
        ? [...new Set([...previous.completedDates, values.date])]
        : previous.completedDates.filter((date) => date !== values.date);
      return response({ entry: previous });
    }
    const defaults =
      collection === 'notes'
        ? {
            body: '',
            tag: 'Personal',
            kind: 'note',
            pinned: false,
            completed: false,
            archived: false,
            dueDate: null,
          }
        : collection === 'routines'
          ? { completedDates: [] }
          : {};
    const entry = {
      ...defaults,
      ...previous,
      ...values,
      id: previous?.id || (++counter).toString(16).padStart(24, '0'),
      updatedAt: new Date().toISOString(),
    };
    data[collection] = [
      entry,
      ...data[collection].filter((row) => row.id !== entry.id),
    ];
    return response({ entry });
  });
  return { data, fetch, response };
}
