import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OAuth2Client } from 'google-auth-library';
import { deliverEmail } from '../src/email-delivery';
test('Gmail API sends a MIME message over HTTPS without SMTP and propagates failures', async () => {
  const original = { ...process.env };
  const calls: any[] = [];
  const request = mock.method(OAuth2Client.prototype, 'request', (async (opts: any) => {
    calls.push(opts);
    return { data: { id: 'accepted' } };
  }) as any);
  try {
    Object.assign(process.env, {
      EMAIL_TRANSPORT: 'gmail-api',
      GMAIL_CLIENT_ID: 'test-client',
      GMAIL_CLIENT_SECRET: 'test-secret',
      GMAIL_REFRESH_TOKEN: 'test-refresh',
      SMTP_FROM: 'FpiUpdates <sender@gmail.com>',
    });
    await deliverEmail({
      to: 'recipient@example.com',
      subject: 'Verify FpiUpdates',
      text: 'https://staging.example/verify-email#token=test-token',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].retry, false);
    const raw = calls[0].data.raw;
    assert.match(raw, /^[A-Za-z0-9_-]+$/);
    const mime = Buffer.from(raw, 'base64url').toString();
    assert.match(mime, /From: FpiUpdates <sender@gmail.com>/);
    assert.match(mime, /To: recipient@example.com/);
    assert.match(mime, /Subject: Verify FpiUpdates/);
    assert.match(mime, /verify-email#token=test-token/);
    assert.ok(!mime.includes('test-secret') && !mime.includes('test-refresh'));
    request.mock.mockImplementation((async () => {
      throw Error('Provider unavailable');
    }) as any);
    await assert.rejects(
      () => deliverEmail({ to: 'recipient@example.com', subject: 'Test', text: 'Test' }),
      /Provider unavailable/,
    );
  } finally {
    request.mock.restore();
    for (const k of Object.keys(process.env)) if (!(k in original)) delete process.env[k];
    Object.assign(process.env, original);
  }
});
test('unconfigured Gmail and unknown transports fail before contacting a provider', async () => {
  const original = { ...process.env };
  try {
    process.env.EMAIL_TRANSPORT = 'gmail-api';
    delete process.env.GMAIL_REFRESH_TOKEN;
    await assert.rejects(
      () => deliverEmail({ to: 'recipient@example.com', subject: 'Test', text: 'Test' }),
      /incomplete/,
    );
    process.env.EMAIL_TRANSPORT = 'unknown';
    await assert.rejects(
      () => deliverEmail({ to: 'recipient@example.com', subject: 'Test', text: 'Test' }),
      /Unknown/,
    );
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in original)) delete process.env[k];
    Object.assign(process.env, original);
  }
});
