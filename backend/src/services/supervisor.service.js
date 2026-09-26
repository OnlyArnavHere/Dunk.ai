import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// In-memory store for AI job status (replace with Redis in production)
const jobStore = new Map();

export const setJobStatus = (jobId, status, data = {}) => {
  jobStore.set(jobId, { jobId, status, ...data, updatedAt: new Date() });
  // Auto-cleanup after 1 hour
  setTimeout(() => jobStore.delete(jobId), 60 * 60 * 1000);
};

export const getJobStatus = (jobId) => jobStore.get(jobId);

export const deleteJobStatus = (jobId) => {
  const job = jobStore.get(jobId);
  if (job && job.controller) {
    job.controller.abort();
  }
  jobStore.delete(jobId);
  return job;
};

/**
 * The request body sent to the Python supervisor, in one place.
 *
 * Both callers used to inline `JSON.stringify({ action, project, messages,
 * files, jobId })`, which silently discarded anything not in that list —
 * `agentType` was being passed in by the controller and dropped here for every
 * chat request, even though SupervisorRequest declares it and _handle_chat
 * depends on it. Optional fields are omitted rather than sent as null so the
 * Pydantic defaults on the other side still apply.
 *
 * @param {object} fields - action, project, messages, files, jobId, agentType, provider, model
 * @returns {object} body for the supervisor, optional keys omitted when unset
 */
const buildSupervisorBody = ({
  action,
  project,
  messages,
  files,
  jobId,
  agentType,
  provider,
  model,
}) => ({
  action,
  project,
  messages,
  files,
  jobId,
  ...(agentType ? { agentType } : {}),
  ...(provider ? { provider } : {}),
  ...(model ? { model } : {}),
});

/**
 * Remove the safety classifier's audit record from a supervisor result.
 *
 * The supervisor sends the full record (category, reasoning, conversation) as
 * `safety_audit` so it can be stored; the requester may see only the verdict
 * (`safety`). This must run before a result is returned to the client, emitted
 * on a socket, or saved anywhere a client can read it back. It looks at the top
 * level and one level down, because chat replies and SSE events wrap the state
 * in `data`. Mutates `result`; returns the record, or null.
 *
 * @param {object} result - a supervisor response, or the payload of an SSE event
 * @returns {object|null} the audit record, if there was one
 */
export const takeSafetyAudit = (result) => {
  let audit = null;
  for (const holder of [result, result?.data]) {
    if (holder && typeof holder === 'object' && 'safety_audit' in holder) {
      audit = audit ?? holder.safety_audit;
      delete holder.safety_audit;
    }
  }
  return audit;
};

/**
 * Record a stopped request. `review` is held for a human (status pending);
 * `reject` is kept as an audit trail. `allow` and `skipped` are not stored, and
 * `unavailable` (the classifier itself failed) is a system fault, not a
 * decision about the content, so it is logged rather than queued.
 * Never throws: a failed write must not break the response the user is waiting on.
 *
 * @param {object|null} audit - from takeSafetyAudit
 * @param {object} context - userId, projectId, chatId, jobId, source
 */
export const persistSafetyAudit = async (audit, { userId, projectId, chatId, jobId, source } = {}) => {
  if (!audit || typeof audit !== 'object') return;
  if (audit.verdict === 'unavailable') {
    console.warn(`[Safety] classifier unavailable for job ${jobId ?? '-'}: ${audit.reasoning ?? ''}`);
    return;
  }
  if (audit.verdict !== 'reject' && audit.verdict !== 'review') return;

  try {
    const { SafetyReview } = await import('../models/SafetyReview.js');
    await SafetyReview.create({
      user: userId ?? null,
      project: projectId ?? null,
      chat: chatId ?? null,
      jobId: jobId ?? null,
      source: source ?? 'design_chat',
      verdict: audit.verdict,
      category: audit.category ?? null,
      confidence: typeof audit.confidence === 'number' ? audit.confidence : null,
      reasoning: audit.reasoning ?? '',
      model: audit.model ?? null,
      conversation: Array.isArray(audit.conversation) ? audit.conversation : [],
      status: audit.verdict === 'review' ? 'pending' : 'rejected',
    });
  } catch (error) {
    console.error(`[Safety] could not record ${audit.verdict} for job ${jobId ?? '-'}:`, error.message);
  }
};

/**
 * Security boundary: Node.js talks ONLY to the Supervisor Agent.
 * Downstream AI agents (Requirement, Architecture, Component, PCB, Validation, Documentation)
 * are internal to the Python engine and are never addressed directly here.
 */
