import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { readConfig } from './config.js';
import { User } from './models.js';

const config = readConfig();
if (config.production)
  throw new Error('The learning/demo seed is disabled in production.');
const seed = z
  .object({
    SEED_LOGIN_ID: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/),
    SEED_EMAIL: z.email(),
    SEED_NAME: z.string().trim().min(1).max(100),
    SEED_PASSWORD: z
      .string()
      .min(12)
      .refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
  })
  .parse(process.env);

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await User.createIndexes();
  const loginId = seed.SEED_LOGIN_ID.toLowerCase();
  const email = seed.SEED_EMAIL.toLowerCase();
  const existing = await User.findOne({ $or: [{ loginId }, { email }] });
  if (existing) {
    console.log(
      'Seed account already exists; its password and profile were not changed.',
    );
  } else {
    await User.create({
      loginId,
      email,
      name: seed.SEED_NAME,
      passwordHash: await bcrypt.hash(seed.SEED_PASSWORD, 12),
    });
    console.log(
      `Created learning account with ID: ${loginId}. Use SEED_PASSWORD from server/.env.`,
    );
  }
} finally {
  await mongoose.disconnect();
}
