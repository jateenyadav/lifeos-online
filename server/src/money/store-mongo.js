/**
 * Mongoose models for Money v2 (docs/MONEY.md §2) and the Mongo store used by the API.
 * The store contract is shared with memory-store.js (the tests use that one).
 */
import mongoose from 'mongoose';
import { User } from '../models.js';

const { Schema } = mongoose;
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true };
const owned = (fields, options = {}) =>
  new Schema({ userId: owner, ...fields }, { timestamps: true, ...options });
const ref = { type: String, default: null };

const accountSchema = owned({
  name: { type: String, required: true },
  type: { type: String, default: 'savings' },
  bank: { type: String, default: '' },
  last4: { type: String, default: '' },
  openingMinor: { type: Number, default: 0 },
  ownerName: { type: String, default: null },
  followBank: { type: Boolean, default: true },
  bankBalanceMinor: { type: Number, default: null },
  bankBalanceAt: { type: Date, default: null },
  creditLimitMinor: { type: Number, default: 0 },
  billMinor: { type: Number, default: 0 },
  minDueMinor: { type: Number, default: 0 },
  dueDate: { type: String, default: null },
  statementDay: { type: Number, default: null },
  billPaidAt: { type: String, default: null },
  needsConfirm: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
});
accountSchema.index({ userId: 1, last4: 1 });

const txnSchema = owned({
  date: { type: String, required: true },
  time: { type: String, default: null },
  amountMinor: { type: Number, required: true },
  direction: { type: String, required: true },
  title: { type: String, default: '' },
  category: { type: String, default: 'Other' },
  purpose: { type: String, default: '' },
  channel: { type: String, default: 'Other' },
  accountId: ref,
  note: { type: String, default: '' },
  status: { type: String, default: 'cleared' },
  needsReview: { type: Boolean, default: false },
  source: { type: String, default: 'manual' },
  sources: { type: [String], default: [] },
  sourceKey: { type: String, default: undefined },
  sourceKeys: { type: [String], default: [] },
  utr: ref,
  sourceApp: { type: String, default: '' },
  bank: { type: String, default: '' },
  last4: { type: String, default: '' },
  counterparty: { type: String, default: '' },
  counterpartyLast4: { type: String, default: '' },
  merchantKey: { type: String, default: '' },
  isPerson: { type: Boolean, default: false },
  confidence: { type: Number, default: null },
  peerTag: ref,
  peerShareMinor: { type: Number, default: 0 },
  splitPeople: { type: Number, default: null },
  contactId: ref,
  isTransfer: { type: Boolean, default: false },
  transferId: ref,
  refundOfId: ref,
  possibleDuplicateOf: ref,
  reimburseTag: ref,
  reimburseMinor: { type: Number, default: 0 },
  reimbursedById: ref,
  deleted: { type: Boolean, default: false },
});
txnSchema.index({ userId: 1, date: -1 });
txnSchema.index(
  { userId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } },
);
txnSchema.index({ userId: 1, utr: 1 });
txnSchema.index({ userId: 1, sourceKeys: 1 });
txnSchema.index({ userId: 1, amountMinor: 1 });

const contactSchema = owned({
  name: { type: String, required: true },
  key: { type: String, required: true },
  phone: { type: String, default: '' },
  note: { type: String, default: '' },
  archived: { type: Boolean, default: false },
});
contactSchema.index({ userId: 1, key: 1 }, { unique: true });

const entrySchema = owned({
  contactId: { type: String, required: true },
  direction: { type: String, required: true },
  amountMinor: { type: Number, required: true },
  date: { type: String, required: true },
  note: { type: String, default: '' },
  dueDate: { type: String, default: null },
  isOpening: { type: Boolean, default: false },
  linkedTxnId: ref,
  paidForMe: { type: Boolean, default: false },
});
entrySchema.index({ userId: 1, contactId: 1 });
entrySchema.index({ userId: 1, linkedTxnId: 1 });

const adjustmentSchema = owned({
  contactId: { type: String, required: true },
  type: { type: String, required: true },
  deltaMinor: { type: Number, required: true },
  note: { type: String, default: '' },
  active: { type: Boolean, default: true },
});
adjustmentSchema.index({ userId: 1, contactId: 1 });

