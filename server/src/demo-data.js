import { validate } from './workspaces.js';

/** Dates relative to today, so the demo always looks current. */
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};

/** Sample records for a fresh "Try the demo" account. Validated exactly like user input. */
export function demoRecords() {
  const month = day(0).slice(0, 7);
  return {
    notes: [
      { title: 'Plan the weekend trip to Jaipur', body: 'Book train tickets\nShortlist 2 hotels\nAsk Priya about dates', tag: 'Travel', pinned: true },
      { title: 'Pay electricity bill', kind: 'reminder', dueDate: day(2), tag: 'Bills' },
      { title: 'Call mom', kind: 'reminder', dueDate: day(0), tag: 'Family' },
      { title: 'Book ideas', body: 'Atomic Habits\nDeep Work\nThe Psychology of Money', tag: 'Personal' },
    ],
    workouts: [
      { title: 'Morning run', date: day(0), type: 'Cardio', duration: 30, exercises: '5 km easy pace', effort: 'Moderate' },
      { title: 'Upper body', date: day(-1), type: 'Strength', duration: 45, exercises: 'Bench press 3x8\nRows 3x10\nShoulder press 3x10', effort: 'Hard' },
      { title: 'Yoga', date: day(-3), type: 'Mobility', duration: 25, exercises: 'Sun salutations, hip openers', effort: 'Easy' },
      { title: 'Leg day', date: day(-4), type: 'Strength', duration: 50, exercises: 'Squats 4x6\nLunges 3x10\nCalf raises', effort: 'Hard' },
    ],
    routines: [
      { title: 'Drink 8 glasses of water', category: 'Water', time: 'Anytime', days: [0, 1, 2, 3, 4, 5, 6] },
      { title: 'Vitamin D', category: 'Medicine', time: 'Morning', days: [1, 3, 5] },
      { title: 'Night skin care', category: 'Skin care', time: 'Evening', days: [0, 1, 2, 3, 4, 5, 6] },
    ],
    expenses: [
      { title: 'Lunch with Rahul', date: day(-1), amountMinor: 45000, category: 'Food', payment: 'UPI' },
      { title: 'Metro card recharge', date: day(-2), amountMinor: 50000, category: 'Travel', payment: 'UPI' },
      { title: 'Groceries', date: day(-3), amountMinor: 128050, category: 'Food', payment: 'Card' },
      { title: 'Internet bill', date: day(-5), amountMinor: 79900, category: 'Bills', payment: 'UPI' },
      { title: 'Running shoes', date: day(-6), amountMinor: 349900, category: 'Shopping', payment: 'Card' },
      { title: 'Pharmacy', date: day(-8), amountMinor: 32000, category: 'Health', payment: 'Cash' },
    ],
    budgets: [{ month, limitMinor: 2500000 }],
  };
}

export async function seedDemo(store, userId) {
  const records = demoRecords();
  for (const [collection, rows] of Object.entries(records)) {
    for (const row of rows) await store.create(collection, userId, validate(collection, row));
  }
}
