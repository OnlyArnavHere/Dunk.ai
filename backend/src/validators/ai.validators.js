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
  // Board-generation provider chosen in the UI. The list mirrors
  // dunkai-designer's provider registry; an unknown name would be rejected
  // there anyway, but failing here gives the user a 400 instead of a job that
  // dies three stages in.
  body('provider').optional().isIn(['claude-code', 'anthropic', 'gemini', 'groq', 'ollama']),
  // Not enumerated here on purpose: which models a provider will run is the
  // designer's rule, not this layer's, and it enforces it (the anthropic
  // provider refuses anything above the 4.5 generation). Duplicating the list
  // would give two places to forget to update.
  body('model').optional().isString().isLength({ max: 120 }),
];

export const cancelValidation = [
  body('jobId').notEmpty().withMessage('Job ID is required'),
];
