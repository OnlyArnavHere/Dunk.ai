import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    action: {
      type: String,
      enum: [
        'login',
        'logout',
        'register',
        'password_reset',
        'profile_updated',
        'project_created',
        'project_updated',
        'project_deleted',
        'project_shared',
        'ai_request',
        'ai_complete',
        'ai_failed',
        'file_upload',
        'file_delete',
        'document_created',
        'firmware_compile',
        'error',
      ],
      required: true,
    },
    method: { type: String, default: '' }, // HTTP method
    path: { type: String, default: '' }, // request path
    statusCode: { type: Number, default: 200 },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    duration: { type: Number, default: 0 }, // request duration in ms
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