export const callSupervisor = async ({
  action,
  project,
  messages = [],
  files = [],
  jobId = null,
  agentType = null,
  provider = null,
  model = null,
  audit = {},
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  if (jobId) {
    const existing = jobStore.get(jobId);
    if (existing) existing.controller = controller;
  }

  try {
    const headers = { 'content-type': 'application/json' };
    if (env.supervisorToken) headers.authorization = `Bearer ${env.supervisorToken}`;

    const response = await fetch(new URL(env.supervisorPath, env.supervisorUrl), {
      method: 'POST',
      headers,
      signal: controller.signal,
      // Built with buildSupervisorBody so a field added to the contract cannot
      // be silently dropped here — which is exactly what happened to agentType.
      body: JSON.stringify(
        buildSupervisorBody({ action, project, messages, files, jobId, agentType, provider, model })
      ),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(502, body.message || 'Supervisor Agent request failed');
    }

    const result = body.data || body;
    // Before the result reaches the controller, and so the client.
    await persistSafetyAudit(takeSafetyAudit(result), { ...audit, jobId });
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError(504, 'Supervisor Agent request timed out');
    }
    throw new ApiError(502, 'Supervisor Agent is unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Check the status of a Supervisor Agent job (if the Python server supports async jobs).
 */
export const getSupervisorStatus = async (jobId) => {
  // First check our local in-memory store
  const local = jobStore.get(jobId);
  if (local && local.status === 'completed') return local;

  // Then check with the Supervisor Agent
  try {
    const headers = {};
    if (env.supervisorToken) headers.authorization = `Bearer ${env.supervisorToken}`;

    const response = await fetch(
      new URL(`${env.supervisorPath}/${jobId}/status`, env.supervisorUrl),
      { headers }
    );

    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      const status = body.data || body;
      setJobStatus(jobId, status.status || 'unknown', status);
      return status;
    }
  } catch {
    // Fall through to local
  }

  return local || { jobId, status: 'unknown' };
};

/**
 * Cancel a Supervisor Agent job.
 */
export const cancelSupervisorJob = async (jobId) => {
  const job = jobStore.get(jobId);
  if (job?.controller) {
    job.controller.abort();
  }

  try {
    const headers = {};
    if (env.supervisorToken) headers.authorization = `Bearer ${env.supervisorToken}`;

    await fetch(new URL(`${env.supervisorPath}/${jobId}/cancel`, env.supervisorUrl), {
      method: 'POST',
      headers,
    });
  } catch {
    // Best-effort cancel
  }

  setJobStatus(jobId, 'cancelled');
  return { jobId, status: 'cancelled' };
};


// ---------------------------------------------------------------------------
// Streaming supervisor call (SSE → Socket.io bridge)
// ---------------------------------------------------------------------------

/**
 * Parse a raw SSE text buffer into discrete events.
 *
 * SSE format:  event: <name>\ndata: <json>\n\n
 *
 * Because TCP can split a chunk mid-line, this function returns both the
 * parsed events AND any leftover text that hasn't formed a complete event
 * yet.  The caller must prepend ``remainder`` to the next chunk.
 *
 * @param {string} buffer - accumulated text (may contain 0-N events)
 * @returns {{ events: Array<{event: string, data: object}>, remainder: string }}
 */
const parseSSEBuffer = (buffer) => {
  const events = [];
  // Each SSE event is terminated by a double newline.
  const blocks = buffer.split('\n\n');

  // The last element is either '' (if buffer ended with \n\n) or an
  // incomplete block we need to keep for the next chunk.
  const remainder = blocks.pop() || '';

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventType = 'message';
    let dataLine = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice(6);
      }
    }

    if (!dataLine) continue;

    try {
      events.push({ event: eventType, data: JSON.parse(dataLine) });
    } catch {
      // Unparseable JSON — skip this event rather than crashing.
      console.warn('[Supervisor] Skipped unparseable SSE data:', dataLine.slice(0, 200));
    }
  }

  return { events, remainder };
};

/**
 * Write a completed run's board state onto its Chat session (or, absent a
 * chatId, its Project — see the fallback note in ai.controller.js#runStream).
 *
 * Every other artifact a run produces is persisted by the browser through
 * PATCH /chats/:id/artifacts once ai:complete arrives. The board cannot be: it
 * is the one artifact that is not re-derivable (its files live under
 * uploads/boards/ and `urls` is the only record of where they are), and a
 * board run can finish after the tab that started it is gone. So it is
 * written here, where the completion actually lands, whether or not anyone is
 * still listening.
 *
 * The clearing branch mirrors the rule the workspace store applies in memory
 * (see setAiOutput in frontend/lib/store.ts): a run that delivers new
 * components retires the board built from the previous ones, because showing
 * that board beside a different BOM would be a different design than the one on
 * screen. `{}` rather than null is the "untouched" value the rest of the
 * Mixed fields use.
 */
