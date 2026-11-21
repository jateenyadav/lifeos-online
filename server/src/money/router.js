/**
 * /api/money — Money v2 HTTP API (docs/MONEY.md §4). Validates input with zod and calls the
 * service. Every route needs the signed-in session; every id is checked to belong to the user.
 */
import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from '../auth.js';
import {
  accountTypes,
  captureSources,
  categories,
  channels,
  expenseCategories,
  sources,
  statuses,
} from './constants.js';
import { adjustmentTypes } from './khata.js';
import { peerTags } from './peer.js';
import { bulkChoices } from './bulk-import.js';
import { createMoneyService, txnOut } from './service.js';
import { createMigrator } from './migrate.js';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID.');
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.')
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Choose a valid date.');
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a valid month.');
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm for the time.');
const amount = z
  .number()
  .int('Amounts are whole paise.')
  .min(1, 'Enter an amount greater than zero.')
  .max(9999999999);
const signedAmount = z.number().int().min(-9999999999).max(9999999999);
const text = (max) => z.string().trim().max(max);
const title = z.string().trim().min(1, 'Enter a title.').max(120);
const name = z.string().trim().min(1, 'Enter a name.').max(80);
const last4 = z
  .string()
  .regex(/^\d{2,6}$/, 'Use only the last digits of the account.');
const flag = z
  .enum(['1', 'true', '0', 'false'])
  .transform((value) => value === '1' || value === 'true');

const txnFields = {
  date: day,
  time: time.nullable().optional(),
  amountMinor: amount,
  direction: z.enum(['debit', 'credit']),
  title,
  category: z.enum(categories).optional(),
  purpose: text(200).optional(),
  channel: z.enum(channels).optional(),
  accountId: id.nullable().optional(),
  note: text(2000).optional(),
  status: z.enum(statuses).optional(),
  counterparty: text(120).optional(),
};
const createTxnSchema = z
  .object({ ...txnFields, clientKey: z.string().min(8).max(80).optional() })
  .strict();
const patchTxnSchema = z
  .object({
    title: title.optional(),
    category: z.enum(categories).optional(),
    purpose: text(200).optional(),
    note: text(2000).optional(),
    date: day.optional(),
    time: time.nullable().optional(),
    amountMinor: amount.optional(),
    accountId: id.nullable().optional(),
    status: z.enum(statuses).optional(),
    channel: z.enum(channels).optional(),
    needsReview: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Choose something to change.',
  );
const ingestItem = z
  .object({
    sourceKey: z.string().min(8).max(200),
    source: z.enum(captureSources),
    date: day,
    time: time.nullable().optional(),
    amountMinor: amount,
    direction: z.enum(['debit', 'credit']),
    title: text(120).optional(),
    counterparty: text(120).optional(),
    counterpartyLast4: z.union([last4, z.literal('')]).optional(),
    channel: z.enum(channels).optional(),
    bank: text(60).optional(),
    last4: z.union([last4, z.literal('')]).optional(),
    utr: text(40).nullable().optional(),
    sourceApp: text(200).optional(),
    availableBalanceMinor: signedAmount.nullable().optional(),
    accountType: z.enum(accountTypes).optional(),
    status: z.enum(statuses).optional(),
    confidence: z.number().min(0).max(1).default(1),
  })
  .strict();
const ingestSchema = z
  .object({
    items: z
      .array(ingestItem)
      .min(1)
      .max(50, 'Send at most 50 items at a time.'),
  })
  .strict();
const listSchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    q: text(100).optional(),
    category: z.enum(categories).optional(),
    accountId: id.optional(),
    direction: z.enum(['debit', 'credit']).optional(),
    source: z.enum(sources).optional(),
    status: z.enum(statuses).optional(),
    review: flag.optional(),
    left: flag.optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    cursor: z.string().max(400).optional(),
  })
  .strict();
const peerSchema = z
  .object({
    peerTag: z.enum(peerTags).nullable(),
    contactName: name.optional(),
    contactId: id.optional(),
    splitPeople: z.number().int().min(2).max(6).optional(),
  })
  .strict();
const accountFields = {
  name,
  type: z.enum(accountTypes).optional(),
  bank: text(60).optional(),
  last4: z.union([last4, z.literal('')]).optional(),
  openingMinor: signedAmount.optional(),
  ownerName: text(80)
    .nullable()
    .optional()
    .transform((value) =>
      value ? value : value === undefined ? undefined : null,
    ),
  followBank: z.boolean().optional(),
  creditLimitMinor: z.number().int().min(0).max(9999999999).optional(),
  billMinor: z.number().int().min(0).max(9999999999).optional(),
  minDueMinor: z.number().int().min(0).max(9999999999).optional(),
  dueDate: day.nullable().optional(),
  statementDay: z.number().int().min(1).max(28).nullable().optional(),
  needsConfirm: z.boolean().optional(),
  archived: z.boolean().optional(),
};
const accountSchema = z.object(accountFields).strict();
const accountPatchSchema = z
  .object(accountFields)
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Choose something to change.',
  );
