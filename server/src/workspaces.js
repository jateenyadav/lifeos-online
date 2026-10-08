import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from './auth.js';
import { createMoneyRouter, moneyCollections } from './money.js';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.')
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Choose a valid date.');
const title = z
  .string()
  .trim()
  .min(1, 'Enter a title.')
  .max(120, 'Use at most 120 characters for the title.');
const money = z
  .number()
  .int()
  .min(1, 'Enter an amount greater than zero.')
  .max(9999999999);
export const workspaceSchemas = {
  notes: z
    .object({
      title,
      body: z.string().max(10000).default(''),
      kind: z.enum(['note', 'reminder']).default('note'),
      tag: z.string().trim().max(40).default('Personal'),
      dueDate: date.nullable().default(null),
      pinned: z.boolean().default(false),
      completed: z.boolean().default(false),
      archived: z.boolean().default(false),
    })
    .strict(),
  workouts: z
    .object({
      title,
      date,
      type: z.enum(['Strength', 'Cardio', 'Mobility', 'Other']),
      duration: z.number().int().min(1).max(1440),
      exercises: z.string().max(4000).default(''),
      effort: z.enum(['Easy', 'Moderate', 'Hard']).default('Moderate'),
    })
    .strict(),
  routines: z
    .object({
      title,
      category: z.enum(['Medicine', 'Skin care', 'Water', 'Other']),
      time: z.enum(['Morning', 'Afternoon', 'Evening', 'Anytime']),
      days: z
        .array(z.number().int().min(0).max(6))
        .min(1, 'Choose at least one day.')
        .max(7)
        .refine(
          (days) => new Set(days).size === days.length,
          'Choose each day only once.',
        ),
    })
    .strict(),
  expenses: z
    .object({
      title,
      date,
      amountMinor: money,
      category: z.enum([
        'Food',
        'Travel',
        'Shopping',
        'Bills',
        'Health',
        'Other',
      ]),
      payment: z
        .enum(['UPI', 'Card', 'Wallet', 'Cash', 'Other'])
        .default('UPI'),
      note: z.string().max(2000).default(''),
    })
    .strict(),
  budgets: z
    .object({
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a valid month.'),
      limitMinor: money,
    })
    .strict(),
};

function validate(collection, values) {
  const parsed = workspaceSchemas[collection].parse(values);
  if (collection === 'notes' && parsed.kind === 'reminder' && !parsed.dueDate)
    throw new ApiError(400, 'Choose a date for your reminder.');
  return parsed;
}

export function createWorkspaceRouter({ store, currentUser }) {
  const router = Router();
  router.use(async (request, _response, next) => {
    request.workspaceUser = (await currentUser(request)).user;
    if (!store)
      throw new ApiError(
        503,
        'Your workspaces are not available yet. Please restart the updated server.',
      );
    next();
  });
  router.get('/', async (request, response) => {
    const collections = [...Object.keys(workspaceSchemas), ...moneyCollections];
    const lists = await Promise.all(
      collections.map((collection) =>
        store.list(collection, request.workspaceUser.id),
      ),
    );
    response.json(
      Object.fromEntries(
        collections.map((collection, index) => [collection, lists[index]]),
      ),
    );
  });
  router.use('/money', createMoneyRouter({ store }));
  router.param('collection', (request, _response, next, collection) => {
    if (!Object.hasOwn(workspaceSchemas, collection))
      return next(new ApiError(404, 'Workspace not found.'));
    next();
  });
  router.param('id', (_request, _response, next, id) => {
    if (!/^[a-f\d]{24}$/i.test(id))
      return next(new ApiError(400, 'Invalid entry ID.'));
    next();
  });
  router.post('/routines/:id/check', async (request, response) => {
    const values = z
      .object({ date, completed: z.boolean() })
      .strict()
      .parse(request.body);
    const entry = await store.checkRoutine(
      request.workspaceUser.id,
      request.params.id,
      values.date,
      values.completed,
    );
    if (!entry) throw new ApiError(404, 'This routine was not found.');
    response.json({ entry });
  });
  router.post('/notification-expenses', async (request, response) => {
    const values = workspaceSchemas.expenses
      .extend({
        notificationKey: z.string().regex(/^[a-f\d]{64}$/),
        sourceApp: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z\d_.]+$/),
        currency: z.literal('INR'),
      })
      .parse(request.body);
    if (!store.importExpense)
      throw new ApiError(
        503,
        'Notification saving is not available. Restart the updated server.',
      );
    delete values.currency;
    response.json({
      entry: await store.importExpense(request.workspaceUser.id, values),
    });
  });
  router.post('/:collection', async (request, response) => {
    const collection = request.params.collection;
    const values = validate(collection, request.body);
    response.status(201).json({
      entry: await store.create(collection, request.workspaceUser.id, values),
    });
  });
  router.patch('/:collection/:id', async (request, response) => {
    const { collection, id } = request.params;
    const parsedPatch = workspaceSchemas[collection]
      .partial()
      .parse(request.body);
    const patch = Object.fromEntries(
      Object.keys(request.body).map((key) => [key, parsedPatch[key]]),
    );
    if (!Object.keys(patch).length)
      throw new ApiError(400, 'Choose something to update.');
    const previous = await store.find(collection, request.workspaceUser.id, id);
    if (!previous) throw new ApiError(404, 'This entry was not found.');
    const fields = Object.fromEntries(
      Object.keys(workspaceSchemas[collection].shape).map((key) => [
        key,
        previous[key],
      ]),
    );
    const values = validate(collection, { ...fields, ...patch });
    const updates = Object.fromEntries(
      Object.keys(patch).map((key) => [key, values[key]]),
    );
    const entry = await store.update(
      collection,
      request.workspaceUser.id,
      id,
      updates,
    );
    if (!entry) throw new ApiError(404, 'This entry was not found.');
    response.json({ entry });
  });
  router.delete('/:collection/:id', async (request, response) => {
    if (
      !(await store.remove(
        request.params.collection,
        request.workspaceUser.id,
        request.params.id,
      ))
    )
      throw new ApiError(404, 'This entry was not found.');
    response.status(204).end();
  });
  return router;
}
