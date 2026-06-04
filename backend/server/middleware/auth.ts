/**
 * JWT Authentication Middleware
 * 
 * Protects all /api/* routes. Verifies the Bearer token issued by Supabase Auth.
 * Attaches the decoded userId to req.user so downstream handlers don't need to
 * re-validate or trust a userId from the request body.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email?: string; role?: string };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Supabase JWTs use 'sub' as the user ID
    req.user = {
      userId: decoded.sub || decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
  }
}

/**
 * Optional auth — attaches user if token present, but does not block unauthenticated requests.
 * Use for public endpoints that have enhanced behaviour when authenticated.
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        userId: decoded.sub || decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
    } catch {
      // silently ignore invalid token for optional auth
    }
  }
  next();
}