const contactSchema = z
  .object({ name, phone: text(30).optional(), note: text(500).optional() })
  .strict();
const contactPatchSchema = contactSchema
  .partial()
  .extend({ archived: z.boolean().optional() })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Choose something to change.',
  );
const entrySchema = z
  .object({
    direction: z.enum(['gave', 'got']),
    amountMinor: amount,
    date: day,
    note: text(300).optional(),
    dueDate: day.nullable().optional(),
    paidForMe: z.boolean().optional(),
    category: z.enum(expenseCategories).optional(),
  })
  .strict();
const entryPatchSchema = entrySchema
  .omit({ paidForMe: true })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Choose something to change.',
  );
const adjustmentSchema = z
  .object({
    type: z.enum(adjustmentTypes),
    amountMinor: amount,
    reduce: z.boolean().optional(),
    note: text(300).optional(),
  })
  .strict();
const importLine = z
  .object({
    signedMinor: signedAmount,
    note: text(300).default(''),
    date: day.nullable().default(null),
  })
  .strict();
const parseSchema = z
  .object({
    text: z.string().min(1, 'Paste your old khata notes first.').max(15000),
    mode: z.enum(['person', 'bulk']),
    today: day.optional(),
  })
  .strict();
const saveSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            name,
            tag: text(60).nullable().optional(),
            choice: z.enum(bulkChoices),
            plusTheyOwe: z.boolean().default(false),
            lines: z.array(importLine).max(500).default([]),
            statedMinor: signedAmount.nullable().optional(),
            // Sent back as-is from /khata/import/parse; ignored.
            linesMinor: signedAmount.optional(),
            fixMinor: signedAmount.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    photoIds: z.array(id).max(10).optional(),
    today: day.optional(),
  })
  .strict();
const photoSchema = z
  .object({
    ownerType: z.enum(['khata_contact', 'txn']),
    ownerId: id.nullable().optional(),
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z.string().min(8).max(2150000),
    caption: text(200).optional(),
  })
  .strict();
const budgetSchema = z
  .object({
    month,
    category: z.union([z.literal('*'), z.enum(expenseCategories)]),
    limitMinor: amount,
  })
  .strict();
const merchantPatchSchema = z
  .object({ title: title.optional(), category: z.enum(categories).optional() })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Choose something to change.',
  );
const claimIds = z.object({ claimIds: z.array(id).min(1).max(100) }).strict();
const empty = z.object({}).strict();
const body = (request) => request.body ?? {};

