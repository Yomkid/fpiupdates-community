import 'reflect-metadata';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { Database } from '../../src/database';
import { configureApp } from '../../src/app';
let app: INestApplication, db: Database;
let memberToken: string, adminToken: string, memberId: string;
const stamp = Date.now().toString();
const ids: string[] = [];
before(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.TEST_DATABASE_URL === process.env.PRODUCTION_DATABASE_URL
  )
    throw Error('Use a disposable TEST_DATABASE_URL');
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DB_POOL_MAX: '1',
    EMAIL_TRANSPORT: 'file',
    PUBLISHING_WORKER_DISABLED: 'true',
    ANALYTICS_WORKER_DISABLED: 'true',
    WEB_PUSH_ENABLED: 'false',
  });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication({ logger: ['error'] });
  configureApp(app, ['http://localhost:5173']);
  await app.init();
  db = app.get(Database);
  for (const [suffix, isAdmin] of [
    ['a', true],
    ['b', false],
  ] as const) {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Test ' + suffix,
        email: `${stamp}${suffix}@example.test`,
        username: `i${stamp}${suffix}`,
        password: 'a long test password 123',
      })
      .expect(201);
    ids.push(result.body.user.id);
    await db.user.update({
      where: { id: result.body.user.id },
      data: { emailVerifiedAt: new Date() },
    });
    if (isAdmin) {
      adminToken = result.body.accessToken;
      const role = await db.role.findUniqueOrThrow({ where: { key: 'administrator' } });
      await db.userRole.create({ data: { userId: result.body.user.id, roleId: role.id } });
    } else {
      memberToken = result.body.accessToken;
      memberId = result.body.user.id;
    }
  }
});
after(async () => {
  if (db) {
    await db.featureSwitch.deleteMany({
      where: { key: { in: ['identityBadgeColours', 'organisationAvatars'] } },
    });
    await db.usernameHold.deleteMany({ where: { ownerId: { in: ids } } });
    await db.usernameHold.deleteMany({ where: { username: { startsWith: 'hold' + stamp } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await app?.close();
});
const admin = () => `Bearer ${adminToken}`,
  member = () => `Bearer ${memberToken}`;
test('reservation checks cover signup, availability and profile edits; ordinary members cannot manage them', async () => {
  const name = 'hold' + stamp;
  await request(app.getHttpServer())
    .put('/api/v1/admin/identity/holds/' + name)
    .set('Authorization', member())
    .send({ reason: 'Protect test organisation', release: false })
    .expect(403);
  await request(app.getHttpServer())
    .put('/api/v1/admin/identity/holds/' + name)
    .set('Authorization', admin())
    .send({ reason: 'Protect test organisation', release: false })
    .expect(200);
  const availability = await request(app.getHttpServer())
    .get('/api/v1/auth/username-availability?username=' + name)
    .expect(200);
  assert.equal(availability.body.available, false);
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      displayName: 'Blocked',
      email: `hold${stamp}@example.test`,
      username: name,
      password: 'a long test password 123',
    })
    .expect(409);
  await request(app.getHttpServer())
    .put('/api/v1/profile')
    .set('Authorization', member())
    .send({ username: name, displayName: 'Test member', bio: '' })
    .expect(409);
});
test('staff handle assignment retains identity and protects the former profile link', async () => {
  const old = await db.user.findUniqueOrThrow({ where: { id: memberId } });
  const name = 'hold' + stamp;
  await request(app.getHttpServer())
    .put('/api/v1/admin/identity/assign')
    .set('Authorization', admin())
    .send({ userId: memberId, username: name, reason: 'Verified representative assignment' })
    .expect(200);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: memberId } })).username, name);
  const profile = await request(app.getHttpServer())
    .get('/api/v1/users/' + old.username)
    .expect(200);
  assert.equal(profile.body.id, memberId);
  assert.equal(profile.body.username, name);
  const available = await request(app.getHttpServer())
    .get('/api/v1/auth/username-availability?username=' + old.username)
    .expect(200);
  assert.equal(available.body.available, false);
});
test('verification decisions are permission protected, user-visible, audited and distinct from email confirmation', async () => {
  const result = await request(app.getHttpServer())
    .post('/api/v1/identity/requests')
    .set('Authorization', member())
    .send({
      kind: 'VERIFICATION',
      category: 'BUSINESS',
      evidence:
        'Official public website https://example.test and independently confirmed contributor identity.',
    })
    .expect(201);
  const pending = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', member())
    .expect(200);
  assert.equal(pending.body.identityStatus, 'NONE');
  await request(app.getHttpServer())
    .put('/api/v1/profile')
    .set('Authorization', member())
    .send({
      displayName: 'Test b',
      bio: '',
      identityStatus: 'VERIFIED',
      identityCategory: 'BUSINESS',
    })
    .expect(400);
  await request(app.getHttpServer())
    .put('/api/v1/admin/identity/requests/' + result.body.id)
    .set('Authorization', member())
    .send({ status: 'APPROVED', decision: 'Checked public references' })
    .expect(403);
  await request(app.getHttpServer())
    .put('/api/v1/admin/identity/requests/' + result.body.id)
    .set('Authorization', admin())
    .send({ status: 'APPROVED', decision: 'Checked public references and authority' })
    .expect(200);
  const me = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', member())
    .expect(200);
  assert.equal(me.body.identityStatus, 'VERIFIED');
  assert.equal(me.body.identityCategory, 'BUSINESS');
  assert.equal(me.body.emailVerified, true);
  const notices = await request(app.getHttpServer())
    .get('/api/v1/identity/notices')
    .set('Authorization', member())
    .expect(200);
  assert.ok(notices.body.some((x: any) => x.message.includes('approved')));
  const audit = await db.auditLog.findFirst({
    where: { targetId: result.body.id, action: 'identity.request.review' },
  });
  assert.ok(audit);
});

