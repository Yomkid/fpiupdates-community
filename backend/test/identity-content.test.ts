import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usernameUnavailable, assignUsername, SYSTEM_NAMES } from '../src/usernames';
import { cleanPage } from '../src/site-content';
import { emailTemplate } from '../src/mail-template';

test('public availability protects system names, reservations and former handles while permitting the current owner', async () => {
  const data: any = {
    user: { findUnique: async () => null },
    usernameHold: { findUnique: async () => null },
  };
  data.usernameHold.findUnique = async ({ where }: any) =>
    where.username === 'fpiupdates' ? { expiresAt: null, ownerId: null } : null;
  assert.equal(await usernameUnavailable(data, 'fpiupdates'), true);
  assert.equal(await usernameUnavailable(data, 'new_user'), false);
  data.usernameHold.findUnique = async () => ({ expiresAt: null });
  assert.equal(await usernameUnavailable(data, 'new_user'), true);
  data.usernameHold.findUnique = async () => ({ expiresAt: new Date(0) });
  assert.equal(await usernameUnavailable(data, 'new_user'), false);
  data.user.findUnique = async () => ({ id: 'existing' });
  assert.equal(await usernameUnavailable(data, 'new_user', 'existing'), false);
  assert.equal(await usernameUnavailable(data, 'new_user', 'other'), true);
});
test('staff username assignment cannot displace another owner or allocate a system handle', async () => {
  const tx: any = {
    $queryRaw: async () => [],
    user: {
      findUniqueOrThrow: async () => ({ id: 'target', username: 'old' }),
      findUnique: async () => ({ id: 'someone-else' }),
    },
  };
  await assert.rejects(() => assignUsername(tx, 'target', 'occupied'), /already owns/);
  for (const name of SYSTEM_NAMES)
    await assert.rejects(() => assignUsername(tx, 'target', name), /non-system/);
});
test('managed pages remove active content, event handlers, unsafe links and protocol-relative links', () => {
  const html = cleanPage(
    '<h2>Help</h2><script>alert(1)</script><p onclick="bad()">Text</p><a href="javascript:alert(1)">bad</a><a href="//evil.example">bad</a><a href="https://example.com">safe</a>',
  );
  assert.match(html, /<h2>Help<\/h2>/);
  assert.doesNotMatch(html, /script|onclick|javascript:|href="\/\//);
  assert.match(html, /href="https:\/\/example.com"/);
});
test('account email templates escape user text and retain branded actions and fallback links', () => {
  const html = emailTemplate(
    '<Welcome>',
    'Hello <script> & friend',
    'https://example.test/verify-email#token=abc',
  );
  assert.match(html, /&lt;Welcome&gt;/);
  assert.match(html, /Hello &lt;script&gt; &amp; friend/);
  assert.match(html, /brand-logo-color.png/);
  assert.match(html, /https:\/\/example.test\/verify-email#token=abc/);
  assert.doesNotMatch(html, /<script>/);
});
