import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { User, Session, mongoUsers, mongoSessions } from './models.js';
import { createGoogleVerifier } from './auth.js';
import { createApp } from './app.js';
import { workspaceModels, mongoWorkspaces } from './workspace-models.js';
import { AiKnowledge, AiUsage, mongoAiKnowledge, mongoAiUsage } from './ai-models.js';
import { createCloudAi } from './ai-cloud.js';
import { createAccountDeletion } from './account-deletion.js';

const config = readConfig();
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
await Promise.all(
  [User, Session, AiKnowledge, AiUsage, ...Object.values(workspaceModels)].map((model) =>
    model.createIndexes(),
  ),
);
const app = createApp({
  config,
  users: mongoUsers,
  sessions: mongoSessions,
  workspaces: mongoWorkspaces,
  aiKnowledge: mongoAiKnowledge,
  cloudAi: createCloudAi({ ...config.cloudAi, usage: mongoAiUsage }),
  deleteAccountData: createAccountDeletion(),
  verifyGoogle: createGoogleVerifier(config.googleClientIds),
  isDatabaseReady: async () => {
    if (mongoose.connection.readyState !== 1) return false;
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 5000 });
    return true;
  },
});
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`LifeOS API ready on port ${config.port}. MongoDB connected.`);
  console.log(
    Object.values(config.cloudAi.env).some(Boolean)
      ? 'LifeOS AI (free cloud models) is on.'
      : 'LifeOS AI is off: add GROQ_API_KEY or GEMINI_API_KEY to turn it on.',
  );
  if (!config.googleClientIds.length)
    console.log(
      'Password login is available. Add GOOGLE_CLIENT_IDS to enable Google sign-in.',
    );
});
server.on('error', (error) => {
  console.error(`API could not start: ${error.code}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
