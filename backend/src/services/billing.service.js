import { env } from '../config/env.js';
import { PLANS, planFor } from '../config/plans.js';
import { BOARD_PROVIDERS, BOARD_PROVIDER_IDS } from '../config/providers.js';
import { Usage } from '../models/Usage.js';
import { Project } from '../models/Project.js';
import { ApiError } from '../utils/ApiError.js';
import { getCapabilities } from './supervisor.service.js';

/** The calendar month (UTC) that usage is counted against. */
export const currentPeriod = (date = new Date()) => date.toISOString().slice(0, 7);

const LABELS = { Messages: 'hosted AI messages', Boards: 'hosted board generations' };

const quotaError = (plan, kind, limit) =>
  new ApiError(
    402,
    `You've used all ${limit} ${LABELS[kind]} included in the ${plan.name} plan this month. ` +
      'Add your own API key in Settings → API keys for unlimited use, or upgrade your plan.',
    [{ code: 'quota_exceeded', kind: kind.toLowerCase(), limit }]
  );

const ensureUsageDoc = async (userId, period) => {
  try {
    await Usage.updateOne({ user: userId, period }, { $setOnInsert: { user: userId, period } }, { upsert: true });
  } catch (error) {
    // Two first-of-the-month requests racing the upsert: one wins, the other
    // hits the unique index, and the document exists either way.
    if (error?.code !== 11000) throw error;
  }
};

/**
 * Count one unit of work, refusing it when a hosted quota is spent.
 *
 * The limit sits in the update's filter, so the check and the increment are
 * one atomic operation: two runs started together cannot both slip under the
 * last unit. Returns `refund()` for a caller whose work never started.
 *
 * @param {object} user
 * @param {'Messages'|'Boards'} kind
 * @param {{ byok: boolean }} opts - true when the user's own key pays for it
 */
export const consume = async (user, kind, { byok }) => {
  const field = `${byok ? 'byok' : 'hosted'}${kind}`;
  const period = currentPeriod();
  await ensureUsageDoc(user._id, period);

  const plan = planFor(user);
  const limit = plan.limits[`hosted${kind}`];
  const enforce = env.billingEnabled && !byok && limit !== null;

  const filter = { user: user._id, period, ...(enforce ? { [field]: { $lt: limit } } : {}) };
  const updated = await Usage.findOneAndUpdate(filter, { $inc: { [field]: 1 } }, { new: true });
  if (!updated) throw quotaError(plan, kind, limit);

  return {
    refund: () =>
      Usage.updateOne({ user: user._id, period, [field]: { $gt: 0 } }, { $inc: { [field]: -1 } }).catch(() => {}),
  };
};

/**
 * May this user build a board with `providerId`, and who pays?
 *
 * Their own key always wins and is never limited. Otherwise the provider must
 * be runnable on this deployment (capabilities), and — with billing on —
 * included in their plan. Returns `{ byok }` for the quota call.
 */
export const authorizeBoardProvider = async (user, providerId, credentialIds) => {
  const spec = BOARD_PROVIDERS[providerId];
  if (!spec) throw ApiError.badRequest(`Unknown board provider "${providerId}"`);

  if (spec.credential && credentialIds.has(spec.credential)) return { byok: true };

  const caps = await getCapabilities();
  if (caps && caps.board_providers?.[providerId] === false) {
    throw ApiError.badRequest(
      spec.credential
        ? `${spec.label} has no server key on this deployment. Add your own ${spec.label} key in Settings → API keys to use it.`
        : `${spec.label} needs the Claude Code CLI on the AI engine host, which this deployment does not have. Choose another model in Settings.`
    );
  }

  const plan = planFor(user);
  if (env.billingEnabled && !plan.boardProviders.includes(providerId)) {
    const needed = Object.values(PLANS).find((p) => p.boardProviders.includes(providerId));
    throw new ApiError(
      402,
      `${spec.label} board generation on hosted keys is part of the ${needed?.name ?? 'Enterprise'} plan.` +
        (spec.credential ? ` Bring your own ${spec.label} key to use it on any plan.` : ''),
      [{ code: 'plan_required', provider: providerId, plan: needed?.id ?? 'enterprise' }]
    );
  }

  return { byok: false };
};

/** Board providers as this user sees them, for the model picker in Settings. */
export const boardProviderStatus = async (user, credentialIds) => {
  const caps = await getCapabilities();
  const plan = planFor(user);
  return BOARD_PROVIDER_IDS.map((id) => {
    const spec = BOARD_PROVIDERS[id];
    const byok = Boolean(spec.credential && credentialIds.has(spec.credential));
    const onServer = caps ? Boolean(caps.board_providers?.[id]) : null;
    const inPlan = !env.billingEnabled || plan.boardProviders.includes(id);
    const available = byok || (onServer !== false && inPlan);
    let reason = null;
    if (!available) {
      if (onServer === false) reason = spec.credential ? `Needs your ${spec.label} key` : 'Not installed on this server';
      else reason = 'Not in your plan';
    }
    return { id, label: spec.label, available, source: byok ? 'byok' : available ? 'hosted' : null, reason };
  });
};

export const assertCanCreateProject = async (user) => {
  if (!env.billingEnabled) return;
  const plan = planFor(user);
  const limit = plan.limits.projects;
  if (limit === null) return;
  const owned = await Project.countDocuments({ owner: user._id, status: { $ne: 'archived' } });
  if (owned >= limit) {
    throw new ApiError(
      402,
      `The ${plan.name} plan includes ${limit} active projects. Archive one, or upgrade for unlimited projects.`,
      [{ code: 'quota_exceeded', kind: 'projects', limit }]
    );
  }
};

export const getUsageSummary = async (user) => {
  const period = currentPeriod();
  const usage = await Usage.findOne({ user: user._id, period }).lean();
  const plan = planFor(user);
  const projects = await Project.countDocuments({ owner: user._id, status: { $ne: 'archived' } });
  return {
    billingEnabled: env.billingEnabled,
    period,
    plan: { id: plan.id, name: plan.name, limits: plan.limits, status: user.subscription?.status ?? 'active' },
    usage: {
      hostedMessages: usage?.hostedMessages ?? 0,
      hostedBoards: usage?.hostedBoards ?? 0,
      byokMessages: usage?.byokMessages ?? 0,
      byokBoards: usage?.byokBoards ?? 0,
      projects,
    },
  };
};
