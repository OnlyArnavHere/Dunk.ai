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
 * Security boundary: Node.js talks ONLY to the Supervisor Agent.
 * Downstream AI agents (Requirement, Architecture, Component, PCB, Validation, Documentation)
 * are internal to the Python engine and are never addressed directly here.
 */
export const callSupervisor = async ({ action, project, messages = [], files = [], jobId = null }) => {
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
      body: JSON.stringify({ action, project, messages, files, jobId }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(502, body.message || 'Supervisor Agent request failed');
    }

    return body.data || body;
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
export const callSupervisorStream = async (io, { action, project, messages = [], files = [], jobId }) => {
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
      body: JSON.stringify({ action, project, messages, files, jobId }),
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
          const { emitAIComplete } = await import('../sockets/index.js');
          emitAIComplete(io, jobId, data);
          finalResult = data.data || data;
          setJobStatus(jobId, 'completed', finalResult);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return finalResult;
};