test('an unchanged profile preserves a verified badge', async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: memberId } });
  const response = await request(app.getHttpServer())
    .put('/api/v1/profile')
    .set('Authorization', member())
    .send({ displayName: user.displayName, bio: user.bio ?? '' })
    .expect(200);
  assert.equal(response.body.identityStatus, 'VERIFIED');
});
test('changing a verified account name places its badge under review and notifies its owner', async () => {
  const result = await request(app.getHttpServer())
    .put('/api/v1/profile')
    .set('Authorization', member())
    .send({ displayName: 'Changed business name', bio: '' })
    .expect(200);
  assert.equal(result.body.identityStatus, 'REVIEW');
  const notices = await request(app.getHttpServer())
    .get('/api/v1/identity/notices')
    .set('Authorization', member())
    .expect(200);
  assert.ok(notices.body.some((n: any) => n.message.includes('under review')));
  assert.ok(
    await db.auditLog.findFirst({ where: { targetId: memberId, action: 'identity.review' } }),
  );
});
test('changing an approved organisation logo puts the badge under review', async () => {
  await db.user.update({ where: { id: memberId }, data: { identityStatus: 'VERIFIED' } });
  const logo = await db.media.create({
    data: { ownerId: memberId, kind: 'AVATAR', bytes: 1, width: 1, height: 1 },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: memberId } });
  const response = await request(app.getHttpServer())
    .put('/api/v1/profile')
    .set('Authorization', member())
    .send({ displayName: user.displayName, bio: user.bio ?? '', avatarMediaId: logo.id })
    .expect(200);
  assert.equal(response.body.identityStatus, 'REVIEW');
});
test('badge and organisation appearance switches default off, require permission, and are audited', async () => {
  const endpoint = request(app.getHttpServer());
  const initial = await endpoint.get('/api/v1/features').expect(200);
  assert.equal(initial.body.identityBadgeColours, false);
  assert.equal(initial.body.organisationAvatars, false);
  await endpoint
    .put('/api/v1/features')
    .set('Authorization', member())
    .send({ key: 'identityBadgeColours', enabled: true })
    .expect(403);
  await endpoint
    .put('/api/v1/features')
    .set('Authorization', admin())
    .send({ key: 'identityBadgeColours', enabled: true })
    .expect(200);
  await endpoint
    .put('/api/v1/features')
    .set('Authorization', admin())
    .send({ key: 'organisationAvatars', enabled: true })
    .expect(200);
  const current = await endpoint.get('/api/v1/features').expect(200);
  assert.equal(current.body.identityBadgeColours, true);
  assert.equal(current.body.organisationAvatars, true);
  assert.ok(
    await db.auditLog.findFirst({
      where: { action: 'features.update', targetId: 'identityBadgeColours' },
    }),
  );
  await db.featureSwitch.deleteMany({
    where: { key: { in: ['identityBadgeColours', 'organisationAvatars'] } },
  });
});
test('draft edits do not replace published pages; publishing sanitizes and preserves history', async () => {
  const slug = 'help-test-' + stamp;
  const first = {
    title: 'Testing help',
    category: 'Testing',
    html: '<h2>First</h2><script>bad()</script>',
    position: 0,
  };
  await request(app.getHttpServer())
    .put('/api/v1/admin/content/' + slug)
    .set('Authorization', member())
    .send(first)
    .expect(403);
  await request(app.getHttpServer())
    .put('/api/v1/admin/content/' + slug)
    .set('Authorization', admin())
    .send(first)
    .expect(200);
  await request(app.getHttpServer())
    .get('/api/v1/content/' + slug)
    .expect(404);
  await request(app.getHttpServer())
    .put('/api/v1/admin/content/' + slug + '/publish')
    .set('Authorization', admin())
    .send({ effectiveAt: new Date().toISOString(), confirm: true })
    .expect(200);
  await request(app.getHttpServer())
    .put('/api/v1/admin/content/' + slug)
    .set('Authorization', admin())
    .send({ ...first, html: '<p>Second draft</p>' })
    .expect(200);
  const live = await request(app.getHttpServer())
    .get('/api/v1/content/' + slug)
    .expect(200);
  assert.match(live.body.publishedHtml, /First/);
  assert.doesNotMatch(live.body.publishedHtml, /script|Second/);
  const history = await request(app.getHttpServer())
    .get('/api/v1/content/' + slug + '/history')
    .expect(200);
  assert.equal(history.body.length, 1);
  await db.siteDocumentVersion.deleteMany({ where: { slug } });
  await db.siteDocument.delete({ where: { slug } });
});
