import { test } from '@playwright/test';
import assert from 'node:assert/strict';
test('public access, identity layout and mobile navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const author = {
    id: 'a',
    username: 'mayomi',
    displayName: 'Mayomi Odewaye',
    bio: 'Community contributor',
    createdAt: '2026-10-19T12:00:00Z',
    identityStatus: 'VERIFIED',
    identityCategory: 'BUSINESS',
    followers: 10,
    following: 2,
    postCount: 29,
    permissions: [],
    roles: [],
    emailVerified: true,
  };
  const post = {
    id: '11111111-1111-4111-8111-111111111111',
    body: 'A useful community update.',
    parentId: null,
    createdAt: '2026-10-19T12:00:00Z',
    author,
    threadCount: 1,
    viewer: { liked: false, reposted: false, bookmarked: false },
    _count: { likes: 0, reposts: 0, quotes: 0, replies: 0, views: 7, bookmarks: 0 },
  };
  let user: any = null;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname;
    const json = (x: unknown) => route.fulfill({ json: x });
    if (p.endsWith('/admin/identity/users')) return json([author]);
    if (p.endsWith('/auth/me'))
      return route.fulfill({
        status: user ? 200 : 401,
        json: user ?? { message: 'Not signed in' },
      });
    if (p.endsWith('/auth/providers')) return json({ google: true });
    if (p.endsWith('/navigation'))
      return json([
        { key: 'home', label: 'Home', path: '/home' },
        { key: 'alerts', label: 'Notifications', path: '/notifications' },
      ]);
    if (p.endsWith('/features'))
      return json({
        sports: false,
        messages: false,
        advertising: false,
        postImages: false,
        articlePublishing: false,
        uploadsAvailable: false,
      });
    if (p.includes('/discovery/sidebar'))
      return json({
        announcement: null,
        sponsored: null,
        trends: [],
        topics: [
          { id: 't', title: 'Admissions', body: 'Selected topic', href: '/search?topicId=t' },
        ],
        articles: [],
        updatedAt: new Date().toISOString(),
      });
    if (p.includes('/people/suggestions')) return json({ data: [] });
    if (p.includes('/people/mutual')) return json({ total: 0, data: [], nextCursor: null });
    if (p.endsWith('/profile-alerts/a')) return json({ following: false, enabled: false });
    if (p.endsWith('/posts/' + post.id + '/people')) return json([author]);
    if (p.endsWith('/posts/' + post.id + '/replies'))
      return json({ data: [], nextCursor: null, requiresLogin: !user });
    if (p.endsWith('/posts/' + post.id)) return json(post);
    if (p.endsWith('/users/mayomi/posts') || p.endsWith('/posts'))
      return json({ data: [post], nextCursor: null, requiresLogin: !user });
    if (p.endsWith('/users/mayomi')) return json(author);
    if (p.endsWith('/articles'))
      return json([
        {
          id: 'article',
          title: 'Campus article',
          slug: 'campus',
          excerpt: 'Useful information.',
          author,
          publishedAt: '2026-10-19T12:00:00Z',
        },
      ]);
    if (p.endsWith('/articles/campus'))
      return json({
        id: 'article',
        title: 'Campus article',
        slug: 'campus',
        excerpt: 'Useful information.',
        body: 'Article text',
        author,
        publishedAt: '2026-10-19T12:00:00Z',
      });
    if (p.includes('/content/'))
      return json({
        slug: 'help-verification',
        publishedTitle: 'Verification help',
        publishedHtml: '<p>Read <a href="/help/usernames">username guidance</a>.</p>',
        category: 'Help',
      });
    if (p.endsWith('/content')) return json([]);
    if (p.includes('/notification')) return json({ unreadCount: 0, data: [], nextCursor: null });
    if (p.includes('/social/engagements')) return json({ data: [] });
    if (p.includes('/social/posts/')) return json({ views: 7 });
    return json([]);
  });
  const go = (path: string) => page.goto(path);
  await go('/home');
  await page.getByText('A useful community update.', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).count(),
    0,
  );
  assert.equal(await page.locator('.right-sidebar .search-box').count(), 0);
  assert.equal(await page.locator('.right-sidebar .discovery-panel').count(), 0);
  assert.equal(
    await page
      .locator('.right-sidebar')
      .getByRole('link', { name: 'Continue with Google' })
      .count(),
    1,
  );
  const feedBadge = await page.locator('.post-author .identity-badge').evaluate((el) => {
    const a = el.getBoundingClientRect(),
      b = el.parentElement.querySelector('.author-name').getBoundingClientRect();
    return {
      color: getComputedStyle(el).color,
      dy: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
      w: a.width,
    };
  });
  assert.equal(feedBadge.color, 'rgb(21, 128, 61)');
  assert.ok(feedBadge.dy < 3);
  assert.equal(feedBadge.w, 18);
  await go('/posts/' + post.id);
  await page.locator('.post-detail .author-identity').waitFor();
  const detailBadge = await page.locator('.post-detail .identity-badge').evaluate((el) => {
    const a = el.getBoundingClientRect(),
      b = el.parentElement.querySelector('.author-name').getBoundingClientRect();
    return {
      color: getComputedStyle(el).color,
      dy: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
      w: a.width,
    };
  });
  assert.deepEqual(detailBadge, feedBadge);
  await page.getByRole('button', { name: 'About this verified account' }).first().click();
  await page.getByRole('dialog', { name: 'Verified identity' }).waitFor();
  const link = page.getByRole('dialog').getByRole('link', { name: 'How verification works' });
  assert.match(await link.evaluate((el) => getComputedStyle(el).textDecorationLine), /underline/);
  await link.click();
  await page.getByRole('heading', { name: 'Verification help' }).waitFor();
  assert.match(page.url(), /\/help\/verification$/);
  user = { ...author, email: 'member@example.test', emailVerified: false };
  for (const path of [
    '/help/verification',
    '/help',
    '/articles',
    '/articles/campus',
    '/posts/' + post.id,
    '/home',
  ]) {
    await go(path);
    await page.locator('#main-content').waitFor();
    assert.ok(!page.url().includes('check-email'), path);
  }
  await go('/settings');
  await page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor();
  user = {
    ...author,
    email: 'member@example.test',
    emailVerified: true,
    permissions: ['verification.manage'],
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/u/mayomi');
  await page.getByRole('heading', { name: 'Mayomi Odewaye', exact: true }).last().waitFor();
  assert.equal(await page.getByText('Verified · business', { exact: true }).count(), 0);
  assert.equal(
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Articles', exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: /Alerts|Notifications/ })
      .count(),
    0,
  );
  assert.equal(await page.getByRole('button', { name: 'Write a post', exact: true }).count(), 1);
  const gap = await page.evaluate(
    () =>
      document.querySelector('.rich-profile-details h2').getBoundingClientRect().top -
      document.querySelector('.profile-avatar-view').getBoundingClientRect().bottom,
  );
  assert.ok(gap >= 0 && gap <= 16, 'Profile gap ' + gap);
  await go('/notifications');
  await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Write a post', exact: true }).count(), 0);
  await go('/admin');
  await page.getByRole('heading', { name: 'Grant or manage a badge', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Write a post', exact: true }).count(), 0);
  await page.locator('.verification-account > summary').click();
  await page.getByRole('radio', { name: 'Business', exact: true }).check();
  assert.ok(
    await page.getByRole('button', { name: 'Update verification', exact: true }).isVisible(),
  );
  await go('/settings/verification');
  await page.getByRole('radio', { name: 'Business', exact: true }).check();
  assert.equal(await page.getByRole('radio', { name: 'Business', exact: true }).isChecked(), true);
  assert.equal(await page.locator('.badge-category-option .badge-symbol').count(), 6);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => localStorage.setItem('fpiupdates.appearance', 'dark'));
  await go('/home');
  await page.locator('.post-author .identity-badge').first().waitFor();
  const darkFeedColor = await page
    .locator('.post-author .identity-badge')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  await go('/u/mayomi');
  await page.locator('.rich-profile-details h2 .identity-badge').waitFor();
  const darkProfileColor = await page
    .locator('.rich-profile-details h2 .identity-badge')
    .evaluate((el) => getComputedStyle(el).color);
  assert.equal(darkFeedColor, 'rgb(74, 222, 128)');
  assert.equal(darkProfileColor, darkFeedColor);
  assert.deepEqual(errors, []);
});
