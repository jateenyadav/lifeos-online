import mongoose from 'mongoose';
import { ApiError } from './auth.js';
import { User, Session } from './models.js';
import { workspaceModels } from './workspace-models.js';
import { AiKnowledge } from './ai-models.js';

export function createAccountDeletion({
  users = User,
  sessions = Session,
  workspaces = workspaceModels,
  aiKnowledge = AiKnowledge,
  transaction = (action) => mongoose.connection.transaction(action),
} = {}) {
  return (userId) =>
    transaction(async (session) => {
      for (const model of Object.values(workspaces)) {
        await model.deleteMany({ userId }, { session });
      }
      await aiKnowledge.deleteMany({ userId }, { session });
      await sessions.deleteMany({ userId }, { session });
      const result = await users.deleteOne({ _id: userId }, { session });
      if (result.deletedCount !== 1)
        throw new ApiError(401, 'Your account is no longer available.');
    });
}
