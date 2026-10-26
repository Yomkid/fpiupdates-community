import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, tokenHash, newToken } from '../src/security';
import { loadConfig, utcDatabaseUrl } from '../src/config';
import { decodeCursor } from '../src/posts';
test('passwords use independent salts and reject wrong passwords', async () => {
  const one = await hashPassword('correct horse battery staple');
  const two = await hashPassword('correct horse battery staple');
  assert.notEqual(one, two);
  assert.equal(await verifyPassword('correct horse battery staple', one), true);
  assert.equal(await verifyPassword('incorrect', one), false);
  assert.equal(await verifyPassword('incorrect', 'corrupt'), false);
});
test('sessions use random tokens with deterministic one-way fingerprints', () => {
  const one = newToken();
  const two = newToken();
  assert.notEqual(one, two);
  assert.equal(one.length, 43);
  assert.equal(tokenHash(one).length, 64);
  assert.notEqual(tokenHash(one), one);
});
test('configuration rejects unsafe or malformed settings', () => {
  const base = { DATABASE_URL: 'postgresql://user:password@localhost/db' };
  assert.equal(loadConfig(base).poolMax, 3);
  const connection = new URL(
    utcDatabaseUrl(base.DATABASE_URL + '?sslmode=require&options=-c%20statement_timeout%3D5000'),
  );
  assert.equal(connection.username, 'user');
  assert.equal(connection.password, 'password');
  assert.equal(connection.searchParams.get('sslmode'), 'require');
  assert.equal(connection.searchParams.get('options'), '-c statement_timeout=5000 -c timezone=UTC');
  assert.throws(() => loadConfig({ ...base, DB_POOL_MAX: '100' }));
  assert.throws(() => loadConfig({ ...base, FRONTEND_ORIGINS: '*' }));
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' }));
  assert.throws(() => loadConfig({ PORT: '3000' }));
});
test('malformed pagination cursors fail before querying the database', () => {
  assert.throws(() => decodeCursor('nonsense'));
  assert.throws(() =>
    decodeCursor(Buffer.from(JSON.stringify({ id: 'abc', at: 'yesterday' })).toString('base64url')),
  );
});
