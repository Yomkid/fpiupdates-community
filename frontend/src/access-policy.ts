import type { User } from './api';
/** Public reading is independent of whether an existing session confirmed its email. */
export function isPublicRoute(path: string) {
  return /^\/(?:$|home\/?$|search\/?$|people\/?$|articles(?:\/[^/]+)?\/?$|posts\/[^/]+\/?$|u\/[^/]+\/?$|help(?:\/[^/]+|-[a-z0-9-]+)?\/?$|faq\/?$|privacy\/?$|terms\/?$|guidelines\/?$|about\/?$|install\/?$|advertise\/?$|stats\/?$|tags(?:\/[^/]+)?\/?$|communities(?:\/[^/]+)?\/?$|sports(?:\/matches\/[^/]+|\/(?!desk(?:\/|$))[^/]+)?\/?$|verify-email\/?$|forgot-password\/?$|reset-password\/?$)/.test(
    path,
  );
}
export function canShowMobileComposer(path: string, user: User | null) {
  return (
    !!user?.emailVerified &&
    (path === '/home' || path === '/search' || path === '/me' || path === '/u/' + user.username)
  );
}
