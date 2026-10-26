import { test, expect } from '@playwright/test';
import { isPublicRoute, canShowMobileComposer } from '../src/access-policy';
import type { User } from '../src/api';
test('public reading never includes staff or account pages', () => {
  for (const path of [
    '/home',
    '/help',
    '/help/verification',
    '/help-verification',
    '/articles',
    '/articles/story',
    '/posts/id',
    '/u/person',
    '/sports/matches/id',
  ])
    expect(isPublicRoute(path), path).toBe(true);
  for (const path of [
    '/settings',
    '/settings/verification',
    '/admin',
    '/admin/discovery',
    '/sports/desk',
    '/messages',
    '/notifications',
    '/check-email',
  ])
    expect(isPublicRoute(path), path).toBe(false);
  const user = { username: 'person', emailVerified: true } as User;
  for (const path of ['/home', '/search', '/u/person'])
    expect(canShowMobileComposer(path, user)).toBe(true);
  for (const path of ['/settings', '/notifications', '/posts/id', '/u/another', '/admin'])
    expect(canShowMobileComposer(path, user)).toBe(false);
  expect(canShowMobileComposer('/home', null)).toBe(false);
  expect(canShowMobileComposer('/home', { ...user, emailVerified: false })).toBe(false);
});
