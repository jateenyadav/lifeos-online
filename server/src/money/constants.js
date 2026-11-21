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
export const categories = [...expenseCategories, ...incomeCategories];
export const accountTypes = [
  'savings',
  'current',
  'salary',
  'credit_card',
  'cash',
  'wallet',
  'other',
];
export const channels = [
  'UPI',
  'Card',
  'NetBanking',
  'Wallet',
  'Cash',
  'Other',
];
export const statuses = ['cleared', 'pending', 'failed'];
export const sources = [
  'manual',
  'sms',
  'notification',
  'screenshot',
  'khata',
  'import',
  'legacy',
];
export const captureSources = ['sms', 'notification', 'screenshot'];
export const defaultCategory = (direction) =>
  direction === 'credit' ? 'Other income' : 'Other';
