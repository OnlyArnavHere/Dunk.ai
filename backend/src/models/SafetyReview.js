import mongoose from 'mongoose';

/**
 * A request the safety classifier stopped before design generation.
 *
 * `review` verdicts are held for a human (status `pending`); `reject` verdicts
 * are recorded as an audit trail (status `rejected`). The category and the
 * classifier's reasoning live only here — they are never sent to the requester,
 * so this collection is the one place to see why something was stopped.
 * Written by persistSafetyAudit in services/supervisor.service.js.
 */
const safetyReviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    jobId: { type: String, default: null },
    source: { type: String, enum: ['design_chat', 'code_chat'], default: 'design_chat' },

    verdict: { type: String, enum: ['reject', 'review'], required: true },
    category: { type: String, default: null },
    confidence: { type: Number, default: null },
    reasoning: { type: String, default: '' },
    model: { type: String, default: null },
    conversation: [
      {
        _id: false,
        role: { type: String, enum: ['user', 'assistant'] },
        content: String,
      },
    ],

    status: {
      type: String,
      enum: ['pending', 'rejected', 'approved', 'dismissed'],
      required: true,
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

safetyReviewSchema.index({ status: 1, createdAt: -1 });

export const SafetyReview = mongoose.model('SafetyReview', safetyReviewSchema);
