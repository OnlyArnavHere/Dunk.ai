import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { COOKIE_NAMES } from '../constants/index.js';

// ---- JWT Signing ----

export const signAccessToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role, name: user.name }, env.accessSecret, {
    expiresIn: env.accessTtl,
  });

export const signRefreshToken = (user, sessionId) =>
  jwt.sign({ sub: user._id.toString(), sid: sessionId, role: user.role }, env.refreshSecret, {
    expiresIn: env.refreshTtl,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.accessSecret);

/**
 * A two-minute token for the Socket.io handshake, and nothing else.
 *
 * The socket connects straight to the backend's own origin, while the auth
 * cookies belong to the frontend's (API calls go through its /api rewrite).
 * Locally both are `localhost`, so the cookie rode along and this was never
 * needed; hosted on two domains, the handshake arrived with no cookie and every
 * socket was refused. The browser fetches this through the same-origin API and
 * hands it to `io({ auth })`. `scope: 'socket'` stops it being replayed as an
 * API bearer token (see middleware/auth.js).
 */
export const signSocketToken = (user) =>
  jwt.sign({ sub: user._id.toString(), scope: 'socket' }, env.accessSecret, { expiresIn: '2m' });
export const verifyRefreshToken = (token) => jwt.verify(token, env.refreshSecret);

// ---- Token hashing (for secure storage) ----

export const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ---- Password reset token generation ----

export const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  const expires = new Date(Date.now() + env.resetTokenExpiry * 60 * 1000);
  return { rawToken, hashedToken, expires };
};

// ---- Email verification token ----

export const generateVerificationToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  return { rawToken, hashedToken };
};

// ---- Cookie helpers ----

// sameSite 'lax', not 'strict': the Google OAuth callback is a top-level
// navigation that starts on google.com, and a strict cookie set during it is
// withheld on the redirect into the app, so the user lands logged out.
const baseCookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  path: '/',
};

export const getAccessTokenCookieOptions = () => ({
  ...baseCookieOptions,
  maxAge: 15 * 60 * 1000, // 15 minutes
});

export const getRefreshTokenCookieOptions = () => ({
  ...baseCookieOptions,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
});

export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, getAccessTokenCookieOptions());
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, getRefreshTokenCookieOptions());
};

export const clearAuthCookies = (res) => {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { ...baseCookieOptions });
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { ...baseCookieOptions });
};

export const extractTokensFromCookies = (req) => ({
  accessToken: req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN],
  refreshToken: req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN],
});
