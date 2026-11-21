/**
 * Repeating payments (subscriptions, rent, EMIs, phone / OTT bills) found from history, with the
 * next expected date. Port of SpendSense lib/domain/recurring/recurring.dart.
 */
import { addDays, dayInMonth, daysBetween, parts, toDay } from './dates.js';

const cadences = {
  weekly: [7, 2],
  monthly: [30, 4],
  quarterly: [91, 8],
  yearly: [365, 15],
};

export function monthlyMinor(amountMinor, period) {
  if (period === 'weekly') return Math.round((amountMinor * 52) / 12);
  if (period === 'quarterly') return Math.round(amountMinor / 3);
  if (period === 'yearly') return Math.round(amountMinor / 12);
  return amountMinor;
}

function advance(day, period) {
  const { year, month, date } = parts(day);
  if (period === 'weekly') return addDays(day, 7);
  if (period === 'monthly') return dayInMonth(year, month + 1, date);
  if (period === 'quarterly') return dayInMonth(year, month + 3, date);
  return toDay(Date.UTC(year + 1, month - 1, date));
}

/**
 * inputs: [{key, name, amountMinor, date}]. Payments to the same merchant, similar amount
 * (± `tolerance`), at a regular interval, seen at least `minCount` times (`longMinCount` for
 * quarterly / yearly). Stale ones (missed more than 1.5 periods) are dropped.
 * → [{key, name, amountMinor, period, lastDate, nextDate, count, monthlyMinor, yearlyMinor}]
 */
export function detectRecurring(
  inputs,
  { now, minCount = 3, longMinCount = 2, tolerance = 0.15 },
) {
  const byKey = new Map();
  for (const input of inputs) {
    if (!byKey.has(input.key)) byKey.set(input.key, []);
    byKey.get(input.key).push(input);
  }
  const out = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 2) continue;
    // Use the most recent run of similar amounts.
    const last = list.at(-1);
    const similar = list.filter(
      (item) =>
        Math.abs(item.amountMinor - last.amountMinor) <=
        last.amountMinor * tolerance,
    );
    if (similar.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < similar.length; i++)
      gaps.push(daysBetween(similar[i - 1].date, similar[i].date));
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const period = Object.keys(cadences).find(
      (name) => Math.abs(median - cadences[name][0]) <= cadences[name][1],
    );
    if (!period) continue;
    const [days, tol] = cadences[period];
    const need =
      period === 'yearly' || period === 'quarterly' ? longMinCount : minCount;
    if (similar.length < need) continue;
    // Most gaps must fit the cadence (not just the median).
    const fitting = gaps.filter(
      (gap) => Math.abs(gap - days) <= tol * 2,
    ).length;
    if (fitting < Math.ceil(gaps.length * 0.7)) continue;
    const lastDate = similar.at(-1).date;
    if (daysBetween(lastDate, now) > days * 1.5) continue;
    const amounts = similar
      .map((item) => item.amountMinor)
      .sort((a, b) => a - b);
    const amountMinor = amounts[Math.floor(amounts.length / 2)];
    const monthly = monthlyMinor(amountMinor, period);
    out.push({
      key,
      name: last.name,
      amountMinor,
      period,
      lastDate,
      nextDate: advance(lastDate, period),
      count: similar.length,
      monthlyMinor: monthly,
      yearlyMinor:
        amountMinor *
        { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[period],
    });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
