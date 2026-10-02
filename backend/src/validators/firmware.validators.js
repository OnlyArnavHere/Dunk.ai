import { body, query } from 'express-validator';
import { BOARDS } from '../config/boards.js';

const MAX_TOTAL_CODE = 1024 * 1024;

export const compileValidation = [
  body('projectId').isMongoId().withMessage('Valid project ID is required'),
  body('boardId').isIn(BOARDS.map((b) => b.id)).withMessage('Unsupported board'),
  body('files').isArray({ min: 1, max: 30 }).withMessage('files must be a non-empty array'),
  body('files.*.filename').isString().isLength({ min: 1, max: 64 }),
  body('files.*.code').isString(),
  body('files').custom((files) => {
    const total = files.reduce((n, f) => n + String(f.code ?? '').length, 0);
    if (total > MAX_TOTAL_CODE) throw new Error('Source files exceed 1 MB in total');
    return true;
  }),
];

export const resolveValidation = [query('processingUnit').optional().isString().isLength({ max: 200 })];
