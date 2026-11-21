/** Money is integer paise everywhere. Rupees appear only on screen. */

/** "118640" → "1,18,640" (Indian digit groups). */
export function groupIndian(digits) {
  const text = String(digits);
  if (text.length <= 3) return text;
  const last = text.slice(-3);
  const rest = text.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last}`;
}

/**
 * Formats paise as rupees: 11864000 → "₹1,18,640"; 118640 → "₹1,186.40".
 * Paise are shown only when they are not zero (or always with { paise: true }).
 * sign: true adds + / − ; negative numbers always get "−".
 */
export function inr(
  minor,
  { sign = false, paise = 'auto', symbol = true } = {},
) {
  const value = Math.round(Number(minor) || 0);
  const abs = Math.abs(value);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  const showPaise = paise === true || (paise === 'auto' && rest !== 0);
  const body = `${symbol ? '₹' : ''}${groupIndian(rupees)}${showPaise ? `.${String(rest).padStart(2, '0')}` : ''}`;
  if (value < 0) return `−${body}`;
  if (sign && value > 0) return `+${body}`;
  return body;
}

/** Short form for chart axes: ₹1.2L, ₹45K, ₹900. */
export function inrShort(minor) {
  const rupees = Math.abs(Math.round(minor / 100));
  const sign = minor < 0 ? '−' : '';
  if (rupees >= 1e7) return `${sign}₹${trim(rupees / 1e7)}Cr`;
  if (rupees >= 1e5) return `${sign}₹${trim(rupees / 1e5)}L`;
  if (rupees >= 1e3) return `${sign}₹${trim(rupees / 1e3)}K`;
  return `${sign}₹${rupees}`;
}
const trim = (number) =>
  (number >= 10 ? Math.round(number) : Math.round(number * 10) / 10).toString();

/**
 * Reads what a person typed: "1,186.40", "₹ 1186.4", "1,18,640" → paise.
 * Returns null when it is not a valid amount. allowZero lets 0 through (opening balances, budgets).
 */
export function parseRupees(
  text,
  { allowZero = false, allowNegative = false } = {},
) {
  let value = String(text ?? '')
    .replace(/[₹,\s]/g, '')
    .replace(/^rs\.?/i, '')
    .replace(/[−–]/g, '-');
  let negative = false;
  if (value.startsWith('-')) {
    if (!allowNegative) return null;
    negative = true;
    value = value.slice(1);
  }
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value) && !/^\.\d{1,2}$/.test(value))
    return null;
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole || 0) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > 99999999999) return null;
  if (minor === 0 && !allowZero) return null;
  return negative ? -minor : minor;
}

/** Paise → text for an input box: 118640 → "1186.40", 50000 → "500". */
export const toInput = (minor) =>
  minor == null
    ? ''
    : minor % 100 === 0
      ? String(minor / 100)
      : (minor / 100).toFixed(2);

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
export const shiftMonth = (month, delta) => {
  const [year, number] = month.split('-').map(Number);
  return monthKey(new Date(year, number - 1 + delta, 1));
};
export const monthLabel = (month, style = 'long') =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', {
    month: style,
    year: 'numeric',
  });
export const shortMonth = (month) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', {
    month: 'short',
  });
export const dayLabel = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
export const longDay = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
export const lastDay = (month) => {
  const [year, number] = month.split('-').map(Number);
  return `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`;
};

export const expenseCategories = [
  'Food',
  'Groceries',
  'Travel',
  'Fuel',
  'Shopping',
  'Bills',
  'Rent',
  'Health',
  'Entertainment',
  'Education',
  'Investments',
  'Other',
];
export const incomeCategories = [
  'Salary',
  'Refund',
  'Interest',
  'Gift',
  'Other income',
];
export const allCategories = [...expenseCategories, ...incomeCategories];
export const purposes = [
  'Flight',
  'Train',
  'Cab',
  'Food',
  'Groceries',
  'Rent',
  'Fuel',
  'Bills',
  'Gift',
  'Medicine',
  'Shopping',
  'Fees',
  'Trip',
  'Other',
];
export const channels = [
  'UPI',
  'Card',
  'NetBanking',
  'Wallet',
  'Cash',
  'Other',
];
export const sources = [
  'manual',
  'sms',
  'notification',
  'screenshot',
  'khata',
  'import',
  'legacy',
];
export const sourceLabels = {
  manual: 'Added by hand',
  sms: 'Bank SMS',
  notification: 'Notification',
  screenshot: 'Screenshot',
  khata: 'Khata',
  import: 'Import',
  legacy: 'Old tracker',
};
export const accountTypes = {
  savings: 'Savings',
  current: 'Current',
  salary: 'Salary',
  credit_card: 'Credit card',
  cash: 'Cash',
  wallet: 'Wallet',
  other: 'Other',
};

/** Categorical chart palette, in order (docs/DESIGN.md). */
export const chartPalette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
  'var(--chart-9)',
];
/** Stable colour per category, so Food is the same colour on every chart. */
export const categoryColor = (category) => {
  const index = allCategories.indexOf(category);
  return chartPalette[
    (index < 0 ? allCategories.length : index) % chartPalette.length
  ];
};
