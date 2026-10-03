import { Router } from 'express';
import { body, param } from 'express-validator';
import * as c from '../controllers/billing.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { PLAN_IDS } from '../config/plans.js';

export const billingRoutes = Router();

billingRoutes.get('/plans', c.plans);
billingRoutes.get('/usage', authenticate, c.usage);
billingRoutes.patch(
  '/users/:userId/plan',
  authenticate,
  authorize('admin'),
  param('userId').isMongoId(),
  body('plan').isIn(PLAN_IDS),
  body('status').optional().isIn(['active', 'cancelled', 'past_due']),
  validate,
  c.setPlan
);
