import { body } from 'express-validator';

export const chatValidation = [
  body('projectId').isMongoId().withMessage('Valid project ID is required'),
  body('message').isLength({ min: 1, max: 50000 }).withMessage('Message is required'),
  body('agentType').optional().isString(),
];

export const runValidation = [
  body('projectId').optional().isMongoId(),
  body('action').optional().isString(),
  body('agentType').optional().isIn(['requirement', 'architecture', 'component', 'pcb', 'validation', 'documentation']),
  body('messages').optional().isArray(),
  body('files').optional().isArray(),
  // The pcb_ir handoff, forwarded by the client for board generation.
  body('pcbIr').optional().isObject(),
];

export const cancelValidation = [
  body('jobId').notEmpty().withMessage('Job ID is required'),
];
