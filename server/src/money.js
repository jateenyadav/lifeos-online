import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from './auth.js';

export const moneyCollections = ['payments', 'payees', 'trips', 'tripItems'];
const amount = z.number().int().min(1).max(9999999999);
const name = z.string().trim().min(1).max(80);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Choose a valid date.');
const id = z.string().regex(/^[a-f\d]{24}$/i);
export const paymentKinds = [
  'expense',
  'self_transfer',
  'lent',
  'borrowed',
  'repayment_received',
  'repayment_paid',
  'income',
];
const personalKinds = new Set([
  'lent',
  'borrowed',
  'repayment_received',
  'repayment_paid',
]);
const incomingKinds = new Set(['borrowed', 'repayment_received', 'income']);
export function normalizeRecipient(value) {
  const text = value.trim().toLowerCase();
  if (!text) return '';
  if (/^[a-z\d._-]{2,}@[a-z\d.-]{2,}$/.test(text)) return text;
  const phone = text.replace(/[\s()-]/g, '');
  if (/^\+?[\d]{10,15}$/.test(phone))
    return phone.startsWith('+') ? phone : `+${phone}`;
  throw new ApiError(
    400,
    'Enter a complete UPI ID or phone number, or leave it empty.',
  );
}
const fields = z
  .object({
    title: z.string().trim().min(1).max(120),
    date,
    amountMinor: amount,
    kind: z.enum(paymentKinds),
    person: z.string().trim().max(80).default(''),
    recipientKey: z.string().trim().max(120).default(''),
    category: z
      .enum(['Food', 'Travel', 'Shopping', 'Bills', 'Health', 'Other'])
      .default('Other'),
    payment: z.enum(['UPI', 'Card', 'Wallet', 'Cash', 'Other']).default('UPI'),
    note: z.string().max(2000).default(''),
    remember: z.boolean().default(false),
  })
  .strict();
function validatePayment(body) {
  const values = fields.parse(body);
  values.recipientKey = normalizeRecipient(values.recipientKey);
  if (personalKinds.has(values.kind) && !values.person)
    throw new ApiError(400, 'Choose who this payment is with.');
  if (values.remember && !values.recipientKey)
    throw new ApiError(
      400,
      'Enter a UPI ID or number before remembering details.',
    );
  return values;
}
export const tripSchema = z
  .object({
    title: name,
    members: z
      .array(name)
      .min(2)
      .max(30)
      .refine(
        (members) =>
          members.includes('Me') &&
          new Set(members.map((member) => member.toLowerCase())).size ===
            members.length,
        'Include Me and use different names for everyone.',
      ),
    budgetMinor: z.number().int().min(0).max(9999999999).default(0),
    startDate: date.nullable().default(null),
    endDate: date.nullable().default(null),
  })
  .strict()
  .refine(
    (trip) =>
      !trip.startDate || !trip.endDate || trip.endDate >= trip.startDate,
    'The end date must not be before the start date.',
  );
export const tripItemSchema = z
  .object({
    clientKey: z.string().min(8).max(80),
    tripId: id,
    title: name,
    date,
    amountMinor: amount,
    kind: z.enum(['expense', 'settlement']).default('expense'),
    payer: name,
    participants: z
      .array(name)
      .min(1)
      .max(30)
      .refine(
        (members) => new Set(members).size === members.length,
        'Choose each person once.',
      ),
  })
  .strict();

export function tripBalances(trip, items) {
  const balances = Object.fromEntries(
    trip.members.map((member) => [member, 0]),
  );
  for (const item of items.filter((entry) => entry.tripId === trip.id)) {
    balances[item.payer] += item.amountMinor;
    const share = Math.floor(item.amountMinor / item.participants.length);
    const remainder = item.amountMinor % item.participants.length;
    item.participants.forEach((member, index) => {
      balances[member] -= share + (index < remainder ? 1 : 0);
    });
  }
  return balances;
}
export function personBalances(payments) {
  const result = new Map();
  for (const payment of payments) {
    if (payment.status !== 'confirmed' || !personalKinds.has(payment.kind))
      continue;
    const key = payment.person.trim().toLowerCase();
    const row = result.get(key) ?? {
      person: payment.person,
      balanceMinor: 0,
      gaveMinor: 0,
      receivedMinor: 0,
    };
    result.set(key, row);
    const outgoing =
      payment.kind === 'lent' || payment.kind === 'repayment_paid';
    row[outgoing ? 'gaveMinor' : 'receivedMinor'] += payment.amountMinor;
    row.balanceMinor += outgoing ? payment.amountMinor : -payment.amountMinor;
  }
  return [...result.values()];
}

