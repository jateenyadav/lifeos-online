import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    loginId: user.loginId ?? null,
    provider: user.googleId ? 'google' : 'password',
  };
}

export function createGoogleVerifier(clientIds) {
  const client = new OAuth2Client();
  return async (idToken) => {
    if (!clientIds.length)
      throw new ApiError(
        503,
        'Google sign-in is not configured on the server yet.',
      );
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientIds,
      });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email || profile.email_verified !== true) {
        throw new Error('Unverified Google account');
      }
      return {
        googleId: profile.sub,
        email: profile.email.toLowerCase(),
        name: profile.name || profile.email.split('@')[0],
      };
    } catch {
      throw new ApiError(
        401,
        'Google could not verify your sign-in. Please try again.',
      );
    }
  };
}

export function createAuthService({
  users,
  sessions,
  verifyGoogle,
  sessionDays,
}) {
  const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);

  async function newSession(user) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionDays * 86400000);
    await sessions.create({
      tokenHash: hashToken(token),
      userId: String(user._id),
      expiresAt,
    });
    return { token, expiresAt, user: publicUser(user) };
  }

  async function currentAccount(token) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new ApiError(401, 'Please sign in to continue.');
    const session = await sessions.findActive(hashToken(token), new Date());
    const user = session && (await users.findById(session.userId));
    if (!user)
      throw new ApiError(
        401,
        'Your session has expired. Please sign in again.',
      );
    return { user, expiresAt: session.expiresAt };
  }

  return {
    async register(name, email, password) {
      const normalizedEmail = email.trim().toLowerCase();
      const duplicateMessage =
        'This email already has an account. Sign in using its existing method.';
      if (await users.findByEmail(normalizedEmail))
        throw new ApiError(409, duplicateMessage);
      const passwordHash = await bcrypt.hash(password, 12);
      let user;
      try {
        user = await users.create({
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
        });
      } catch (error) {
        if (error.code === 11000) throw new ApiError(409, duplicateMessage);
        throw error;
      }
      return newSession(user);
    },
    async login(identifier, password) {
      const user = await users.findByIdentifier(
        identifier.trim().toLowerCase(),
      );
      const matches = await bcrypt.compare(
        password,
        user?.passwordHash || (await dummyHash),
      );
      if (!user?.passwordHash || !matches)
        throw new ApiError(401, 'Incorrect ID/email or password.');
      return newSession(user);
    },
    async google(idToken) {
      const profile = await verifyGoogle(idToken);
      let user = await users.findByGoogleId(profile.googleId);
      if (!user) {
        if (await users.findByEmail(profile.email)) {
          throw new ApiError(
            409,
            'This email already has an account. Use its password; account linking is not available yet.',
          );
        }
        try {
          user = await users.create(profile);
        } catch (error) {
          if (error.code !== 11000) throw error;
          user = await users.findByGoogleId(profile.googleId);
          if (!user)
            throw new ApiError(
              409,
              'This email already has an account. Sign in using its existing method.',
            );
        }
      }
      return newSession(user);
    },
    async current(token) {
      const { user, expiresAt } = await currentAccount(token);
      return { user: publicUser(user), expiresAt };
    },
    async confirmAccountDeletion(token, { password, idToken }) {
      const { user } = await currentAccount(token);
      if (user.googleId) {
        if (!idToken)
          throw new ApiError(400, 'Confirm deletion with your Google account.');
        const profile = await verifyGoogle(idToken);
        if (profile.googleId !== user.googleId)
          throw new ApiError(
            403,
            'Choose the Google account used to sign in to LifeOS.',
          );
      } else {
        if (!password)
          throw new ApiError(
            400,
            'Enter your password to delete your account.',
          );
        const storedUser = await users.findByIdentifier(user.email);
        const matches = await bcrypt.compare(
          password,
          storedUser?.passwordHash || (await dummyHash),
        );
        if (
          !storedUser?.passwordHash ||
          String(storedUser._id) !== String(user._id) ||
          !matches
        )
          throw new ApiError(
            401,
            'Incorrect password. Your account was not deleted.',
          );
      }
      return String(user._id);
    },
    async logout(token) {
      if (token) await sessions.remove(hashToken(token));
    },
  };
}
