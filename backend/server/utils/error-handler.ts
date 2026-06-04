import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.id || `req-${Date.now()}`;

  // Log full error details
  logger.error({
    requestId,
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    errorCode: err.code || 'INTERNAL_ERROR',
    message: err.message,
    stack: err.stack,
    details: err.details,
    body: req.body,
  });

  // Send error response
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    error: {
      code,
      message: err.message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        details: err.details,
        stack: err.stack,
      }),
    },
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error codes
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CANVAS_API_ERROR: 'CANVAS_API_ERROR',
  AGENT_ERROR: 'AGENT_ERROR',
  BRAIN_ERROR: 'BRAIN_ERROR',
};

// Error factory functions
export const createValidationError = (message: string, details?: any) =>
  new AppError(400, message, ErrorCodes.VALIDATION_ERROR, details);

export const createAuthError = (message: string) =>
  new AppError(401, message, ErrorCodes.AUTHENTICATION_ERROR);

export const createAuthorizationError = (message: string) =>
  new AppError(403, message, ErrorCodes.AUTHORIZATION_ERROR);

export const createNotFoundError = (resource: string) =>
  new AppError(404, `${resource} not found`, ErrorCodes.NOT_FOUND);

export const createConflictError = (message: string) =>
  new AppError(409, message, ErrorCodes.CONFLICT);

export const createRateLimitError = () =>
  new AppError(429, 'Rate limit exceeded', ErrorCodes.RATE_LIMIT);

export const createExternalServiceError = (service: string, message: string) =>
  new AppError(502, `${service} service error: ${message}`, ErrorCodes.EXTERNAL_SERVICE_ERROR);

export const createDatabaseError = (message: string, details?: any) =>
  new AppError(500, `Database error: ${message}`, ErrorCodes.DATABASE_ERROR, details);

export const createAgentError = (agent: string, message: string, details?: any) =>
  new AppError(500, `${agent} agent error: ${message}`, ErrorCodes.AGENT_ERROR, details);

export const createBrainError = (message: string, details?: any) =>
  new AppError(500, `Brain error: ${message}`, ErrorCodes.BRAIN_ERROR, details);
