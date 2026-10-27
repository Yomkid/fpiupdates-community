import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedPushEndpoint, PushService } from '../src/pwa';
import { metadata, renderPublicHtml, publicPage } from '../src/public-pages';
import { validateCampaignDates, AdsReviewController } from '../src/ads';
test('push endpoints reject arbitrary hosts, credentials and private network URLs', () => {
  for (const s of [
    'https://fcm.googleapis.com/token',
    'https://updates.push.services.mozilla.com/token',
    'https://web.push.apple.com/token',
    'https://wns2.notify.windows.com/token',
  ])
    assert.ok(allowedPushEndpoint(s));
  for (const s of [
    'http://fcm.googleapis.com/token',
    'https://127.0.0.1/private',
    'https://user@fcm.googleapis.com/token',
    'https://fcm.googleapis.com.evil.test/token',
    'https://fcm.googleapis.com:444/token',
  ])
    assert.equal(allowedPushEndpoint(s), false);
});
test('public HTML escapes text and excludes private pages from indexing', () => {
  const p = {
    title: '<script>bad</script>',
    description: '" bad',
    path: '/posts/one',
    public: true,
  };
  const html = renderPublicHtml('<head><title>old</title></head><div id="root"></div>', p);
  assert.ok(!html.includes('<script>bad'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(html.includes('<article>'));
  assert.ok(metadata({ ...p, public: false }).includes('noindex,nofollow'));
});
test('unavailable previews apply public visibility filters without returning hidden text', async () => {
  let where: any;
  const db = {
    post: {
      findFirst: async (q: any) => {
        where = q.where;
        return null;
      },
    },
  };
  const p = await publicPage(db as any, '/posts/11111111-1111-4111-8111-111111111111');
  assert.equal(p.public, false);
  assert.equal(p.missing, true);
  assert.equal(where.status, 'PUBLISHED');
  assert.equal(where.deletedAt, null);
  assert.equal(where.author.status, 'ACTIVE');
});
test('campaign dates reject past, reversed and excessive schedules', () => {
  const n = Date.now();
  assert.doesNotThrow(() => validateCampaignDates(new Date(n + 60000), new Date(n + 86400000), n));
  for (const [a, b] of [
    [n - 120000, n + 60000],
    [n + 60000, n],
    [n, n + 31 * 86400000],
    [n + 91 * 86400000, n + 92 * 86400000],
  ])
    assert.throws(() => validateCampaignDates(new Date(a), new Date(b), n));
});
test('expired sessions stop push delivery', async () => {
  let removed = 0,
    sent = 0;
  const db = {
    pushDevice: {
      findMany: async () => [{ id: 'd', sessionId: 's', userId: 'u' }],
      updateMany: async () => ({ count: 1 }),
      deleteMany: async () => {
        removed++;
      },
    },
    session: { findFirst: async () => null },
  };
  const service = new PushService(db as any);
  Object.defineProperty(service, 'enabled', { get: () => true });
  service.send = async () => {
    sent++;
  };
  await service.tick();
  assert.equal(removed, 1);
  assert.equal(sent, 0);
});
test('push failure retains cursor and schedules retries, expired endpoint is removed', async () => {
  const writes: any[] = [];
  let removed = 0,
    status = 503;
  const db = {
    pushDevice: {
      findMany: async () => [
        { id: 'd', sessionId: 's', userId: 'u', cursor: new Date(0), failures: 0 },
      ],
      updateMany: async (q: any) => {
        writes.push(q);
        return { count: 1 };
      },
      deleteMany: async () => {
        removed++;
      },
    },
    session: { findFirst: async () => ({ id: 's' }) },
    notification: { count: async () => 1 },
  };
  const service = new PushService(db as any);
  Object.defineProperty(service, 'enabled', { get: () => true });
  service.send = async () => {
    throw { statusCode: status };
  };
  await service.tick();
  assert.equal(writes[1].data.cursor, undefined);
  assert.deepEqual(writes[1].data.failures, { increment: 1 });
  status = 410;
  await service.tick();
  assert.equal(removed, 1);
});
test('review cannot approve the reviewer’s own campaign', async () => {
  let where: any;
  const db = {
    $transaction: async (fn: any) =>
      fn({
        adCampaign: {
          updateMany: async (q: any) => {
            where = q.where;
            return { count: 0 };
          },
        },
      }),
  };
  await assert.rejects(() =>
    new AdsReviewController(db as any).review('id', { status: 'APPROVED', note: 'Reviewed' }, {
      account: { id: 'reviewer' },
    } as any),
  );
  assert.deepEqual(where.ownerId, { not: 'reviewer' });
});

test('public profile preview uses its avatar and removes generic sharing tags', async () => {
  let query: any;
  const db = { user: { findFirst: async (q: any) => { query = q; return { username: 'reader', displayName: 'A Reader', bio: 'Hello', avatarMediaId: '11111111-1111-4111-8111-111111111111' }; } } };
  const profile = await publicPage(db as any, '/u/reader');
  assert.equal(query.where.status, 'ACTIVE');
  assert.equal(profile.image, '11111111-1111-4111-8111-111111111111');
  assert.match(metadata(profile), /\/api\/v1\/media\/11111111-1111-4111-8111-111111111111/);
  assert.match(metadata(profile), /name="twitter:card" content="summary"/);
  const html = renderPublicHtml('<head><title>generic</title><meta property="og:image" content="old"><meta name="twitter:card" content="old"></head><div id="root"></div>', profile);
  assert.equal((html.match(/property="og:image"/g) || []).length, 1);
  assert.equal((html.match(/name="twitter:card"/g) || []).length, 1);
  assert.ok(!html.includes('content="old"'));
});

test('profile without an avatar uses the default card and unavailable profiles stay private', async () => {
  const db = { user: { findFirst: async () => ({ username: 'reader', displayName: 'Reader', bio: '', avatarMediaId: null }) } };
  const profile = await publicPage(db as any, '/u/reader');
  assert.match(metadata(profile), /fpiupdates-share-v1\.png/);
  const missing = await publicPage({ user: { findFirst: async () => null } } as any, '/u/reader');
  assert.equal(missing.public, false);
  assert.match(metadata(missing), /noindex,nofollow/);
});
