import { body } from 'express-validator';

export const createProjectValidation = [
  body('title').trim().isLength({ min: 1, max: 160 }).withMessage('Title is required (1-160 chars)'),
  body('description').optional().isLength({ max: 5000 }).withMessage('Description too long'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
];

export const updateProjectValidation = [
  body('title').optional().trim().isLength({ min: 1, max: 160 }),
  body('description').optional().isLength({ max: 5000 }),
  body('tags').optional().isArray(),
  body('status').optional().isIn(['active', 'archived']),
  body('currentStage').optional().isIn(['requirements', 'architecture', 'components', 'pcb', 'validation', 'documentation']),
  // AI-generated artifact data (Mixed schema types)
  body('requirements').optional(),
  body('architecture').optional(),
  body('bom').optional(),
  body('eda_data').optional(),
  body('pcb_ir').optional(),
  body('validation').optional(),
  body('handoff_validation').optional(),
  body('documentation').optional(),
  body('board').optional(),
];

export const shareProjectValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['viewer', 'editor']).withMessage('Role must be viewer or editor'),
];
