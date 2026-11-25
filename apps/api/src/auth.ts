import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { HttpError } from './http';

/** Constant-time comparison that also handles different-length inputs safely. */
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Decodes an HTTP Basic header into its username/password pair. */
export function parseBasicAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

/**
 * Protects dashboard API routes. Twilio webhooks are mounted separately and are
 * authenticated by signature instead. Credentials are optional in development so
 * the existing local workflow keeps working; config.ts requires them in production.
 */
export function basicAuth(req: Request, _res: Response, next: NextFunction): void {
  const { dashboardUser, dashboardPassword } = config;
  if (!dashboardUser || !dashboardPassword) {
    next();
    return;
  }

  const credentials = parseBasicAuth(req.header('authorization'));
  if (
    !credentials ||
    !equal(credentials.username, dashboardUser) ||
    !equal(credentials.password, dashboardPassword)
  ) {
    next(
      new HttpError('Authentication required', 401, {
        'WWW-Authenticate': 'Basic realm="IVR Dashboard", charset="UTF-8"',
      }),
    );
    return;
  }
  next();
}
