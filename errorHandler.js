'use strict';

/**
 * Maps common error names / codes to HTTP status codes.
 */
const ERROR_STATUS_MAP = {
  ValidationError: 400,
  BadRequestError: 400,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  TooManyRequestsError: 429,

  // AWS SDK error codes
  UsernameExistsException: 409,
  UserNotFoundException: 404,
  NotAuthorizedException: 401,
  UserNotConfirmedException: 403,
  InvalidPasswordException: 400,
  CodeMismatchException: 400,
  ExpiredCodeException: 410,
  LimitExceededException: 429,
  TooManyRequestsException: 429,
  ResourceNotFoundException: 404,
  ConditionalCheckFailedException: 409,
};

/**
 * Global Express error handler.
 *
 * Must be registered LAST (after all routes) in the Express app.
 * Signature `(err, req, res, next)` is required by Express to recognise
 * this as an error-handling middleware.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Always log the full error server-side for observability.
  console.error('[errorHandler]', {
    message: err.message,
    code: err.code || err.name,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Prefer an explicit statusCode set on the error object, then look up by
  // name/code, then fall back to 500.
  const status =
    err.statusCode ||
    err.status ||
    ERROR_STATUS_MAP[err.name] ||
    ERROR_STATUS_MAP[err.code] ||
    500;

  // Derive a safe message — never expose raw internal errors in production.
  let message = err.message || 'An unexpected error occurred.';
  if (status === 500 && process.env.NODE_ENV === 'production') {
    message = 'An unexpected error occurred. Please try again later.';
  }

  // Use err.code if available, otherwise derive from the HTTP status.
  const code =
    err.code ||
    err.name ||
    (status === 400 ? 'BAD_REQUEST' :
     status === 401 ? 'UNAUTHORIZED' :
     status === 403 ? 'FORBIDDEN' :
     status === 404 ? 'NOT_FOUND' :
     status === 409 ? 'CONFLICT' :
     status === 429 ? 'TOO_MANY_REQUESTS' :
     'INTERNAL_SERVER_ERROR');

  return res.status(status).json({
    success: false,
    message,
    code,
  });
}

/**
 * Small helper to create structured errors that the errorHandler understands.
 * Usage: throw createError('User not found', 404, 'NOT_FOUND');
 */
function createError(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

module.exports = { errorHandler, createError };
