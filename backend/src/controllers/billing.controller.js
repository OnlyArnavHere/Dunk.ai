import { asyncHandler } from '../utils/asyncHandler.js';
import { send } from '../utils/response.js';
import { publicPlans } from '../config/plans.js';
import { getUsageSummary } from '../services/billing.service.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/v1/billing/plans — public; the pricing page and Settings read it.
export const plans = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  send(res, { data: publicPlans() });
});

// GET /api/v1/billing/usage
export const usage = asyncHandler(async (req, res) => {
  send(res, { data: await getUsageSummary(req.user) });
});

/**
 * PATCH /api/v1/billing/users/:userId/plan — admin only.
 *
 * How a plan changes until a payment webhook does it: checkout happens at
 * BILLING_CHECKOUT_URL_PRO (e.g. a Stripe Payment Link), and an admin applies
 * the plan here. A webhook handler would call the same update.
 */
export const setPlan = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    {
      'subscription.plan': req.body.plan,
      ...(req.body.status ? { 'subscription.status': req.body.status } : {}),
    },
    { new: true }
  );
  if (!user) throw ApiError.notFound('User not found');
  send(res, { message: `Plan set to ${req.body.plan}`, data: { id: user._id, subscription: user.subscription } });
});
