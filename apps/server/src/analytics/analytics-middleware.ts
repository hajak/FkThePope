import type { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';

// Simple token storage (in production, use Redis or similar)
const validTokens = new Set<string>();
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function getPassword(): string {
  return process.env.ANALYTICS_PASSWORD || 'whist-analytics-2024';
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function analyticsAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (validTokens.has(token)) {
      next();
      return;
    }
  }

  // Check query param (for testing)
  const queryToken = req.query.token as string;
  if (queryToken && validTokens.has(queryToken)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized', message: 'Valid token required' });
}

export function analyticsLoginHandler(req: Request, res: Response): void {
  const { password } = req.body as { password?: string };

  if (!password) {
    res.status(400).json({ error: 'Bad Request', message: 'Password required' });
    return;
  }

  const expectedPassword = getPassword();

  if (password !== expectedPassword) {
    console.log('[Analytics] Failed login attempt');
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid password' });
    return;
  }

  // Generate new token
  const token = generateToken();
  validTokens.add(token);

  // Auto-expire token
  setTimeout(() => {
    validTokens.delete(token);
  }, TOKEN_EXPIRY);

  console.log('[Analytics] Successful login');
  res.json({ token, expiresIn: TOKEN_EXPIRY });
}

export function analyticsLogoutHandler(req: Request, res: Response): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    validTokens.delete(token);
  }
  res.json({ success: true });
}
