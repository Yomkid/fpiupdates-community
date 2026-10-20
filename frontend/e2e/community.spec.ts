import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
test('members can register, publish, reply, report, and remove their own posts', async ({ page, context }) => {
  const suffix = Date.now().toString();
  const username = 'member' + suffix;
  const body = 'Browser test conversation ' + suffix + ' https://example.com';
  const password = 'browser test password 123';
  await page.goto('/register');
  await page.getByLabel('Display name', { exact: true }).fill('Campus Member');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email address', { exact: true }).fill(username + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox',{name:'Technology',exact:true}).check();
  await page.getByRole('button', { name: 'Create your account' }).click();
  await page.getByLabel('Your post', { exact: true }).fill(body);await page.getByLabel('Post image',{exact:true}).setInputFiles(resolve('e2e/fixtures/campus.png'));await expect(page.getByAltText('Post image preview',{exact:true})).toBeVisible();await page.getByLabel('Image description',{exact:true}).fill('A green campus test image');
  await expect(page.locator('.composer-link-preview .link-preview-card')).toContainText('Example campus story');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(body, { exact: true })).toBeVisible();await expect(page.getByAltText('A green campus test image',{exact:true})).toBeVisible();await expect.poll(()=>page.getByAltText('A green campus test image',{exact:true}).evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
  const socialCard=page.getByRole('article').filter({hasText:body});
  await socialCard.getByRole('button',{name:'Like post',exact:true}).click();await expect(socialCard.getByRole('button',{name:'Unlike post',exact:true})).toHaveAttribute('aria-pressed','true');
  await socialCard.getByRole('button',{name:'Bookmark post',exact:true}).click();
  await page.goto('/bookmarks');await expect(page.getByText(body,{exact:true})).toBeVisible();
  await page.goto('/');
  await page.reload();
  await expect(page.getByLabel('Your post', { exact: true })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name === 'fpi_session' && cookie.httpOnly)).toBeTruthy();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k=>k!=='fpiupdates.analytics.daily'))).toEqual([]);
  const card = page.getByRole('article').filter({ hasText: body });
  await card.locator('.post-body').click();
  await page.getByLabel('Your reply', { exact: true }).fill('A useful reply ' + suffix);
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByText('A useful reply ' + suffix, { exact: true })).toBeVisible();
  await page.goto('/search?q=' + encodeURIComponent(body));
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto('/u/' + username);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/register');
  await page.getByLabel('Display name', { exact: true }).fill('Another Member');
  await page.getByLabel('Username', { exact: true }).fill('other' + suffix);
  await page.getByLabel('Email address', { exact: true }).fill('other' + suffix + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await page.getByLabel('Your post',{exact:true}).waitFor();await page.goto('/u/'+username);await page.getByRole('button',{name:'Follow',exact:true}).click();await expect(page.getByRole('button',{name:'Following',exact:true})).toBeVisible();await page.goto('/');await page.getByRole('button',{name:'Following',exact:true}).click();await expect(page.getByText(body,{exact:true})).toBeVisible();
  const reportCard = page.getByRole('article').filter({ hasText: body });
  await reportCard.getByRole('button', { name: 'Options for post by ' + username, exact: true }).click();
  await page.getByRole('button', { name: 'Report post', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('OTHER');
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Report saved' })).toBeVisible();
  await page.goto('/u/other' + suffix);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(username + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const deleteCard = page.getByRole('article').filter({ hasText: body });
  await deleteCard.getByRole('button', { name: 'Options for post by ' + username, exact: true }).click();
  await page.getByRole('button', { name: 'Delete post', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete post', exact: true }).click();
  await expect(page.getByText(body, { exact: true })).toHaveCount(0);
});

test('staff can publish articles and manage roles, menus and communities',async({page})=>{
 page.on('pageerror',e=>console.error('BROWSER ERROR',e.stack));
 test.skip(!process.env.E2E_STAFF_EMAIL||!process.env.E2E_STAFF_PASSWORD,'Requires explicitly provisioned staff test fixture.');
 const suffix=Date.now().toString();
 await page.goto('/login');await page.getByLabel('Email address',{exact:true}).fill(process.env.E2E_STAFF_EMAIL!);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_STAFF_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Your post',{exact:true}).waitFor();
 await page.goto('/editorial');await page.getByRole('button',{name:'New article',exact:true}).click();
 await page.getByLabel('Title',{exact:true}).fill('Ilaro guide '+suffix);await page.getByLabel('Summary',{exact:true}).fill('A practical campus guide.');await page.getByLabel('Cover image',{exact:true}).setInputFiles(resolve('e2e/fixtures/campus.png'));await expect(page.getByAltText('Cover image preview',{exact:true})).toBeVisible();await page.getByLabel('Image description',{exact:true}).fill('A green article cover');await page.getByRole('button',{name:'Bold',exact:true}).click();await page.getByLabel('Article text',{exact:true}).fill('A long-form story with https://example.com as its source.');if(process.env.E2E_SCREENSHOT_DIR){await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/editor-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/editor-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});}await page.getByRole('button',{name:'Publish now',exact:true}).click();await expect(page.locator('.toast').filter({hasText:'Article published.'})).toBeVisible();
 await page.goto('/');await page.locator('.article-feed-card').filter({hasText:'Ilaro guide '+suffix}).click();await expect(page.getByRole('heading',{name:'Ilaro guide '+suffix,exact:true})).toBeVisible();await expect(page.locator('.article-cover')).toBeVisible();await expect.poll(()=>page.locator('.article-cover').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);await expect(page.locator('.article-cover')).toHaveAttribute('alt','A green article cover');await expect(page.locator('.article-body strong')).toHaveText('A long-form story with https://example.com as its source.');await page.getByRole('button',{name:'Like post',exact:true}).click();await expect(page.getByRole('button',{name:'Unlike post',exact:true})).toBeVisible();await page.getByLabel('Your reply',{exact:true}).fill('A useful article discussion');await page.getByRole('button',{name:'Reply',exact:true}).click();await expect(page.getByText('A useful article discussion',{exact:true})).toBeVisible();
 await page.goto('/admin');await page.getByRole('button',{name:'Roles',exact:true}).click();await page.getByRole('button',{name:'Add role',exact:true}).click();await page.getByLabel('Key',{exact:true}).fill('helper-'+suffix);await page.getByLabel('Name',{exact:true}).fill('Campus helper');await page.getByRole('checkbox',{name:'moderation.manage',exact:true}).check();await page.locator('.admin-editor').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Campus helper',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Menus',exact:true}).click();const menuRow=page.locator('.admin-list>div').filter({hasText:'Campus feed'});await menuRow.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Label',{exact:true}).fill('Campus timeline');await page.locator('.admin-editor').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Campus timeline',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Communities',exact:true}).click();await page.getByRole('button',{name:'Add community',exact:true}).click();await page.getByLabel('Slug',{exact:true}).fill('engineering-'+suffix);await page.getByLabel('Name',{exact:true}).fill('Engineering '+suffix);await page.getByLabel('Description',{exact:true}).fill('A department community for testing.');await page.getByLabel('Type',{exact:true}).selectOption('DEPARTMENT');await page.locator('.admin-editor').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Engineering '+suffix,{exact:true})).toBeVisible();
 await page.goto('/communities/engineering-'+suffix);await page.getByRole('button',{name:'Join community',exact:true}).click();await page.getByLabel('Your post',{exact:true}).fill('Hello department '+suffix);await page.getByRole('button',{name:'Post',exact:true}).click();await expect(page.getByText('Hello department '+suffix,{exact:true})).toBeVisible();
 await page.goto('/settings');await page.getByLabel('Profile picture',{exact:true}).setInputFiles(resolve('e2e/fixtures/campus.png'));await expect(page.getByAltText('Profile picture preview',{exact:true})).toBeVisible();await page.getByLabel('Bio',{exact:true}).fill('A member of the Ilaro community.');await page.getByRole('button',{name:'Save profile & interests',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Profile and interests saved.'})).toHaveText('Profile and interests saved.');await page.reload();await expect(page.getByAltText('Profile picture preview',{exact:true})).toBeVisible();await expect.poll(()=>page.getByAltText('Profile picture preview',{exact:true}).evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
 if(process.env.E2E_SCREENSHOT_DIR){await page.goto('/');await page.getByRole('article').filter({hasText:'Hello department '+suffix}).waitFor();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Articles',exact:true}).waitFor();await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
});

test('recovery links can verify an email and reset a password through the browser',async({page})=>{
 test.skip(!process.env.E2E_VERIFY_TOKEN||!process.env.E2E_RESET_TOKEN,'Requires one-use test tokens for an isolated fixture.');
 await page.goto('/verify-email#token='+process.env.E2E_VERIFY_TOKEN);await page.getByRole('button',{name:'Confirm email',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Email verified.'})).toHaveText('Email verified.');
 await page.goto('/reset-password#token='+process.env.E2E_RESET_TOKEN);await page.getByLabel('New password',{exact:true}).fill('new recovery browser password 123');await page.getByRole('button',{name:'Change password',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Password changed. Sign in with your new password.'})).toHaveText('Password changed. Sign in with your new password.');
});

test('social polish supports private details, previews, repost attribution and quotes',async({page})=>{
 const suffix=Date.now().toString();const username='social'+suffix;await page.goto('/register');await page.getByLabel('Display name',{exact:true}).fill('Campus Social');await page.getByLabel('Username',{exact:true}).fill(username);await expect(page.getByText('Username available',{exact:true})).toBeVisible();await page.getByLabel('Email address',{exact:true}).fill(username+'@example.test');await page.getByLabel('Password',{exact:true}).fill('social browser password 123');await page.getByLabel('Date of birth (private, optional)',{exact:true}).fill('2000-02-29');await page.getByLabel('Phone number (private, optional)',{exact:true}).fill('+2348012345678');await page.getByLabel('Location (public, optional)',{exact:true}).fill('Ilaro, Ogun State');await page.getByRole('button',{name:'Create your account',exact:true}).click();
 const body='First link preview '+suffix+' https://example.com/ https://square.example.com/';await page.getByLabel('Your post',{exact:true}).fill(body);await expect(page.locator('.composer-link-preview .preview-large')).toContainText('Example campus story');await page.getByRole('button',{name:'Post',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Post sent.'})).toBeVisible();const card=page.locator('.post-card').filter({has:page.locator('.post-body').filter({hasText:'First link preview '+suffix})}).first();await expect(card.locator('.preview-large')).toContainText('Example campus story');await expect.poll(()=>card.locator('.preview-large img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
 await card.getByRole('button',{name:'Repost options',exact:true}).click();await card.getByRole('button',{name:'Repost',exact:true}).click();await expect(page.getByText('You reposted',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('You reposted',{exact:true})).toBeVisible();
 const repost=page.locator('.post-card').filter({hasText:'You reposted'}).first();await repost.getByRole('button',{name:'Repost options',exact:true}).click();await repost.getByRole('button',{name:'Quote',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Quote this post'});await dialog.getByLabel('Your post',{exact:true}).fill('My quote opinion '+suffix);await dialog.getByRole('button',{name:'Post',exact:true}).click();await expect(dialog).not.toBeVisible();const quote=page.locator('.post-card').filter({has:page.locator('.post-body').filter({hasText:'My quote opinion '+suffix})}).first();await expect(quote.locator('.quote-card')).toContainText('First link preview '+suffix);
 await page.getByLabel('Your post',{exact:true}).fill('Square link '+suffix+' https://square.example.com/');await expect(page.locator('.composer-link-preview .preview-compact')).toContainText('Square campus story');await page.getByRole('button',{name:'Post',exact:true}).click();await expect(page.locator('.posts .preview-compact').first()).toBeVisible();
 await page.goto('/settings');await expect(page.getByLabel('Date of birth (private, optional)',{exact:true})).toHaveValue('2000-02-29');await expect(page.getByLabel('Phone number (private, optional)',{exact:true})).toHaveValue('+2348012345678');await page.goto('/u/'+username);await expect(page.locator('.profile-meta')).toContainText('Ilaro, Ogun State');await expect(page.getByText('+2348012345678',{exact:true})).toHaveCount(0);await expect(page.getByText('2000-02-29',{exact:true})).toHaveCount(0);
 await page.goto('/');await expect(page.locator('.logo-ring').first()).toBeAttached();await expect(page.locator('.post-body').first()).toHaveCSS('font-size','17px');if(process.env.E2E_SCREENSHOT_DIR)await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/social-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();if(process.env.E2E_SCREENSHOT_DIR)await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/social-mobile.png',fullPage:true});await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.mobile-header .logo-ring')).toHaveCSS('animation-name','none');
});

test('feed reply popup, native image picker and View toasts keep the feed in place',async({page})=>{
 const suffix=Date.now().toString();await page.goto('/register');await page.getByLabel('Display name',{exact:true}).fill('Popup Member');await page.getByLabel('Username',{exact:true}).fill('popup'+suffix);await page.getByLabel('Email address',{exact:true}).fill('popup'+suffix+'@example.test');await page.getByLabel('Password',{exact:true}).fill('popup browser password 123');await page.getByRole('button',{name:'Create your account',exact:true}).click();
 const textarea=page.getByLabel('Your post',{exact:true});await textarea.click();await expect(page.getByLabel('Post audience',{exact:true})).toBeVisible();await expect(page.getByLabel('Who can reply',{exact:true})).toHaveValue('EVERYONE');await textarea.fill('Popup original '+suffix);
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add image',exact:true}).click();await(await chooser).setFiles(resolve('e2e/fixtures/campus.png'));await expect(page.getByAltText('Post image preview',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Post',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Post sent.'})).toBeVisible();const postToast=page.locator('.toast').filter({hasText:'Post sent.'});await expect(postToast.getByRole('link',{name:'View',exact:true})).toHaveAttribute('href',/^\/posts\//);
 const card=page.locator('.post-card').filter({has:page.locator('.post-body').filter({hasText:'Popup original '+suffix})}).first();await card.getByRole('button',{name:/Reply to @popup/}).click();const dialog=page.getByRole('dialog',{name:'Reply',exact:true});await expect(dialog).toBeVisible();await expect(dialog.locator('.reply-source')).toContainText('Popup original '+suffix);await expect(dialog.getByLabel('Your reply',{exact:true})).toBeFocused();await expect(page).toHaveURL(/\/$/);await dialog.getByLabel('Your reply',{exact:true}).fill('Popup response '+suffix);
 if(process.env.E2E_SCREENSHOT_DIR){await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/reply-desktop.png'});await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:process.env.E2E_SCREENSHOT_DIR+'/reply-mobile.png'});}
 await dialog.getByRole('button',{name:'Reply',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page).toHaveURL(/\/$/);await expect(card.getByRole('button',{name:/Reply to/})).toContainText('1');const replyToast=page.locator('.toast').filter({hasText:'Reply sent.'});await expect(replyToast).toBeVisible();await replyToast.getByRole('link',{name:'View',exact:true}).click();await expect(page).toHaveURL(/\/posts\/[a-f0-9-]+$/);await expect(page.locator('.post-body').filter({hasText:'Popup response '+suffix})).toBeVisible();
 await page.goto('/');const again=page.locator('.post-card').filter({has:page.locator('.post-body').filter({hasText:'Popup original '+suffix})}).first();await again.locator('.post-body').click();await expect(page).toHaveURL(/\/posts\/[a-f0-9-]+$/);await expect(page.getByLabel('Your reply',{exact:true})).toBeVisible();
});
