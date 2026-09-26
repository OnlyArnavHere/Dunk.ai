import mongoose from 'mongoose';

const artifactSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', index: true },
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    type: {
      type: String,
      enum: ['requirements', 'architecture', 'components', 'pcb_design', 'validation', 'documentation', 'code', 'other'],
      required: true,
    },
    title: { type: String, default: '' },
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

artifactSchema.index({ project: 1, type: 1 });

export const Artifact = mongoose.model('Artifact', artifactSchema);
