import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino();

declare global {
  namespace Express {
    interface Request {
      id: string;
      startTime: number;
      logger: any;
    }
  }
}

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Generate unique request ID
  req.id = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // Create child logger with request context
  req.logger = logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
  });

  // Log request
  req.logger.info({
    event: 'request_start',
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
    },
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    req.logger.info({
      event: 'request_end',
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
};

export const getLogger = (context: string) => {
  return logger.child({ context });
};
