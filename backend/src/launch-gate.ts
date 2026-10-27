import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Database } from './database';
import { tokenHash } from './security';

export const PUBLIC_LAUNCH_PAGES = ['about', 'help', 'privacy', 'terms'] as const;
const COOKIE = 'fpi_launch_access';
const equal = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const cookie = (req: Request, name: string) => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) || '';

/** Fail closed if the configuration cannot be read. Production enables this in Render. */
export function createLaunchGate(db: Database, env: NodeJS.ProcessEnv = process.env, now = () => Date.now()) {
  const enabled = env.LAUNCH_GATE_ENABLED === 'true';
  const secret = env.LAUNCH_GATE_SECRET || '';
  if (enabled && secret.length < 32) throw new Error('LAUNCH_GATE_SECRET must have at least 32 characters');
  const signature = (expiry: string) => createHmac('sha256', secret).update(`fpi-launch:${expiry}`).digest('hex');
  const emergencyAccess = (req: Request) => {
    if (!enabled) return false;
    const [expiry, mac, extra] = cookie(req, COOKIE).split('.');
    return !extra && /^\d+$/.test(expiry || '') && Number(expiry) > now() && /^[a-f0-9]{64}$/.test(mac || '') && equal(mac, signature(expiry));
  };
  const attempts = new Map<string, { count: number; until: number }>();
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    res.setHeader('Cache-Control', 'no-store');
    if (!enabled) {
      if (path === '/api/v1/launch/status') return res.json({ configured: false, locked: false });
      return next();
    }
    if (path === '/api/v1/health' || path === '/api/v1/health/ready') return next();
    if (path === '/api/v1/launch/access' && req.method === 'POST') {
      const key = req.ip || 'unknown';
      if (attempts.size > 10000) for (const [k, value] of attempts) if (value.until <= now()) attempts.delete(k);
      const entry = attempts.get(key), window = entry && entry.until > now() ? entry : { count: 0, until: now() + 60000 };
      if (window.count >= 5) return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
      window.count++; attempts.set(key, window);
      const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
      if (!passcode || passcode.length > 256 || !equal(passcode, secret)) return res.status(401).json({ message: 'That access code is not correct.' });
      attempts.delete(key);
      const expiry = String(now() + 86400000);
      res.cookie(COOKIE, `${expiry}.${signature(expiry)}`, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400000 });
      return res.json({ allowed: true });
    }
    try {
      const settings = await db.launchControl.findUnique({ where: { id: 'platform' } });
      if (!settings || !['OPEN', 'COUNTDOWN', 'MAINTENANCE'].includes(settings.mode)) throw new Error('Launch settings missing');
      const locked = settings.mode === 'MAINTENANCE' || (settings.mode === 'COUNTDOWN' && now() < settings.launchAt.getTime());
      let allowed = !locked || emergencyAccess(req);
      if (!allowed) {
        const auth = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
        const token = auth?.[1] || (!req.headers.authorization ? cookie(req, 'fpi_session') : '');
        if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
          const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { include: { roles: { include: { role: true } } } } } });
          if (session && session.expiresAt.getTime() > now() && session.user.status === 'ACTIVE')
            allowed = settings.allowedUserIds.includes(session.user.id) || session.user.roles.some(x => x.role.permissions.includes('features.manage'));
        }
      }
      if (path === '/api/v1/launch/status' && req.method === 'GET') return res.json({ configured: true, locked, allowed, mode: settings.mode, launchAt: settings.launchAt.toISOString(), title: settings.title, message: settings.message, allowedPages: settings.allowedPages, serverTime: new Date(now()).toISOString() });
      if (allowed) return next();
      if (req.method === 'POST' && ['/api/v1/auth/browser/login', '/api/v1/auth/logout'].includes(path)) return next();
      if (req.method === 'GET' && /^\/api\/v1\/content\/(about|help|privacy|terms)$/.test(path) && settings.allowedPages.includes(path.split('/').pop() || '')) return next();
      return res.status(503).json({ message: 'FpiUpdates is temporarily unavailable.', code: 'SITE_RESTRICTED' });
    } catch {
      return res.status(503).json({ message: 'FpiUpdates is temporarily unavailable. Please try again shortly.', code: 'SITE_UNAVAILABLE' });
    }
  };
}
