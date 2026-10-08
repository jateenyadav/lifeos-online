import mongoose from 'mongoose';

const owner = {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true,
};
const ownedSchema = (fields) => {
  const schema = new mongoose.Schema(
    { userId: owner, ...fields },
    { timestamps: true },
  );
  schema.index({ userId: 1, updatedAt: -1 });
  return schema;
};

export const Note = mongoose.model(
  'Note',
  ownedSchema({
    title: String,
    body: String,
    kind: String,
    tag: String,
    dueDate: String,
    pinned: Boolean,
    completed: Boolean,
    archived: Boolean,
  }),
);
export const Workout = mongoose.model(
  'Workout',
  ownedSchema({
    title: String,
    date: String,
    type: String,
    duration: Number,
    exercises: String,
    effort: String,
  }),
);
export const Routine = mongoose.model(
  'Routine',
  ownedSchema({
    title: String,
    category: String,
    time: String,
    days: [Number],
    completedDates: [String],
  }),
);
const expenseSchema = ownedSchema({
  title: String,
  date: String,
  amountMinor: Number,
  category: String,
  payment: String,
  note: String,
  source: String,
  sourceApp: String,
  notificationKey: String,
  deleted: Boolean,
});
expenseSchema.index(
  { userId: 1, notificationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { notificationKey: { $type: 'string' } },
  },
);
export const Expense = mongoose.model('Expense', expenseSchema);
const budgetSchema = ownedSchema({ month: String, limitMinor: Number });
budgetSchema.index({ userId: 1, month: 1 }, { unique: true });
export const Budget = mongoose.model('Budget', budgetSchema);
const paymentSchema = ownedSchema({
  title: String,
  date: String,
  amountMinor: Number,
  category: String,
  payment: String,
  note: String,
  status: String,
  kind: String,
  person: String,
  recipientKey: String,
  direction: String,
  sourceApp: String,
  notificationKey: String,
  remember: Boolean,
  suggested: Boolean,
});
paymentSchema.index({ userId: 1, notificationKey: 1 }, { unique: true });
export const Payment = mongoose.model('Payment', paymentSchema);
const payeeSchema = ownedSchema({
  recipientKey: String,
  title: String,
  person: String,
  category: String,
  kind: String,
});
payeeSchema.index({ userId: 1, recipientKey: 1 }, { unique: true });
export const Payee = mongoose.model('Payee', payeeSchema);
export const Trip = mongoose.model(
  'Trip',
  ownedSchema({
    title: String,
    members: [String],
    budgetMinor: Number,
    startDate: String,
    endDate: String,
  }),
);
const tripItemSchema = ownedSchema({
  tripId: String,
  clientKey: String,
  title: String,
  date: String,
  amountMinor: Number,
  kind: String,
  payer: String,
  participants: [String],
});
tripItemSchema.index({ userId: 1, clientKey: 1 }, { unique: true });
export const TripItem = mongoose.model('TripItem', tripItemSchema);
export const workspaceModels = {
  notes: Note,
  workouts: Workout,
  routines: Routine,
  expenses: Expense,
  budgets: Budget,
  payments: Payment,
  payees: Payee,
  trips: Trip,
  tripItems: TripItem,
};

const publicEntry = (entry) => {
  if (!entry || entry.deleted) return null;
  const values = { ...entry };
  delete values._id;
  delete values.userId;
  delete values.__v;
  delete values.notificationKey;
  delete values.deleted;
  return { ...values, id: String(entry._id) };
};

