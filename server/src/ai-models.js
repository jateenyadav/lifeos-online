import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, required: true },
    topic: {
      type: String,
      enum: ['workouts', 'routines', 'spending'],
      required: true,
    },
    content: { type: String, required: true },
  },
  { timestamps: true },
);
schema.index({ userId: 1, updatedAt: -1 });
export const AiKnowledge = mongoose.model('AiKnowledge', schema);

const publicDocument = (document) => ({
  id: String(document._id),
  title: document.title,
  topic: document.topic,
  content: document.content,
});

export const mongoAiKnowledge = {
  async list(userId) {
    return (
      await AiKnowledge.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean()
    ).map(publicDocument);
  },
  async create(userId, values) {
    return publicDocument(await AiKnowledge.create({ userId, ...values }));
  },
  async remove(userId, id) {
    return (await AiKnowledge.deleteOne({ _id: id, userId })).deletedCount > 0;
  },
};
