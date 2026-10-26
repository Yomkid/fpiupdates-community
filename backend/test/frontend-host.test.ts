import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { hostFrontend } from '../src/frontend-host';
test('single-origin hosting serves SPA/static files without swallowing API errors or exposing dotfiles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fpi-frontend-'));
  const old = process.env.SERVE_FRONTEND,
    oldDir = process.env.FRONTEND_DIRECTORY;
  try {
    await mkdir(join(dir, 'assets'));
    await mkdir(join(dir, 'pwa'));
    await writeFile(join(dir, 'pwa/icon-192.png'), 'placeholder');
    await writeFile(join(dir, 'index.html'), '<html>Public app shell</html>');
    await writeFile(join(dir, 'notification-worker.js'), '// public worker');
    await writeFile(join(dir, 'assets/app-123abc.js'), 'console.log("public")');
    await writeFile(join(dir, '.env'), 'PRIVATE_NOT_PUBLIC');
    process.env.SERVE_FRONTEND = 'true';
    process.env.FRONTEND_DIRECTORY = dir;
    const app = express();
    hostFrontend({ use: app.use.bind(app), get: () => ({}) } as any);
    await request(app).get('/home').expect(200).expect('Content-Type', /html/);
    const api = await request(app).get('/api/v1/missing').expect(404);
    assert.ok(!api.text.includes('Public app shell'));
    await request(app).get('/assets/missing.js').expect(404);
    const dot = await request(app).get('/.env');
    assert.ok(!dot.text.includes('PRIVATE_NOT_PUBLIC'));
    await request(app)
      .get('/notification-worker.js')
      .expect(200)
      .expect('Cache-Control', 'no-cache');
    await request(app)
      .get('/assets/app-123abc.js')
      .expect(200)
      .expect('Cache-Control', /immutable/);
  } finally {
    if (old === undefined) delete process.env.SERVE_FRONTEND;
    else process.env.SERVE_FRONTEND = old;
    if (oldDir === undefined) delete process.env.FRONTEND_DIRECTORY;
    else process.env.FRONTEND_DIRECTORY = oldDir;
    await rm(dir, { recursive: true, force: true });
  }
});
