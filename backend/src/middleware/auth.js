import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken, extractTokensFromCookies } from '../utils/tokens.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { COOKIE_NAMES } from '../constants/index.js';

/**
 * Authenticate middleware — supports BOTH:
 *   1. Authorization: Bearer <token>  (for API clients / mobile)
 *   2. httpOnly cookie `dunk_access`   (for browser / Next.js SSR)
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  // Try Bearer header first
  const header = req.headers.authorization;
  let token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  // Fall back to cookie
  if (!token) {
    const cookies = extractTokensFromCookies(req);
    token = cookies.accessToken;
  }

  if (!token) {
    throw ApiError.unauthorized('Authentication required. Provide a Bearer token or access cookie.');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
  // A socket handshake token is readable by page scripts; it must not double
  // as an API credential.
  if (payload.scope === 'socket') {
    throw ApiError.unauthorized('Socket tokens cannot be used for API requests');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User not found');
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  req.user = user;
  req.tokenPayload = payload;
  next();
});

/**
 * Optional authentication — attaches user if token is valid but does NOT throw
 * Useful for public endpoints that behave differently for logged-in users.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    let token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      const cookies = extractTokensFromCookies(req);
      token = cookies.accessToken;
    }
    if (token) {
      const payload = verifyAccessToken(token);
      if (payload.scope === 'socket') return next();
      const user = await User.findById(payload.sub);
      if (user && user.isActive) req.user = user;
    }
  } catch {
    // Silently ignore — optional auth
  }
  next();
});

/**
 * Role-based access control middleware.
 * Usage: authorize('admin') or authorize('admin', 'moderator')
 */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('Insufficient permissions for this action'));
  }
  next();
};

/**
 * Admin-only shortcut
 */
export const requireAdmin = authorize('admin');
