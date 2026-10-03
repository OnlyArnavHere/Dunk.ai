import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { send } from '../utils/response.js';
import { ActivityLog } from '../models/ActivityLog.js';

// Mongoose duplicate key error
const handleDuplicateKeyError = (err) => {
  const match = err.message.match(/["']([^"']+)["']/);
  const value = match?.[1] || 'value';
  const message = `${value} already exists`;
  return new ApiError(409, message);
};

// Mongoose validation error
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
  }));
  return new ApiError(400, 'Validation failed', errors);
};

// JWT errors
const handleJWTError = () => ApiError.unauthorized('Invalid token. Please log in again.');
const handleJWTExpiredError = () =>
  ApiError.unauthorized('Your token has expired. Please log in again.');

// Multer file size error
const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiError.badRequest(`File too large. Maximum size is ${env.maxFileSize / 1024 / 1024}MB`);
  }
  return ApiError.badRequest(err.message || 'File upload error');
};

export const notFound = (req, _res, next) =>
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // Transform known error types
  if (err.code === 11000) error = handleDuplicateKeyError(err);
  else if (err.name === 'ValidationError') error = handleValidationError(err);
  else if (err.name === 'JsonWebTokenError') error = handleJWTError();
  else if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
  else if (err.name === 'MulterError') error = handleMulterError(err);

  const statusCode = error.statusCode || 500;
  const errors = error.errors || [];
  // Unexpected errors are hidden in production; an ApiError we raised on
  // purpose (e.g. "Supervisor Agent is unavailable") is meant to be read.
  const message =
    statusCode >= 500 && env.isProduction && !error.isOperational
      ? 'Internal server error'
      : error.message || 'Something went wrong';

  // Log 5xx errors
  if (statusCode >= 500) {
    console.error('Server Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?._id,
    });

    // Log to database (fire and forget)
    ActivityLog.create({
      user: req.user?._id,
      action: 'error',
      method: req.method,
      path: req.originalUrl,
      statusCode,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || '',
      error: err.message,
    }).catch(() => {});
  }

  send(res, { status: statusCode, message, errors });
};
