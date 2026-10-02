/**
 * Pricing copy for the landing page.
 *
 * The limits and prices mirror PLANS in backend/src/config/plans.js, which is
 * what is actually enforced, and must agree with it. Kept here rather than
 * fetched so the pricing section renders statically, with no request and no
 * loading state; Settings reads the live limits from GET /billing/usage.
 *
 * Every bullet is something the product does today. "Hosted" means the
 * request runs on DunkAI's provider keys and counts toward the plan; anything
 * run on the user's own key (BYOK) is never counted.
 */
export interface PlanCopy {
  id: 'free' | 'pro' | 'enterprise'
  name: string
  tagline: string
  price: { monthly: number; annual: number } | null
  cta: string
  href: string
  highlighted?: boolean
  features: string[]
}

export const PLAN_COPY: PlanCopy[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try the full pipeline on a real idea.',
    price: { monthly: 0, annual: 0 },
    cta: 'Start building',
    href: '/signup',
    features: [
      '50 hosted AI messages / month',
      '3 hosted board generations / month',
      '3 active projects',
      'Groq, Gemini and Ollama board models',
      'Unlimited use with your own API keys',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For engineers shipping boards every week.',
    price: { monthly: 19, annual: 15 },
    cta: 'Upgrade to Pro',
    href: '/signup?plan=pro',
    highlighted: true,
    features: [
      '1,000 hosted AI messages / month',
      '40 hosted board generations / month',
      'Unlimited projects',
      'Claude Sonnet board generation on our keys',
      'Unlimited use with your own API keys',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Run DunkAI inside your own cloud.',
    price: null,
    cta: 'Talk to us',
    href: 'mailto:sales@dunkai.io',
    features: [
      'No usage limits',
      'Agentic Claude Code board generation',
      'Self-hosted: your network, your data',
      'Docker images for every service',
      'Onboarding and direct engineering support',
    ],
  },
]
