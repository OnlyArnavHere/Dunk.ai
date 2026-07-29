import { asyncHandler } from '../utils/asyncHandler.js';
import { send } from '../utils/response.js';
import { getProject } from '../services/project.service.js';
import {
  callSupervisor,
  callSupervisorStream,
  getSupervisorStatus,
  cancelSupervisorJob,
} from '../services/supervisor.service.js';
import { Document } from '../models/Document.js';
import { Artifact } from '../models/Artifact.js';
import { logActivity } from '../helpers/activity.js';
import { notify } from '../helpers/notification.js';
import { v4 as uuidv4 } from 'uuid';

// POST /api/v1/ai/chat
export const chat = asyncHandler(async (req, res) => {
  await getProject(req.body.projectId, req.user);

  const result = await callSupervisor({
    action: 'chat',
    project: req.body.projectId,
    messages: [{ type: 'user', content: req.body.message }],
    agentType: req.body.agentType,
    files: req.body.files || [],
  });

  await logActivity('ai_request', req.user._id, { action: 'chat', projectId: req.body.projectId }, req);

  send(res, { message: 'AI chat response', data: result });
});

// POST /api/v1/ai/run
export const run = asyncHandler(async (req, res) => {
  const project = req.body.projectId
    ? await getProject(req.body.projectId, req.user, true)
    : null;

  const jobId = uuidv4();
  const result = await callSupervisor({
    action: req.body.action || 'run_workflow',
    project: project ? project.toObject() : {},
    messages: req.body.messages || [],
    files: req.body.files || [],
    agentType: req.body.agentType,
    jobId,
  });

  await logActivity('ai_request', req.user._id, {
    action: req.body.action || 'run_workflow',
    agentType: req.body.agentType,
    projectId: project?._id,
    jobId,
  }, req);

  // If the result includes generated content, store it as a document
  if (project && req.body.agentType && result) {
    const typeMap = {
      requirement: 'requirements',
      architecture: 'architecture',
      component: 'components',
      pcb: 'pcb',
      validation: 'validation',
      documentation: 'documentation',
    };
    const docType = typeMap[req.body.agentType];
    if (docType) {
      const latestVersion = await Document.findOne({
        project: project._id,
        type: docType,
        isLatest: true,
      }).sort({ version: -1 });

      const newVersion = (latestVersion?.version || 0) + 1;
      if (latestVersion) {
        latestVersion.isLatest = false;
        await latestVersion.save();
      }

      const doc = await Document.create({
        project: project._id,
        type: docType,
        title: `${docType} v${newVersion}`,
        version: newVersion,
        isLatest: true,
        content: result.data || result,
        summary: result.summary || '',
        createdBy: req.user._id,
        agentType: req.body.agentType,
        previousVersion: latestVersion?._id,
      });

      // Update project stage
      if (project.currentStage !== docType) {
        project.currentStage = docType;
        if (!project.agentsCompleted.includes(docType)) {
          project.agentsCompleted.push(docType);
        }
        await project.save();
      }

      await notify(req.user._id, {
        type: 'document_ready',
        title: `${docType} generated`,
        message: `Version ${newVersion} of ${docType} is ready for your project.`,
        data: { documentId: doc._id, type: docType },
        project: project._id,
      });
    }
  }

  send(res, {
    status: 202,
    message: 'Workflow submitted to Supervisor Agent',
    data: { jobId, result },
  });
});

// GET /api/v1/ai/status/:id
export const status = asyncHandler(async (req, res) => {
  const jobStatus = await getSupervisorStatus(req.params.id);
  send(res, { data: jobStatus });
});

// GET /api/v1/ai/project/:projectId
export const projectArtifacts = asyncHandler(async (req, res) => {
  await getProject(req.params.projectId, req.user);

  const [documents, artifacts] = await Promise.all([
    Document.find({ project: req.params.projectId, isLatest: true }).sort({ type: 1 }),
    Artifact.find({ project: req.params.projectId }).sort({ createdAt: -1 }),
  ]);

  send(res, { data: { documents, artifacts } });
});

// POST /api/v1/ai/cancel
export const cancel = asyncHandler(async (req, res) => {
  const result = await cancelSupervisorJob(req.body.jobId);
  send(res, { message: 'Job cancelled', data: result });
});

// POST /api/v1/ai/run-stream
// Kicks off the streaming pipeline and returns immediately with a jobId.
// The frontend subscribes to Socket.io room `job:<jobId>` and receives:
//   ai:progress  — after each agent node completes
//   ai:error     — if the pipeline fails mid-stream
//   ai:complete  — when the full workflow finishes
export const runStream = asyncHandler(async (req, res) => {
  const project = req.body.projectId
    ? await getProject(req.body.projectId, req.user, true)
    : null;

  const jobId = uuidv4();
  const io = req.app.get('io');

  // Fire-and-forget: the stream runs in the background and emits
  // Socket.io events as progress arrives.  We don't await it here.
  callSupervisorStream(io, {
    action: req.body.action || 'run_workflow',
    project: project ? project.toObject() : {},
    messages: req.body.messages || [],
    files: req.body.files || [],
    jobId,
  }).catch((err) => {
    console.error(`[AI Stream] job ${jobId} failed:`, err.message);
  });

  await logActivity('ai_request', req.user._id, {
    action: req.body.action || 'run_workflow',
    agentType: req.body.agentType,
    projectId: project?._id,
    jobId,
    streaming: true,
  }, req);

  send(res, {
    status: 202,
    message: 'Streaming workflow started — subscribe to Socket.io room job:<jobId>',
    data: { jobId },
  });
});
