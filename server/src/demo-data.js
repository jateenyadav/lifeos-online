import { validate } from './workspaces.js';
import { createMoneyService } from './money/service.js';

/** Dates relative to today, so the demo always looks current. */
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};

/** Sample records for a fresh "Try the demo" account. Validated exactly like user input. */
export function demoRecords() {
  return {
    notes: [
      {
        title: 'Plan the weekend trip to Jaipur',
        body: 'Book train tickets\nShortlist 2 hotels\nAsk Priya about dates',
        tag: 'Travel',
        pinned: true,
      },
      {
        title: 'Pay electricity bill',
        kind: 'reminder',
        dueDate: day(2),
        tag: 'Bills',
      },
      { title: 'Call mom', kind: 'reminder', dueDate: day(0), tag: 'Family' },
      {
        title: 'Book ideas',
        body: 'Atomic Habits\nDeep Work\nThe Psychology of Money',
        tag: 'Personal',
      },
    ],
    workouts: [
      {
        title: 'Morning run',
        date: day(0),
        type: 'Cardio',
        duration: 30,
        exercises: '5 km easy pace',
        effort: 'Moderate',
      },
      {
        title: 'Upper body',
        date: day(-1),
        type: 'Strength',
        duration: 45,
        exercises: 'Bench press 3x8\nRows 3x10\nShoulder press 3x10',
        effort: 'Hard',
      },
      {
        title: 'Yoga',
        date: day(-3),
        type: 'Mobility',
        duration: 25,
        exercises: 'Sun salutations, hip openers',
        effort: 'Easy',
      },
      {
        title: 'Leg day',
        date: day(-4),
        type: 'Strength',
        duration: 50,
        exercises: 'Squats 4x6\nLunges 3x10\nCalf raises',
        effort: 'Hard',
      },
    ],
    routines: [
      {
        title: 'Drink 8 glasses of water',
        category: 'Water',
        time: 'Anytime',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      {
        title: 'Vitamin D',
        category: 'Medicine',
        time: 'Morning',
        days: [1, 3, 5],
      },
      {
        title: 'Night skin care',
        category: 'Skin care',
        time: 'Evening',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
    ],
  };
}

/**
 * Money v2 sample data. It tells one story end to end: Rohan's add-on card. The old khata says I
 * owe Rohan ₹25,000 (opening balance); a ₹12,450 work flight paid on his add-on card adds "I owe
 * Rohan" by itself and waits as a reimbursement claim for the office to pay back.
 */
export async function seedMoneyDemo(money, userId, now = new Date()) {
  const service = createMoneyService({ store: money, now: () => now });
  const at = (offset) =>
    new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const account = async (values) =>
    (await service.createAccount(userId, values)).id;
  const bank = await account({
    name: 'HDFC Savings',
    type: 'savings',
    bank: 'HDFC Bank',
    last4: '4821',
    openingMinor: 6500000,
  });
  const card = await account({
    name: 'Axis Credit Card',
    type: 'credit_card',
    bank: 'Axis Bank',
    last4: '7712',
    creditLimitMinor: 15000000,
    statementDay: 5,
  });
  const addOn = await account({
    name: "Rohan's add-on card",
    type: 'credit_card',
    bank: 'HDFC Bank',
    last4: '9191',
    ownerName: 'Rohan',
  });
  await service.saveImport(userId, {
    today: at(-45),
    people: [
      {
        name: 'Rohan',
        tag: 'Pune',
        choice: 'totalOnly',
        plusTheyOwe: false,
        lines: [],
        statedMinor: 2500000,
      },
      {
        name: 'Dadaji',
        choice: 'lines',
        plusTheyOwe: false,
        lines: [
          { signedMinor: 6000000, note: 'kept with me', date: at(-200) },
          { signedMinor: -1500000, note: 'sent for the car', date: at(-120) },
        ],
      },
    ],
  });
  const add = async (values) =>
    (
      await service.addTxn(userId, {
        channel: 'UPI',
        accountId: bank,
        ...values,
      })
    ).txn;
  await add({
    date: at(-20),
    amountMinor: 8500000,
    direction: 'credit',
    title: 'Salary',
    category: 'Salary',
    channel: 'NetBanking',
  });
  for (const offset of [-90, -60, -30, 0])
    await add({
      date: at(offset),
      amountMinor: 64900,
      direction: 'debit',
      title: 'Netflix',
      category: 'Entertainment',
      channel: 'Card',
      accountId: card,
    });
  await add({
    date: at(-2),
    amountMinor: 128050,
    direction: 'debit',
    title: 'Big Basket',
    category: 'Groceries',
  });
  await add({
    date: at(-3),
    amountMinor: 50000,
    direction: 'debit',
    title: 'Metro card recharge',
    category: 'Travel',
  });
  await add({
    date: at(-5),
    amountMinor: 185000,
    direction: 'debit',
    title: 'Electricity bill',
    category: 'Bills',
  });
  await add({
    date: at(-6),
    amountMinor: 200000,
    direction: 'debit',
    title: 'Indian Oil',
    category: 'Fuel',
    channel: 'Card',
    accountId: card,
  });
  await add({
    date: at(-10),
    amountMinor: 349900,
    direction: 'debit',
    title: 'Running shoes',
    category: 'Shopping',
    channel: 'Card',
    accountId: card,
  });
  const dinner = await add({
    date: at(-1),
    amountMinor: 90000,
    direction: 'debit',
    title: 'Dinner with Rahul and Priya',
    category: 'Food',
  });
  await service.applyPeer(userId, dinner.id, {
    peerTag: 'split',
    splitPeople: 3,
    contactName: 'Rahul',
  });
  const lent = await add({
    date: at(-8),
    amountMinor: 150000,
    direction: 'debit',
    title: 'Rahul',
    counterparty: 'Rahul',
  });
  await service.applyPeer(userId, lent.id, {
    peerTag: 'lent',
    contactName: 'Rahul',
  });
  const later = await add({
    date: at(-7),
    amountMinor: 30000,
    direction: 'debit',
    title: 'Amit Sharma',
    counterparty: 'Amit Sharma',
  });
  await service.applyPeer(userId, later.id, { peerTag: 'left' });
  // Rohan's add-on card: the app writes "I owe Rohan" for each spend by itself.
  const flight = await add({
    date: at(-4),
    amountMinor: 1245000,
    direction: 'debit',
    title: 'IndiGo (work trip)',
    category: 'Travel',
    channel: 'Card',
    accountId: addOn,
  });
  await service.claim(userId, flight.id);
  await add({
    date: at(-1),
    amountMinor: 42000,
    direction: 'debit',
    title: 'Swiggy',
    category: 'Food',
    channel: 'Card',
    accountId: addOn,
  });
  // A phone capture the app was not sure about: waits in Review.
  await service.ingest(userId, [
    {
      sourceKey: `demo:${userId}:review`,
      source: 'sms',
      date: at(0),
      time: '09:15',
      amountMinor: 25000,
      direction: 'debit',
      title: 'UPI payment',
      channel: 'UPI',
      bank: 'HDFC Bank',
      last4: '4821',
      confidence: 0.5,
    },
  ]);
  const month = at(0).slice(0, 7);
  await service.putBudget(userId, {
    month,
    category: '*',
    limitMinor: 4000000,
  });
  await service.putBudget(userId, {
    month,
    category: 'Food',
    limitMinor: 600000,
  });
  await money.markMigrated(userId);
}

export async function seedDemo(store, userId, money) {
  const records = demoRecords();
  for (const [collection, rows] of Object.entries(records)) {
    for (const row of rows)
      await store.create(collection, userId, validate(collection, row));
  }
  if (money) await seedMoneyDemo(money, userId);
}
