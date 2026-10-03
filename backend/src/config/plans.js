import { env } from './env.js';

/**
 * Plans for the hosted service. The single source of truth: the quota checks
 * in services/billing.service.js read these limits, and GET /billing/plans
 * serves them to the pricing page and Settings. frontend/lib/plans.ts holds the
 * marketing copy for the same plans and must agree on the numbers.
 *
 * What a quota counts is cost the operator pays for, and nothing else:
 *
 * - `hostedMessages` — chat turns and pipeline runs answered on the operator's
 *   Groq key. A user with their own Groq key is never counted.
 * - `hostedBoards` — boards built on an operator-paid provider (including
 *   Claude Code, which spends the operator's subscription). A board built on
 *   the user's own Gemini/Groq/Anthropic key is never counted.
 * - `projects` — a storage bound, not a cost one; enforced at creation.
 *
 * `null` means unlimited. `boardProviders` is which generators the plan may
 * use on the operator's keys; BYOK unlocks any keyed provider on any plan.
 *
 * Nothing here applies unless BILLING_ENABLED=true. Local and self-hosted
 * installs run without quotas, exactly as before.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, annual: 0 },
    limits: { hostedMessages: 50, hostedBoards: 3, projects: 3 },
    boardProviders: ['groq', 'gemini', 'ollama'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 19, annual: 15 },
    limits: { hostedMessages: 1000, hostedBoards: 40, projects: null },
    boardProviders: ['groq', 'gemini', 'ollama', 'anthropic'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    limits: { hostedMessages: null, hostedBoards: null, projects: null },
    boardProviders: ['groq', 'gemini', 'ollama', 'anthropic', 'claude-code'],
  },
};

export const PLAN_IDS = Object.keys(PLANS);

export const planFor = (user) => PLANS[user?.subscription?.plan] ?? PLANS.free;

/** The public shape: limits and prices, plus where to go to upgrade. */
export const publicPlans = () => ({
  billingEnabled: env.billingEnabled,
  checkout: {
    pro: env.billingCheckoutUrlPro || null,
    contact: env.billingContactUrl,
  },
  plans: PLAN_IDS.map((id) => {
    const { name, price, limits, boardProviders } = PLANS[id];
    return { id, name, price, limits, boardProviders };
  }),
});