export const mongoWorkspaces = {
  async listForAi(collection, userId, limit) {
    return (
      await workspaceModels[collection]
        .find({ userId, deleted: { $ne: true } })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit)
        .lean()
    ).map(publicEntry);
  },
  async list(collection, userId) {
    return (
      await workspaceModels[collection]
        .find({ userId, deleted: { $ne: true } })
        .sort({ updatedAt: -1 })
        .lean()
    ).map(publicEntry);
  },
  async find(collection, userId, id) {
    return publicEntry(
      await workspaceModels[collection]
        .findOne({ _id: id, userId, deleted: { $ne: true } })
        .lean(),
    );
  },
  async create(collection, userId, values) {
    if (collection === 'budgets') {
      return publicEntry(
        await Budget.findOneAndUpdate(
          { userId, month: values.month },
          { $set: values },
          { upsert: true, returnDocument: 'after', runValidators: true },
        ).lean(),
      );
    }
    return publicEntry(
      (
        await workspaceModels[collection].create({ ...values, userId })
      ).toObject(),
    );
  },
  async update(collection, userId, id, values) {
    return publicEntry(
      await workspaceModels[collection]
        .findOneAndUpdate(
          { _id: id, userId, deleted: { $ne: true } },
          { $set: values },
          { returnDocument: 'after', runValidators: true },
        )
        .lean(),
    );
  },
  async checkRoutine(userId, id, date, completed) {
    return publicEntry(
      await Routine.findOneAndUpdate(
        { _id: id, userId },
        completed
          ? { $addToSet: { completedDates: date } }
          : { $pull: { completedDates: date } },
        { returnDocument: 'after' },
      ).lean(),
    );
  },
  async remove(collection, userId, id) {
    if (collection === 'expenses') {
      const hidden = await Expense.updateOne(
        {
          _id: id,
          userId,
          source: { $in: ['notification', 'payment'] },
          deleted: { $ne: true },
        },
        { $set: { deleted: true } },
      );
      if (hidden.modifiedCount) return true;
    }
    return (
      (
        await workspaceModels[collection].deleteOne({
          _id: id,
          userId,
          source: { $nin: ['notification', 'payment'] },
        })
      ).deletedCount > 0
    );
  },
  async importExpense(userId, values) {
    const filter = { userId, notificationKey: values.notificationKey };
    try {
      return publicEntry(
        await Expense.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...values,
              userId,
              source: values.source ?? 'notification',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            timestamps: false,
          },
        ).lean(),
      );
    } catch (failure) {
      if (failure.code !== 11000) throw failure;
      return publicEntry(await Expense.findOne(filter).lean());
    }
  },
  async capturePayment(userId, values) {
    const filter = { userId, notificationKey: values.notificationKey };
    try {
      return publicEntry(
        await Payment.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...values,
              userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true, returnDocument: 'after', timestamps: false },
        ).lean(),
      );
    } catch (failure) {
      if (failure.code !== 11000) throw failure;
      return publicEntry(await Payment.findOne(filter).lean());
    }
  },
  async confirmPayment(userId, id, values) {
    const updated = await Payment.findOneAndUpdate(
      { _id: id, userId, status: 'pending' },
      { $set: { ...values, status: 'confirmed' } },
      { returnDocument: 'after' },
    ).lean();
    if (updated)
      return {
        ...publicEntry(updated),
        notificationKey: updated.notificationKey,
      };
    const previous = await Payment.findOne({
      _id: id,
      userId,
      status: 'confirmed',
    }).lean();
    if (
      !previous ||
      Object.entries(values).some(([key, value]) => previous[key] !== value)
    )
      return null;
    return {
      ...publicEntry(previous),
      notificationKey: previous.notificationKey,
    };
  },
  async dismissPayment(userId, id) {
    return publicEntry(
      await Payment.findOneAndUpdate(
        { _id: id, userId, status: { $in: ['pending', 'dismissed'] } },
        { $set: { status: 'dismissed' } },
        { returnDocument: 'after' },
      ).lean(),
    );
  },
  async findPayee(userId, recipientKey) {
    return publicEntry(await Payee.findOne({ userId, recipientKey }).lean());
  },
  async rememberPayee(userId, values) {
    const filter = { userId, recipientKey: values.recipientKey };
    try {
      return await Payee.findOneAndUpdate(
        filter,
        { $set: values },
        {
          upsert: true,
          returnDocument: 'after',
        },
      );
    } catch (failure) {
      if (failure.code !== 11000) throw failure;
      return Payee.findOneAndUpdate(
        filter,
        { $set: values },
        { returnDocument: 'after' },
      );
    }
  },
  async createTripItem(userId, values) {
    const filter = { userId, clientKey: values.clientKey };
    try {
      return publicEntry(
        await TripItem.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...values,
              userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true, returnDocument: 'after', timestamps: false },
        ).lean(),
      );
    } catch (failure) {
      if (failure.code !== 11000) throw failure;
      return publicEntry(await TripItem.findOne(filter).lean());
    }
  },
};
