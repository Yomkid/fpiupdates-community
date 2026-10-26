import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { tokenHash } from './security';
import { SESSION_COOKIE } from './auth';
const skipIf = (context: ExecutionContext) =>
  context.getClass().name !== 'NotificationsController' || context.getHandler().name !== 'sync';
// Campus Wi-Fi users can share a public IP. Keep a separate session allowance
// for frequent sync while retaining an IP-wide backstop for abusive clients.
export const notificationThrottles: ThrottlerOptions[] = [
  {
    name: 'contacts-ip',
    ttl: 60000,
    limit: 60,
    skipIf: (context) =>
      context.getClass().name !== 'PeopleController' || context.getHandler().name !== 'contacts',
  },
  {
    name: 'media-ip',
    ttl: 60000,
    limit: 120,
    skipIf: (context) =>
      context.getClass().name !== 'MediaController' || context.getHandler().name !== 'upload',
  },
  { name: 'notification-ip', ttl: 60000, limit: 1800, skipIf },
  { name: 'notification-session', ttl: 60000, limit: 60, skipIf, getTracker: sessionTracker },
];

export function sessionTracker(req: any) {
  const authorization = req.headers?.authorization;
  let token: string | undefined;
  if (typeof authorization === 'string')
    token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization)?.[1];
  else if (typeof req.headers?.cookie === 'string') {
    const raw = req.headers.cookie
      .split(';')
      .map((v: string) => v.trim())
      .find((v: string) => v.startsWith(SESSION_COOKIE + '='))
      ?.slice(SESSION_COOKIE.length + 1);
    if (raw && /^[A-Za-z0-9_-]{43}$/.test(raw)) token = raw;
  }
  return token ? tokenHash(token) : 'anonymous:' + req.ip;
}
