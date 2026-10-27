import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type { Database } from '../src/database';
import { createLaunchGate } from '../src/launch-gate';

const target = Date.parse('2026-10-30T17:00:00Z'), secret = 'a-private-test-passcode-with-32-characters';
const settings = () => ({ mode: 'COUNTDOWN', launchAt: new Date(target), title: 'Coming soon', message: 'Welcome', allowedPages: [] as string[], allowedUserIds: [] as string[] });
function appAt(time: number, config = settings(), session: unknown = null, fail = false) {
  const app = express();
  const db = { launchControl: { findUnique: async () => { if (fail) throw new Error('offline'); return config; } }, session: { findUnique: async () => session } } as unknown as Database;
  app.use(express.json()); app.use(createLaunchGate(db, { LAUNCH_GATE_ENABLED: 'true', LAUNCH_GATE_SECRET: secret }, () => time));
  app.get('/api/v1/posts', (_req, res) => res.json({ posts: [] })); app.get('/api/v1/health', (_req, res) => res.send('ok'));
  app.get('/api/v1/content/help', (_req, res) => res.send('public')); app.post('/api/v1/content/help', (_req, res) => res.send('write'));
  app.get('/anything', (_req, res) => res.send('private'));
  return app;
}
test('countdown blocks API and Render pages while keeping health and status available', async () => {
  const app = appAt(target - 1000);
  assert.equal((await request(app).get('/api/v1/posts')).status, 503);
  assert.equal((await request(app).get('/anything')).status, 503);
  assert.equal((await request(app).get('/api/v1/health')).status, 200);
  const response = await request(app).get('/api/v1/launch/status'); assert.equal(response.body.locked, true); assert.equal(response.body.allowed, false);
});
test('emergency access requires a valid secret and signed cookie', async () => {
  const app = appAt(target - 1000);
  assert.equal((await request(app).post('/api/v1/launch/access').send({passcode:'wrong'})).status, 401);
  const response = await request(app).post('/api/v1/launch/access').send({passcode:secret}); assert.equal(response.status, 200);
  const cookie = response.headers['set-cookie']; assert.ok(cookie);
  assert.equal((await request(app).get('/api/v1/posts').set('Cookie', cookie)).status, 200);
  assert.equal((await request(app).get('/api/v1/posts').set('Cookie', 'fpi_launch_access=9999999999999.bad')).status, 503);
});
test('authorised account and staff can enter; others cannot', async () => {
  const config = settings(); config.allowedUserIds = ['person'];
  const session = { expiresAt: new Date(target), user: { id: 'person', status: 'ACTIVE', roles: [] } };
  const app = appAt(target - 1000, config, session), token = 'a'.repeat(43);
  assert.equal((await request(app).get('/api/v1/posts').set('Cookie', `fpi_session=${token}`)).status, 200);
  config.allowedUserIds = []; assert.equal((await request(app).get('/api/v1/posts').set('Cookie', `fpi_session=${token}`)).status, 503);
  const staff = { ...session, user: { ...session.user, roles: [{role:{permissions:['features.manage']}}] } };
  assert.equal((await request(appAt(target-1000, config, staff)).get('/api/v1/posts').set('Cookie', `fpi_session=${token}`)).status, 200);
});
test('public information pages allow only selected reads', async () => {
  const config = settings(); config.allowedPages = ['help']; const app = appAt(target - 1000, config);
  assert.equal((await request(app).get('/api/v1/content/help')).status, 200);
  assert.equal((await request(app).post('/api/v1/content/help')).status, 503);
  assert.equal((await request(app).get('/api/v1/content/privacy')).status, 503);
});
test('countdown opens at server time; maintenance stays closed; database failure fails closed', async () => {
  assert.equal((await request(appAt(target)).get('/api/v1/posts')).status, 200);
  const config = settings(); config.mode = 'MAINTENANCE'; assert.equal((await request(appAt(target, config)).get('/api/v1/posts')).status, 503);
  assert.equal((await request(appAt(target, config, null, true)).get('/api/v1/posts')).status, 503);
  assert.throws(() => createLaunchGate({} as Database, { LAUNCH_GATE_ENABLED: 'true' }));
});
