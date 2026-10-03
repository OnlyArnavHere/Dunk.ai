import { Router } from 'express';
import { body, param } from 'express-validator';
import * as c from '../controllers/account.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { authLimiter } from '../middleware/security.js';
import { BYOK_PROVIDER_IDS } from '../config/providers.js';

export const accountRoutes = Router();

accountRoutes.use(authenticate);

const providerParam = param('provider').isIn(BYOK_PROVIDER_IDS).withMessage('Unsupported provider');

accountRoutes.get('/keys', c.listKeys);
// Saving makes an outbound call to the provider; the auth limiter keeps this
// from being used to test stolen keys in bulk.
accountRoutes.put(
  '/keys/:provider',
  authLimiter,
  providerParam,
  body('key')
    .isString()
    .trim()
    .isLength({ min: 20, max: 300 })
    .withMessage('That does not look like an API key')
    .matches(/^\S+$/)
    .withMessage('API keys contain no spaces'),
  validate,
  c.saveKey
);
accountRoutes.delete('/keys/:provider', providerParam, validate, c.removeKey);
