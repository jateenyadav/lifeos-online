import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    loginId: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    name: { type: String, required: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
export const Session = mongoose.model('Session', sessionSchema);

export const mongoUsers = {
  findByIdentifier: (identifier) =>
    User.findOne({ $or: [{ loginId: identifier }, { email: identifier }] })
      .select('+passwordHash')
      .lean(),
  findByEmail: (email) => User.findOne({ email }).lean(),
  findByGoogleId: (googleId) => User.findOne({ googleId }).lean(),
  findById: (userId) => User.findById(userId).lean(),
  create: async (values) => (await User.create(values)).toObject(),
};

export const mongoSessions = {
  create: (values) => Session.create(values),
  findActive: (tokenHash, now) =>
    Session.findOne({ tokenHash, expiresAt: { $gt: now } }).lean(),
  remove: (tokenHash) => Session.deleteOne({ tokenHash }),
};
