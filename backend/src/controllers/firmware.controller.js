import { asyncHandler } from '../utils/asyncHandler.js';
import { send } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { getProject } from '../services/project.service.js';
import { compileFirmware, getBuildDownload, listBoards } from '../services/firmware.service.js';
import { findBoard, publicBoard, resolveBoard } from '../config/boards.js';
import { logActivity } from '../helpers/activity.js';

// GET /api/v1/firmware/boards?processingUnit=...
export const boards = asyncHandler(async (req, res) => {
  const data = await listBoards();
  const suggested = resolveBoard(req.query.processingUnit || '');
  send(res, { message: 'Firmware boards', data: { ...data, suggestedBoardId: suggested?.id || null } });
});

// POST /api/v1/firmware/compile
export const compile = asyncHandler(async (req, res) => {
  await getProject(req.body.projectId, req.user);
  const board = findBoard(req.body.boardId);
  if (!board) throw ApiError.badRequest('Unsupported board');

  const result = await compileFirmware({ board, files: req.body.files, userId: req.user._id });

  await logActivity(
    'firmware_compile',
    req.user._id,
    { projectId: req.body.projectId, board: board.id, cached: result.cached },
    req
  );

  send(res, { message: `Compiled for ${publicBoard(board).label}`, data: result });
});

// GET /api/v1/firmware/builds/:buildId/download
export const download = asyncHandler(async (req, res) => {
  const { filename, data } = getBuildDownload(req.params.buildId, req.user._id);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(data);
});