export function createMoneyRouter({ store }) {
  const router = Router();
  const owner = (request) => request.workspaceUser.id;
  const exposed = (entry) => {
    const result = { ...entry };
    delete result.notificationKey;
    return result;
  };
  async function materialize(userId, entry) {
    if (entry.kind === 'expense') {
      await store.importExpense(userId, {
        title: entry.title,
        date: entry.date,
        amountMinor: entry.amountMinor,
        category: entry.category,
        payment: entry.payment,
        note: entry.note,
        notificationKey: entry.notificationKey,
        sourceApp: entry.sourceApp,
        source: 'payment',
      });
    }
    if (entry.remember && entry.recipientKey) {
      await store.rememberPayee(userId, {
        recipientKey: entry.recipientKey,
        title: entry.title,
        person: entry.person,
        category: entry.category,
        kind: entry.kind,
      });
    }
  }
  async function confirm(userId, paymentId, values) {
    const existing = await store.find('payments', userId, paymentId);
    if (!existing) throw new ApiError(404, 'Payment not found.');
    const direction = incomingKinds.has(values.kind) ? 'incoming' : 'outgoing';
    if (values.kind !== 'self_transfer' && existing.direction !== direction)
      throw new ApiError(
        400,
        'Choose a payment type that matches money coming in or going out.',
      );
    const entry = await store.confirmPayment(userId, paymentId, values);
    if (!entry)
      throw new ApiError(
        409,
        'This payment was already reviewed. Refresh to see its saved details.',
      );
    await materialize(userId, entry);
    return entry;
  }
  router.post('/notifications', async (request, response) => {
    const values = fields
      .omit({ kind: true, person: true, remember: true })
      .extend({
        currency: z.literal('INR'),
        notificationKey: z.string().regex(/^[a-f\d]{64}$/),
        sourceApp: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z\d_.]+$/),
        direction: z.enum(['incoming', 'outgoing']).default('outgoing'),
      })
      .parse(request.body);
    values.recipientKey = normalizeRecipient(values.recipientKey);
    delete values.currency;
    const profile = values.recipientKey
      ? await store.findPayee(owner(request), values.recipientKey)
      : null;
    const directionMatches =
      profile &&
      (profile.kind === 'self_transfer' ||
        (incomingKinds.has(profile.kind) ? 'incoming' : 'outgoing') ===
          values.direction);
    const entry = await store.capturePayment(owner(request), {
      ...values,
      status: 'pending',
      kind: values.direction === 'incoming' ? 'income' : 'expense',
      person: '',
      remember: false,
      ...(directionMatches
        ? {
            title: profile.title,
            category: profile.category,
            kind: profile.kind,
            person: profile.person,
            suggested: true,
          }
        : {}),
    });
    response.json({ entry });
  });
  router.post('/payments', async (request, response) => {
    const { clientKey, ...body } = fields
      .extend({ clientKey: z.string().min(8).max(80) })
      .parse(request.body);
    const values = validatePayment(body);
    const notificationKey = createHash('sha256')
      .update(`manual:${clientKey}`)
      .digest('hex');
    const candidate = await store.capturePayment(owner(request), {
      ...values,
      notificationKey,
      sourceApp: 'manual',
      status: 'pending',
      direction: incomingKinds.has(values.kind) ? 'incoming' : 'outgoing',
    });
    response.json({
      entry: exposed(await confirm(owner(request), candidate.id, values)),
    });
  });
  router.post('/payments/:id/confirm', async (request, response) => {
    response.json({
      entry: exposed(
        await confirm(
          owner(request),
          id.parse(request.params.id),
          validatePayment(request.body),
        ),
      ),
    });
  });
  router.post('/payments/:id/dismiss', async (request, response) => {
    z.object({}).strict().parse(request.body);
    const entry = await store.dismissPayment(
      owner(request),
      id.parse(request.params.id),
    );
    if (!entry) throw new ApiError(409, 'Payment not found or already saved.');
    response.json({ entry });
  });
  router.post('/trips', async (request, response) => {
    response.status(201).json({
      entry: await store.create(
        'trips',
        owner(request),
        tripSchema.parse(request.body),
      ),
    });
  });
  router.post('/trip-items', async (request, response) => {
    const values = tripItemSchema.parse(request.body);
    const trip = await store.find('trips', owner(request), values.tripId);
    if (!trip) throw new ApiError(404, 'Trip not found.');
    if (
      ![values.payer, ...values.participants].every((member) =>
        trip.members.includes(member),
      )
    )
      throw new ApiError(400, 'Choose people who belong to this trip.');
    if (
      values.kind === 'settlement' &&
      (values.participants.length !== 1 ||
        values.participants[0] === values.payer)
    )
      throw new ApiError(
        400,
        'Choose one different person receiving the repayment.',
      );
    const entry = await store.createTripItem(owner(request), values);
    if (
      Object.entries(values).some(
        ([key, value]) => JSON.stringify(entry[key]) !== JSON.stringify(value),
      )
    )
      throw new ApiError(
        409,
        'This save was already used for a different trip entry. Open a new entry instead.',
      );
    response.json({ entry });
  });
  router.get('/summary', async (request, response) => {
    const [payments, trips, items] = await Promise.all(
      ['payments', 'trips', 'tripItems'].map((collection) =>
        store.list(collection, owner(request)),
      ),
    );
    response.json({
      people: personBalances(payments),
      trips: trips.map((trip) => ({
        ...trip,
        balances: tripBalances(trip, items),
      })),
    });
  });
  return router;
}