const persistBoardState = async (project, chatId, result) => {
  const projectId = project?._id;
  if (!result || typeof result !== 'object') return;
  if (!chatId && !projectId) return;

  const board = result.board;
  const hasBoard = board && typeof board === 'object';
  const componentsReplaced = Boolean(result.bom || result.pcb_ir);
  if (!hasBoard && !componentsReplaced) return;

  try {
    if (chatId) {
      const { Chat } = await import('../models/Chat.js');
      await Chat.updateOne({ _id: chatId }, { $set: { board: hasBoard ? board : {} } });
    } else {
      const { Project } = await import('../models/Project.js');
      await Project.updateOne({ _id: projectId }, { $set: { board: hasBoard ? board : {} } });
    }
  } catch (error) {
    // A board that is on screen but unsaved is a bad outcome, but it is not
    // worth tearing down the stream the user is currently watching.
    console.error(`[AI Stream] could not persist board for chat=${chatId} project=${projectId}:`, error.message);
  }
};

/**
 * Call the Supervisor Agent's streaming endpoint and relay progress over
 * Socket.io.
 *
 * Design notes:
 * - No AbortController timeout.  LangGraph agents can legitimately run
 *   for several minutes; a hard timeout would sever a healthy stream.
 *   Callers that need cancellation should use ``cancelSupervisorJob``.
 * - The SSE text buffer handles TCP packet splits: we accumulate text
 *   until we see \n\n before parsing.
 * - Mid-stream Python errors arrive as ``event: error`` (HTTP 200 was
 *   already sent) and are relayed as ``ai:error`` socket events.
 *
 * @param {object} io - Socket.io server instance
 * @param {object} opts - { action, project, messages, files, jobId }
 * @returns {Promise<object>} final serialised state (from the ``complete`` event)
 */
export const callSupervisorStream = async (
  io,
  {
    action,
    project,
    messages = [],
    files = [],
    jobId,
    agentType = null,
    provider = null,
    model = null,
    chatId = null,
    audit = {},
  }
) => {
  setJobStatus(jobId, 'running');

  const headers = { 'content-type': 'application/json' };
  if (env.supervisorToken) headers.authorization = `Bearer ${env.supervisorToken}`;

  const streamPath = `${env.supervisorPath}/stream`;
  let response;

  try {
    response = await fetch(new URL(streamPath, env.supervisorUrl), {
      method: 'POST',
      headers,
      // No signal / no timeout — the stream lives as long as the pipeline runs.
      body: JSON.stringify(
        buildSupervisorBody({ action, project, messages, files, jobId, agentType, provider, model })
      ),
    });
  } catch (error) {
    setJobStatus(jobId, 'failed', { error: 'Supervisor Agent is unavailable' });
    throw new ApiError(502, 'Supervisor Agent is unavailable');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    setJobStatus(jobId, 'failed', { error: body.message || 'Supervisor request failed' });
    throw new ApiError(502, body.message || 'Supervisor Agent request failed');
  }

  // Read the SSE stream chunk-by-chunk.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let finalResult = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSSEBuffer(sseBuffer);
      sseBuffer = remainder;

      for (const { event, data } of events) {
        if (event === 'progress') {
          const { emitAIProgress } = await import('../sockets/index.js');
          emitAIProgress(io, jobId, data);
          setJobStatus(jobId, 'running', { currentNode: data.node, label: data.label });

        } else if (event === 'error') {
          const { emitAIError } = await import('../sockets/index.js');
          emitAIError(io, jobId, data);
          setJobStatus(jobId, 'failed', { error: data.error, node: data.node });
          return data; // Stream closed by Python after an error event.

        } else if (event === 'complete') {
          // Stripped before the emit: the socket goes straight to the browser.
          const safetyAudit = takeSafetyAudit(data);
          const { emitAIComplete } = await import('../sockets/index.js');
          emitAIComplete(io, jobId, data);
          await persistSafetyAudit(safetyAudit, { ...audit, chatId, jobId });
          finalResult = data.data || data;
          setJobStatus(jobId, 'completed', finalResult);
          await persistBoardState(project, chatId, finalResult);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return finalResult;
};
