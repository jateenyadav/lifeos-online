import { ownMinor, periodTotals, spendDelta } from './money/ledger.js';

export const aiTopics = ['workouts', 'routines', 'spending'];
const topicCollections = {
  workouts: ['workouts'],
  routines: ['routines'],
  spending: ['txns', 'budgets'],
};
const moneyCollections = new Set(['txns', 'budgets']);

/** Newest Money v2 rows for the AI (transactions never include deleted ones). */
async function listMoney(money, collection, userId, limit) {
  if (!money) return [];
  const rows = await money.list(
    collection,
    userId,
    collection === 'txns' ? { deleted: { $ne: true } } : {},
  );
  const key = collection === 'txns' ? 'date' : 'month';
  return rows
    .sort((a, b) => String(b[key]).localeCompare(String(a[key])))
    .slice(0, limit);
}
const tokens = (text) => [
  ...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []),
];
const rupees = (amountMinor) => `INR ${(amountMinor / 100).toFixed(2)}`;

export async function buildAiContext({
  store,
  money,
  knowledge,
  userId,
  topics,
  question,
  now = new Date(),
}) {
  const collections = topics.flatMap((topic) => topicCollections[topic]);
  const lists = await Promise.all(
    collections.map((collection) =>
      moneyCollections.has(collection)
        ? listMoney(money, collection, userId, 2001)
        : store.listForAi(collection, userId, 2001),
    ),
  );
  const rows = Object.fromEntries(
    collections.map((collection, index) => [
      collection,
      lists[index].slice(0, 2000),
    ]),
  );
  const documents = (await knowledge.list(userId)).filter((entry) =>
    topics.includes(entry.topic),
  );
  const limited = lists.some((entries) => entries.length > 2000);
  const month = now.toISOString().slice(0, 7);
  const summaries = [];
  if (rows.workouts)
    summaries.push(
      `Workouts: ${rows.workouts.length} saved. Total logged minutes in scanned records: ${rows.workouts.reduce((sum, entry) => sum + entry.duration, 0)}.`,
    );
  if (rows.routines)
    summaries.push(
      `Daily routines: ${rows.routines.length} saved. Skin care routines: ${rows.routines.filter((entry) => entry.category === 'Skin care').length}.`,
    );
  if (rows.txns) {
    const monthly = rows.txns.filter((entry) => entry.date.startsWith(month));
    const totals = periodTotals(monthly);
    const categories = {};
    for (const entry of monthly) {
      const delta = spendDelta(entry);
      if (delta)
        categories[entry.category] = (categories[entry.category] ?? 0) + delta;
    }
    summaries.push(
      `Spending for ${month}: ${rupees(totals.spentMinor)} (my own part, after friends' shares, refunds and reimbursements). Income: ${rupees(totals.incomeMinor)}. Categories: ${
        Object.entries(categories)
          .filter(([, total]) => total > 0)
          .map(([category, total]) => `${category}: ${rupees(total)}`)
          .join(', ') || 'none'
      }. Pending, failed and self-transfer transactions are not included.`,
    );
  }
  const candidates = [];
  for (const [collection, entries] of Object.entries(rows)) {
    for (const entry of entries) {
      const fields =
        collection === 'workouts'
          ? {
              date: entry.date,
              type: entry.type,
              durationMinutes: entry.duration,
              exercises: entry.exercises,
              effort: entry.effort,
            }
          : collection === 'routines'
            ? {
                category: entry.category,
                time: entry.time,
                days: entry.days,
                completedDates: (entry.completedDates ?? []).slice(-60),
              }
            : collection === 'txns'
              ? {
                  date: entry.date,
                  direction:
                    entry.direction === 'credit' ? 'money in' : 'money out',
                  amount: rupees(entry.amountMinor),
                  myPart: rupees(ownMinor(entry)),
                  category: entry.category,
                  status: entry.status,
                  transfer: entry.isTransfer || undefined,
                  note: entry.note,
                }
              : {
                  month: entry.month,
                  category:
                    entry.category === '*' ? 'whole month' : entry.category,
                  limit: rupees(entry.limitMinor),
                };
      candidates.push({
        id: entry.id,
        title: entry.title ?? `Budget ${entry.month}`,
        kind: collection,
        text: JSON.stringify(fields),
      });
    }
  }
  for (const entry of documents) {
    for (let offset = 0; offset < entry.content.length; offset += 900) {
      candidates.push({
        id: entry.id,
        title: entry.title,
        kind: 'knowledge',
        text: entry.content.slice(offset, offset + 1100),
      });
    }
  }
  const queryTokens = tokens(question);
  const ranked = candidates
    .map((entry, index) => {
      const words = new Set(tokens(`${entry.title} ${entry.text}`));
      return {
        ...entry,
        index,
        score: queryTokens.reduce(
          (sum, word) => sum + Number(words.has(word)),
          0,
        ),
      };
    })
    .sort(
      (first, second) =>
        second.score - first.score || first.index - second.index,
    );
  const sources = [
    { id: 'summary', title: `Saved data summary (${month})`, kind: 'summary' },
  ];
  const context = [
    JSON.stringify({
      source: 'S1',
      title: sources[0].title,
      text: summaries.join('\n'),
      dateUTC: now.toISOString(),
      limited,
    }),
  ];
  let length = context[0].length;
  for (const entry of ranked) {
    if (sources.length >= 13) break;
    const text = JSON.stringify({
      source: `S${sources.length + 1}`,
      title: entry.title,
      kind: entry.kind,
      text: entry.text.slice(0, 1800),
    });
    if (length + text.length > 14000) continue;
    sources.push({ id: entry.id, title: entry.title, kind: entry.kind });
    context.push(text);
    length += text.length;
  }
  return {
    context: context.join('\n'),
    sources: sources.map((entry, index) => ({
      ...entry,
      label: `S${index + 1}`,
    })),
    limited,
    counts: {
      ...Object.fromEntries(
        Object.entries(rows).map(([collection, entries]) => [
          collection,
          entries.length,
        ]),
      ),
      knowledge: documents.length,
    },
  };
}