const photoSchema = owned({
  ownerType: { type: String, required: true },
  ownerId: ref,
  mime: { type: String, required: true },
  data: { type: String, required: true },
  caption: { type: String, default: '' },
});
photoSchema.index({ userId: 1, ownerType: 1, ownerId: 1 });

const budgetSchema = owned({
  month: { type: String, required: true },
  category: { type: String, required: true },
  limitMinor: { type: Number, required: true },
});
budgetSchema.index({ userId: 1, month: 1, category: 1 }, { unique: true });

const merchantSchema = owned({
  key: { type: String, required: true },
  title: { type: String, default: '' },
  category: { type: String, default: null },
  isPerson: { type: Boolean, default: false },
});
merchantSchema.index({ userId: 1, key: 1 }, { unique: true });

// Who changed what, for money moved by the app itself. Never message bodies.
const auditSchema = owned({
  entity: String,
  entityId: String,
  action: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
});
auditSchema.index({ userId: 1, entity: 1, entityId: 1 });

export const moneyModels = {
  accounts: mongoose.model('MoneyAccount', accountSchema),
  txns: mongoose.model('MoneyTxn', txnSchema),
  contacts: mongoose.model('KhataContact', contactSchema),
  entries: mongoose.model('KhataEntry', entrySchema),
  adjustments: mongoose.model('KhataAdjustment', adjustmentSchema),
  photos: mongoose.model('MoneyPhoto', photoSchema),
  budgets: mongoose.model('MoneyBudget', budgetSchema),
  merchants: mongoose.model('MerchantMemory', merchantSchema),
  audit: mongoose.model('MoneyAudit', auditSchema),
};

const publicRow = (row) => {
  if (!row) return null;
  const values = { ...row, id: String(row._id) };
  delete values._id;
  delete values.userId;
  delete values.__v;
  return values;
};
const query = (filter = {}) => {
  const result = { ...filter };
  if ('id' in result) {
    result._id = result.id;
    delete result.id;
  }
  return result;
};
const defined = (values) =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );

export const mongoMoney = {
  async list(collection, userId, filter = {}, { exclude } = {}) {
    let request = moneyModels[collection].find({ ...query(filter), userId });
    if (exclude?.length)
      request = request.select(exclude.map((field) => `-${field}`).join(' '));
    return (await request.lean()).map(publicRow);
  },
  async find(collection, userId, id) {
    return publicRow(
      await moneyModels[collection].findOne({ _id: id, userId }).lean(),
    );
  },
  async findOne(collection, userId, filter) {
    return publicRow(
      await moneyModels[collection]
        .findOne({ ...query(filter), userId })
        .lean(),
    );
  },
  async count(collection, userId, filter = {}) {
    return moneyModels[collection].countDocuments({ ...query(filter), userId });
  },
  async create(collection, userId, values) {
    return publicRow(
      (
        await moneyModels[collection].create({ ...defined(values), userId })
      ).toObject(),
    );
  },
  async update(collection, userId, id, patch) {
    return publicRow(
      await moneyModels[collection]
        .findOneAndUpdate(
          { _id: id, userId },
          { $set: defined(patch) },
          { returnDocument: 'after', runValidators: true },
        )
        .lean(),
    );
  },
  async updateMany(collection, userId, filter, patch) {
    const result = await moneyModels[collection].updateMany(
      { ...query(filter), userId },
      { $set: defined(patch) },
    );
    return result.modifiedCount;
  },
  async remove(collection, userId, id) {
    return (
      (await moneyModels[collection].deleteOne({ _id: id, userId }))
        .deletedCount > 0
    );
  },
  async removeMany(collection, userId, filter) {
    return (
      await moneyModels[collection].deleteMany({ ...query(filter), userId })
    ).deletedCount;
  },
  async migratedAt(userId) {
    return (
      (await User.findById(userId, { moneyMigratedAt: 1 }).lean())
        ?.moneyMigratedAt ?? null
    );
  },
  async markMigrated(userId) {
    await User.updateOne(
      { _id: userId },
      { $set: { moneyMigratedAt: new Date() } },
    );
  },
};
