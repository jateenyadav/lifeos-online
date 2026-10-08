import { expect, test } from 'vitest';
import {
  dateKey,
  dueOn,
  expenseCsv,
  parseMoney,
  recentDays,
  streak,
} from '../workspaces/utils.js';

test('currency parsing stores exact paise and rejects extra precision', () => {
  expect(parseMoney('0.10')).toBe(10);
  expect(parseMoney('125.05')).toBe(12505);
  expect(parseMoney(' 100 ')).toBe(10000);
  for (const invalid of ['0', '-2', '1.001', '1e3', '', 'hello', '100000000'])
    expect(parseMoney(invalid)).toBeNull();
});
test('dates and streaks respect scheduled days and incomplete today', () => {
  expect(dateKey(new Date(2026, 9, 7))).toBe('2026-10-07');
  expect(recentDays(3, '2026-03-01')).toEqual([
    '2026-02-27',
    '2026-02-28',
    '2026-03-01',
  ]);
  const routine = {
    days: [1, 3, 5],
    completedDates: ['2026-10-02', '2026-10-05'],
  };
  expect(dueOn(routine, '2026-10-06')).toBe(false);
  expect(streak(routine, '2026-10-07')).toBe(2);
  expect(
    streak({ ...routine, completedDates: ['2026-10-05'] }, '2026-10-07'),
  ).toBe(1);
});
test('CSV escapes quotes, newlines, and spreadsheet formulas', () => {
  const csv = expenseCsv([
    {
      title: '=SUM(1,2)',
      date: '2026-10-07',
      category: 'Food',
      amountMinor: 12505,
      payment: 'UPI',
      note: 'A "quote"\nand a line',
    },
  ]);
  expect(csv).toContain('"\'=SUM(1,2)"');
  expect(csv).toContain('"125.05"');
  expect(csv).toContain('"A ""quote""\nand a line"');
});
