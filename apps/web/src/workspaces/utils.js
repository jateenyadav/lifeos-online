export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const asDate = (date) => new Date(`${date}T12:00:00`);
export const dayBefore = (date) => {
  const result = asDate(date);
  result.setDate(result.getDate() - 1);
  return dateKey(result);
};
export function recentDays(count = 7, today = dateKey()) {
  const days = [today];
  while (days.length < count) days.unshift(dayBefore(days[0]));
  return days;
}
export const displayDate = (date) =>
  asDate(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const dueOn = (routine, date) =>
  routine.days.includes(asDate(date).getDay());
export function streak(routine, today = dateKey()) {
  let date = today;
  if (dueOn(routine, date) && !routine.completedDates.includes(date))
    date = dayBefore(date);
  let total = 0;
  for (let offset = 0; offset < 366; offset++) {
    if (dueOn(routine, date)) {
      if (!routine.completedDates.includes(date)) break;
      total++;
    }
    date = dayBefore(date);
  }
  return total;
}
export const money = (minor) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(minor / 100);
export function parseMoney(value) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value).trim())) return null;
  const [whole, fraction = ''] = String(value).trim().split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return result > 0 && result <= 9999999999 ? result : null;
}
export const expenseCategories = [
  'Food',
  'Travel',
  'Shopping',
  'Bills',
  'Health',
  'Other',
];
export const workoutTypes = ['Strength', 'Cardio', 'Mobility', 'Other'];
export const routineCategories = ['Medicine', 'Skin care', 'Water', 'Other'];
export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function expenseCsv(expenses) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    ['Date', 'Title', 'Category', 'Amount (INR)', 'Payment', 'Note'],
    ...expenses.map((entry) => [
      entry.date,
      entry.title,
      entry.category,
      (entry.amountMinor / 100).toFixed(2),
      entry.payment,
      entry.note,
    ]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}
