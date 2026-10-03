import { asyncHandler } from '../utils/asyncHandler.js';
import { send } from '../utils/response.js';
import { listApiKeys, removeApiKey, saveApiKey } from '../services/apiKey.service.js';

// GET /api/v1/account/keys — masked, never the key itself.
export const listKeys = asyncHandler(async (req, res) => {
  send(res, { data: await listApiKeys(req.user) });
});

// PUT /api/v1/account/keys/:provider — verified with the provider, then stored encrypted.
export const saveKey = asyncHandler(async (req, res) => {
  const data = await saveApiKey(req.user, req.params.provider, req.body.key);
  send(res, { message: `${data.label} key verified and saved`, data });
});

// DELETE /api/v1/account/keys/:provider
export const removeKey = asyncHandler(async (req, res) => {
  const data = await removeApiKey(req.user, req.params.provider);
  send(res, { message: `${data.label} key removed`, data });
});
