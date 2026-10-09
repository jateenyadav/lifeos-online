import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApiError, createAuthService } from './auth.js';
import { createWorkspaceRouter } from './workspaces.js';
import { createAiRouter } from './ai.js';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your ID or email.').max(254),
  password: z
    .string()
    .min(1, 'Enter your password.')
    .refine(
      (password) => Buffer.byteLength(password, 'utf8') <= 72,
      'Password must be at most 72 bytes.',
    ),
});
const googleSchema = z.object({ idToken: z.string().min(1).max(10000) });
const accountDeletionSchema = z
  .object({
    confirmation: z.literal('DELETE', {
      error: 'Type DELETE to confirm account deletion.',
    }),
    password: loginSchema.shape.password.optional(),
    idToken: googleSchema.shape.idToken.optional(),
  })
  .strict();
const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter your name.')
      .max(100, 'Name must be at most 100 characters.'),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email('Enter a valid email address.')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .refine(
        (password) => Buffer.byteLength(password, 'utf8') <= 72,
        'Password must be at most 72 bytes.',
      ),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export function createApp({
  config,
  users,
  sessions,
  verifyGoogle,
  workspaces,
  aiKnowledge,
  aiProviders,
  deleteAccountData,
  isDatabaseReady = () => true,
}) {
  const app = express();
  const auth = createAuthService({
    users,
    sessions,
    verifyGoogle,
    sessionDays: config.sessionDays,
  });
  const cookieName = config.production
    ? '__Host-lifeos_session'
    : 'lifeos_session';
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: config.cookieSameSite,
    path: '/',
  };
  const tokenFrom = (request) => {
    const authorization = request.get('authorization');
    return authorization
      ? authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
      : request.cookies[cookieName];
  };
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || config.webOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use('/api/ai', express.json({ limit: '64kb' }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.get(['/health', '/api/health'], async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    let ready;
    try {
      ready = Boolean(await isDatabaseReady());
    } catch {
      ready = false;
    }
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      database: ready ? 'connected' : 'disconnected',
    });
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Too many requests. Please try again shortly.' },
    }),
  );
  app.use('/api', (request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.get('origin');
      const allowedWeb = origin && config.webOrigins.includes(origin);
      const nativeClient = !origin && request.get('x-client-type') === 'mobile';
      if (!allowedWeb && !nativeClient)
        return next(new ApiError(403, 'This request origin is not allowed.'));
    }
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      message: 'Too many sign-in attempts. Please try again in 15 minutes.',
    },
  });
  const sendSession = async (request, response, result) => {
    const previousToken = tokenFrom(request);
    if (previousToken) await auth.logout(previousToken);
    if (request.get('x-client-type') === 'mobile' && !request.get('origin')) {
      return response.json(result);
    }
    response.cookie(cookieName, result.token, {
      ...cookieOptions,
      expires: result.expiresAt,
    });
    return response.json({ user: result.user, expiresAt: result.expiresAt });
  };
  app.post('/api/auth/login', loginLimiter, async (request, response) => {
    const values = loginSchema.parse(request.body);
    await sendSession(
      request,
      response,
      await auth.login(values.identifier, values.password),
    );
  });
  app.post('/api/auth/register', loginLimiter, async (request, response) => {
    const values = registerSchema.parse(request.body);
    const result = await auth.register(
      values.name,
      values.email,
      values.password,
    );
    response.status(201);
    await sendSession(request, response, result);
  });
  app.post('/api/auth/google', loginLimiter, async (request, response) => {
    const values = googleSchema.parse(request.body);
    await sendSession(request, response, await auth.google(values.idToken));
  });
  app.get('/api/auth/me', async (request, response) => {
    response.json(await auth.current(tokenFrom(request)));
  });
  app.post('/api/auth/logout', async (request, response) => {
    await auth.logout(tokenFrom(request));
    response.clearCookie(cookieName, cookieOptions);
    response.status(204).end();
  });
  app.delete('/api/auth/account', loginLimiter, async (request, response) => {
    const values = accountDeletionSchema.parse(request.body);
    const userId = await auth.confirmAccountDeletion(
      tokenFrom(request),
      values,
    );
    if (!deleteAccountData)
      throw new ApiError(
        503,
        'Account deletion is not available yet. Restart the updated backend.',
      );
    await deleteAccountData(userId);
    response.clearCookie(cookieName, cookieOptions);
    response.status(204).end();
  });
  app.use(
    '/api/ai',
    createAiRouter({
      store: workspaces,
      knowledge: aiKnowledge,
      providers: aiProviders,
      config,
      currentUser: (request) => auth.current(tokenFrom(request)),
    }),
  );
  app.use(
    '/api/workspaces',
    createWorkspaceRouter({
      store: workspaces,
      currentUser: (request) => auth.current(tokenFrom(request)),
    }),
  );
  app.use((_request, _response, next) =>
    next(new ApiError(404, 'API route not found.')),
  );
  app.use((error, _request, response, _next) => {
    if (error instanceof z.ZodError)
      return response
        .status(400)
        .json({ message: error.issues[0]?.message || 'Invalid request.' });
    if (error.type === 'entity.parse.failed')
      return response.status(400).json({ message: 'Send a valid JSON body.' });
    if (error.type === 'entity.too.large')
      return response
        .status(413)
        .json({ message: 'Request body is too large.' });
    if (error instanceof ApiError)
      return response.status(error.status).json({ message: error.message });
    console.error('Unexpected API error:', error.name);
    response
      .status(500)
      .json({ message: 'Something went wrong. Please try again.' });
  });
  return app;
}