export function createMoneyApiRouter({ store, workspaces, currentUser, now }) {
  const router = Router();
  const service = store ? createMoneyService({ store, now }) : null;
  const ensureMigrated = store
    ? createMigrator({ store, workspaces, service })
    : null;
  const migrated = new Set();
  const user = (request) => request.moneyUser.id;
  const param = (request, key = 'id') => id.parse(request.params[key]);
  const txn = (row) => ({ txn: txnOut(row) });

  router.use(async (request, _response, next) => {
    request.moneyUser = (await currentUser(request)).user;
    if (!service)
      throw new ApiError(
        503,
        'Money is not available yet. Please restart the updated server.',
      );
    const userId = request.moneyUser.id;
    if (!migrated.has(userId)) {
      await ensureMigrated(userId);
      migrated.add(userId);
    }
    next();
  });

  // ---------- overview & transactions ----------
  router.get('/overview', async (request, response) => {
    const query = z
      .object({ month: month.optional() })
      .strict()
      .parse(request.query);
    response.json(await service.overview(user(request), query.month));
  });
  router.get('/txns', async (request, response) => {
    response.json(
      await service.listTxns(user(request), listSchema.parse(request.query)),
    );
  });
  router.post('/txns', async (request, response) => {
    const result = await service.addTxn(
      user(request),
      createTxnSchema.parse(body(request)),
    );
    response.status(result.created ? 201 : 200).json(txn(result.txn));
  });
  router.post('/txns/ingest', async (request, response) => {
    const { items } = ingestSchema.parse(body(request));
    const results = await service.ingest(user(request), items);
    response.json({ items: results });
  });
  router.patch('/txns/:id', async (request, response) => {
    response.json(
      txn(
        await service.patchTxn(
          user(request),
          param(request),
          patchTxnSchema.parse(body(request)),
        ),
      ),
    );
  });
  router.delete('/txns/:id', async (request, response) => {
    await service.deleteTxn(user(request), param(request));
    response.status(204).end();
  });
  router.post('/txns/:id/peer', async (request, response) => {
    response.json(
      txn(
        await service.applyPeer(
          user(request),
          param(request),
          peerSchema.parse(body(request)),
        ),
      ),
    );
  });
  router.post('/txns/:id/refund-of', async (request, response) => {
    const values = z
      .object({ originalId: id.nullable() })
      .strict()
      .parse(body(request));
    response.json(
      txn(
        await service.setRefundOf(
          user(request),
          param(request),
          values.originalId,
        ),
      ),
    );
  });
  router.post('/txns/:id/transfer', async (request, response) => {
    const values = z
      .union([
        z.object({ otherId: id }).strict(),
        z.object({ untracked: z.literal(true) }).strict(),
      ])
      .parse(body(request));
    if (values.untracked)
      return response.json(
        txn(await service.markUntracked(user(request), param(request))),
      );
    const [first, second] = await service.linkTransfer(
      user(request),
      param(request),
      values.otherId,
    );
    response.json({ txn: txnOut(first), other: txnOut(second) });
  });
  router.delete('/txns/:id/transfer', async (request, response) => {
    response.json(
      txn(await service.unlinkTransfer(user(request), param(request))),
    );
  });
  router.get('/transfers/suggestions', async (request, response) => {
    response.json({ items: await service.transferSuggestions(user(request)) });
  });
  router.post('/txns/:id/reimburse/claim', async (request, response) => {
    const values = z
      .object({ amountMinor: amount.optional() })
      .strict()
      .parse(body(request));
    response.json(
      txn(
        await service.claim(user(request), param(request), values.amountMinor),
      ),
    );
  });
  router.delete('/txns/:id/reimburse/claim', async (request, response) => {
    response.json(txn(await service.unclaim(user(request), param(request))));
  });
  router.post('/txns/:id/reimburse/preview', async (request, response) => {
    const values = claimIds.parse(body(request));
    const split = await service.previewReceived(
      user(request),
      param(request),
      values.claimIds,
    );
    response.json(split);
  });
  router.post('/txns/:id/reimburse/received', async (request, response) => {
    const values = claimIds.parse(body(request));
    const result = await service.markReceived(
      user(request),
      param(request),
      values.claimIds,
    );
    response.json({ ...result, txn: txnOut(result.txn) });
  });
  router.delete('/txns/:id/reimburse/received', async (request, response) => {
    response.json(
      txn(await service.unmarkReceived(user(request), param(request))),
    );
  });
  router.get('/reimbursements', async (request, response) => {
    response.json(await service.reimbursements(user(request)));
  });

  // ---------- accounts ----------
  router.get('/accounts', async (request, response) => {
    response.json({ items: await service.listAccounts(user(request)) });
  });
  router.post('/accounts', async (request, response) => {
    response.status(201).json({
      account: await service.createAccount(
        user(request),
        accountSchema.parse(body(request)),
      ),
    });
  });
  router.patch('/accounts/:id', async (request, response) => {
    response.json({
      account: await service.patchAccount(
        user(request),
        param(request),
        accountPatchSchema.parse(body(request)),
      ),
    });
  });
  router.delete('/accounts/:id', async (request, response) => {
    await service.deleteAccount(user(request), param(request));
    response.status(204).end();
  });
  router.post('/accounts/:id/match-bank', async (request, response) => {
    empty.parse(body(request));
    response.json({
      account: await service.matchBankBalance(user(request), param(request)),
    });
  });
  router.post('/accounts/:id/bill-paid', async (request, response) => {
    const values = z
      .object({ date: day.optional() })
      .strict()
      .parse(body(request));
    response.json({
      account: await service.billPaid(
        user(request),
        param(request),
        values.date,
      ),
    });
  });

  // ---------- khata ----------
  router.get('/khata', async (request, response) => {
    response.json(await service.khataOverview(user(request)));
  });
  router.post('/khata/contacts', async (request, response) => {
    response.status(201).json({
      contact: await service.createContact(
        user(request),
        contactSchema.parse(body(request)),
      ),
    });
  });
  router.get('/khata/contacts/:id', async (request, response) => {
    response.json(await service.contactDetail(user(request), param(request)));
  });
  router.patch('/khata/contacts/:id', async (request, response) => {
    response.json({
      contact: await service.patchContact(
        user(request),
        param(request),
        contactPatchSchema.parse(body(request)),
      ),
    });
  });
  router.delete('/khata/contacts/:id', async (request, response) => {
    await service.deleteContact(user(request), param(request));
    response.status(204).end();
  });
  router.post('/khata/contacts/:id/entries', async (request, response) => {
    response.status(201).json({
      entry: await service.addEntry(
        user(request),
        param(request),
        entrySchema.parse(body(request)),
      ),
    });
  });
  router.patch('/khata/entries/:id', async (request, response) => {
    response.json({
      entry: await service.patchEntry(
        user(request),
        param(request),
        entryPatchSchema.parse(body(request)),
      ),
    });
  });
  router.delete('/khata/entries/:id', async (request, response) => {
    await service.deleteEntry(user(request), param(request));
    response.status(204).end();
  });
  router.post('/khata/contacts/:id/adjustments', async (request, response) => {
    response.status(201).json({
      adjustment: await service.addAdjustment(
        user(request),
        param(request),
        adjustmentSchema.parse(body(request)),
      ),
    });
  });
  router.patch('/khata/adjustments/:id', async (request, response) => {
    const values = z
      .object({ active: z.boolean().optional(), note: text(300).optional() })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 0,
        'Choose something to change.',
      )
      .parse(body(request));
    response.json({
      adjustment: await service.patchAdjustment(
        user(request),
        param(request),
        values,
      ),
    });
  });
  router.delete('/khata/adjustments/:id', async (request, response) => {
    await service.deleteAdjustment(user(request), param(request));
    response.status(204).end();
  });
  router.post('/khata/contacts/:id/swap', async (request, response) => {
    empty.parse(body(request));
    const changed = await service.swapContact(user(request), param(request));
    response.json({
      changed,
      ...(await service.contactDetail(user(request), param(request))),
    });
  });
  router.post('/khata/import/parse', async (request, response) => {
    response.json(service.parseImport(parseSchema.parse(body(request))));
  });
  router.post('/khata/import/save', async (request, response) => {
    response
      .status(201)
      .json(
        await service.saveImport(
          user(request),
          saveSchema.parse(body(request)),
        ),
      );
  });

  // ---------- photos ----------
  router.post(
    '/photos',
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (request) => `photo:${request.moneyUser.id}`,
      message: {
        message: 'Too many photos at once. Wait a minute and try again.',
      },
    }),
    // The only route with a large body. It is read after the session check above.
    express.json({ limit: '2200kb' }),
    async (request, response) => {
      response
        .status(201)
        .json(
          await service.addPhoto(
            user(request),
            photoSchema.parse(body(request)),
          ),
        );
    },
  );
  router.get('/photos/:id', async (request, response) => {
    const photo = await service.getPhoto(user(request), param(request));
    response.set('Cache-Control', 'private, max-age=86400');
    response.set('Content-Type', photo.mime);
    response.set('X-Content-Type-Options', 'nosniff');
    // The web app on localhost:5173 (same site, other port) may show it in an <img>.
    response.set('Cross-Origin-Resource-Policy', 'same-site');
    response.send(Buffer.from(photo.data, 'base64'));
  });
  router.delete('/photos/:id', async (request, response) => {
    await service.deletePhoto(user(request), param(request));
    response.status(204).end();
  });

  // ---------- subscriptions, budgets, merchants, export ----------
  router.get('/subscriptions', async (request, response) => {
    response.json({ items: await service.subscriptions(user(request)) });
  });
  router.get('/budgets', async (request, response) => {
    const query = z
      .object({ month: month.optional() })
      .strict()
      .parse(request.query);
    response.json({
      items: await service.listBudgets(user(request), query.month),
    });
  });
  router.put('/budgets', async (request, response) => {
    response.json({
      budget: await service.putBudget(
        user(request),
        budgetSchema.parse(body(request)),
      ),
    });
  });
  router.delete('/budgets/:id', async (request, response) => {
    await service.deleteBudget(user(request), param(request));
    response.status(204).end();
  });
  router.get('/merchants', async (request, response) => {
    response.json({ items: await service.listMerchants(user(request)) });
  });
  router.patch('/merchants/:key', async (request, response) => {
    const key = z.string().trim().min(1).max(120).parse(request.params.key);
    response.json(
      await service.patchMerchant(
        user(request),
        key,
        merchantPatchSchema.parse(body(request)),
      ),
    );
  });
  router.get('/export.csv', async (request, response) => {
    const query = z
      .object({ from: day.optional(), to: day.optional() })
      .strict()
      .parse(request.query);
    const csv = await service.exportCsv(user(request), query);
    response.set('Content-Type', 'text/csv; charset=utf-8');
    response.set(
      'Content-Disposition',
      'attachment; filename="lifeos-money.csv"',
    );
    response.send(csv);
  });
  return router;
}
