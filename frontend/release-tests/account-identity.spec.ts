import { test } from '@playwright/test';
import assert from 'node:assert/strict';
test('account entry, admin controls, content preview and badge dialogs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let user: any = null;
  await page.route('**/api/v1/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/auth/me'))
      return route.fulfill({
        status: user ? 200 : 401,
        json: user ?? { message: 'Not signed in' },
      });
    if (p.endsWith('/auth/providers')) return route.fulfill({ json: { google: true } });
    if (p.endsWith('/auth/username-availability'))
      return route.fulfill({ json: { available: true, valid: true } });
    if (p.endsWith('/auth/username-suggestions')) return route.fulfill({ json: ['test_person'] });
    if (p.endsWith('/auth/browser/register')) {
      user = {
        id: 'test',
        username: 'test_person',
        displayName: 'Test Person',
        email: 'test@example.test',
        emailVerified: false,
        bio: null,
        permissions: [],
        roles: [],
      };
      return route.fulfill({ json: { ok: true } });
    }
    if (p.endsWith('/account/send-verification'))
      return route.fulfill({ json: { message: 'Verification requested' } });
    if (p.includes('/discovery/sidebar'))
      return route.fulfill({
        json: {
          announcement: null,
          sponsored: null,
          trends: [],
          topics: [],
          articles: [],
          updatedAt: new Date().toISOString(),
        },
      });
    if (p.includes('/people/suggestions'))
      return route.fulfill({
        json: {
          data: [
            {
              id: 'verified',
              username: 'verified_person',
              displayName: 'Verified Person',
              bio: 'A contributor',
              identityStatus: 'VERIFIED',
              identityCategory: 'CREATOR',
              reason: 'Active in your community',
            },
          ],
        },
      });
    if (p.endsWith('/navigation')) return route.fulfill({ json: [] });
    if (p.endsWith('/features'))
      return route.fulfill({
        json: {
          sports: false,
          messages: false,
          advertising: false,
          postImages: false,
          articlePublishing: false,
          uploadsAvailable: false,
        },
      });
    if (p.includes('/content/'))
      return route.fulfill({
        json: {
          slug: 'help-verification',
          publishedTitle: 'Verification help',
          publishedHtml: '<p>Reviewed identity.</p>',
          category: 'Help',
        },
      });
    if (p.endsWith('/content')) return route.fulfill({ json: [] });
    if (p.includes('/notification'))
      return route.fulfill({ json: { unreadCount: 0, data: [], nextCursor: null } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Continue with Google' }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Install FpiUpdates', exact: true }).count());
  await page.getByRole('link', { name: 'Create your account', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('Test Person');
  await page.getByLabel('Email address', { exact: true }).fill('test@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a secure test password 123');
  await page.getByLabel('Password', { exact: true }).blur();
  assert.equal(await page.getByText(/Looks good/).count(), 0);
  assert.equal(await page.getByText('Date of birth', { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('test_person');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await page.getByText('Verification email requested.', { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  user = {
    ...user,
    emailVerified: true,
    permissions: ['usernames.manage', 'verification.manage', 'pages.edit', 'pages.publish'],
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin');
  await page.getByRole('heading', { name: 'Username reservations', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Verification & claims', exact: true }).click();
  await page.getByRole('heading', { name: 'Grant or manage a badge', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pages & Help', exact: true }).click();
  await page.getByRole('textbox', { name: 'Article text', exact: true }).waitFor();
  await page.getByLabel('Title', { exact: true }).fill('Test help article');
  await page
    .getByRole('textbox', { name: 'Article text', exact: true })
    .fill('Clear help content.');
  await page.getByRole('button', { name: 'Preview current edits', exact: true }).click();
  await page.locator('.content-desk .public-info').getByText('Clear help content.').waitFor();
  await page.goto('/people');
  await page.getByRole('button', { name: 'About this verified account' }).first().click();
  await page.getByRole('dialog', { name: 'Verified identity' }).waitFor();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Verified identity' }).count(), 0);
  assert.match(page.url(), /\/people$/);
  assert.deepEqual(errors, []);
});
