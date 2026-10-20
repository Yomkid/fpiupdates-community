# v0.20.0

Removed independent sidebar scrolling, added privacy-filtered people discovery and actual mutual-follow context, profile three-dot safety menu, normal Following labels and follow actions in connection lists. No schema change.

# v0.19.0

Reworked thread/reply presentation, exact chronological child previews and pagination, inline sibling/deep reply expansion, clickable parent handles and compact thread metadata. Added inline long-text expansion and sticky scrollable right sidebar. No SQL migration.

# v0.18.0

Searchable emoji selection, cursor/selection insertion in every text composer and local Twemoji rendering for posts, quotes, replies and private messages. Lazy picker loading, native fallbacks, attribution and preserved limits. No database changes.

# v0.17.1

Transparent enhanced colour logo, matching monochrome logos with cut-out lettering, and shared stationary-centre/spinning-arrow branding on the landing page and app. No database migration.

# v0.17.0

Google account entry/linking, private text conversations with requests/privacy/report moderation, profile post-alert subscriptions, daily grouped notifications and safe observed read boundaries. Correct opened-post composer targeting and true parent branches; nested quote previews and styled account forms. Two additive migrations preserve old data and read state. See RELEASE-v0.17.0.md and GOOGLE-SIGN-IN.md.

# v0.12.0 — public transparency and admin analytics

- Public /stats: real eligible inventories/period activity, daily measured audience and registration charts, Nigeria-time selectors, online estimate, CSV exports and definitions/coverage timestamps.
- Permission-controlled /admin/analytics: growth/verification, mature week-two return cohorts, content rankings, sources/categories, moderation, storage and buffered API/process metrics.
- Transactional daily-browser/page deduplication, privacy exclusions, retained numeric rollups and bounded raw-data retention.
- Immutable public/private weekly snapshots, restart catch-up and paginated older report browsing/downloads.
- Public rankings disabled initially; audited admin enable/disable and per-account exclusion controls. Admin rankings available immediately.
- Explicit availability panels for future finance, advertising, commerce/tickets, external monitoring and cloud bandwidth. No payment/revenue data invented.
- Additive migration, administrator-only permission rollout and upgrade-from-v011.ps1 with database/environment/upload preservation.

# v0.11.0 — mentions and hashtags

- Username suggestions with keyboard/pointer selection in posts, replies and quotes; server-resolved mention IDs survive renames.
- Clickable hashtag/mention text in posts and quoted originals, exact chronological hashtag feeds including replies, and prefix discovery under Explore.
- Private MENTION inbox/live alerts, duplicate reply/quote suppression and block/mute/self/suspension handling.
- Unicode tag normalization, URL/email exclusions, entity limits and rejection of forged client entities.
- Two additive migrations and upgrade-from-v010.ps1 with existing backup/environment/media preservation. Remote storage remains planned.

# v0.10.0 — private drafts and publishing

- Automatic private article draft saving, acknowledgement/failure states, explicit retry and optimistic conflict protection.
- Private server-backed article previews with cover images, desktop/mobile widths and native modal keyboard handling.
- Nigeria-time schedules, cancellation/rescheduling, due-work recovery after API restart and current-permission checks.
- Explicit Publish now and Unpublish actions; public stories stay unchanged during autosave and retain stable URLs/discussions/engagements.
- Additive working-copy migration and upgrade-from-v091.ps1 with backup/environment/compose/media preservation.

# v0.9.1

- Add like notifications with self exclusion, idempotent inserts, unlike removal and existing block/mute/content rules.
- Add private cursor-based notification sync for live activity detection, foreground toasts and automatic inbox refresh.
- Show unread totals in the browser tab title; clear on read/sign-out.
- Add opt-in browser/desktop alerts, permission/denial controls, a test button and per-account/browser preferences.
- Use a notification-only service worker, generic alert text, inbox click-through and no private-content caching.
- Poll roughly 5s foreground/15s background with backoff; browser suspension can delay updates. Closed-site Web Push remains unimplemented.
- Add upgrade-from-v09.ps1 with database backup/configuration/default-upload preservation.

# v0.9.0

- Private notification inbox for direct replies, follows, reposts and quotes, including article discussions.
- Desktop unread badge and mobile header bell, All/Unread filters, cursor pagination and persistent read state.
- Individual and timestamp-bounded read-all actions; opening the inbox does not silently mark everything read.
- Shared visible-tab 30-second count polling with failure backoff; no new hosted service dependency.
- Transactional PostgreSQL event triggers, duplicate suppression, self exclusion and undo cleanup.
- Block/mute and current content visibility applied at creation and again on inbox/count reads.
- Additive upgrade-from-v08 backup/configuration/media preservation; no historical-notification backfill.

# v0.8.0

- Private block/mute lists, post-menu/profile controls, confirmation and Settings management with pagination.
- Signed-in block filtering for posts, feeds, search, profile lists, quotes, articles and media; API interaction checks and removal of bilateral follows.
- Original conversation-owner relation and migration backfill prevent child-reply bypasses of root-author blocks.
- Muted authors/repost actors filtered from automatic feeds, search, replies, quotes and bookmarks; deliberate profile/direct visits remain available.
- Moderation report status/reason filters, chronological pagination, review notes/timestamps/reviewer IDs, resolve/reopen and audit entries.
- Upgrade-from-v07 backs up the database and preserves existing configuration/default uploads.

# v0.7.0

- Compact auto-growing composer with direct image-picker and topic controls.
- Reply dialog with original context, initial focus, in-place reply count and retained feed route.
- Clickable post content, while interactive elements and selected text keep their behavior.
- View links in post/reply/quote success toasts; hover/focus pauses timeout.
- Joined-public-community audience selection and server-enforced Everyone/followed-account reply permissions, inherited through threads.
- Additive migration, backup-first upgrade and browser/API coverage.

# v0.6.0

- First-link Open Graph/Twitter/title previews, responsive cards and a bounded image proxy/cache with DNS pinning and destination validation.
- Chronological attributed repost events and quote posts, with unavailable-original protection and preserved social actions.
- Private optional birth date/phone, public optional location, editable usernames and availability checks.
- Toast feedback, inline article-link entry, readable system typography and supplied animated logo with reduced-motion support.
- Additive schema migration, preservation/backfill fixture, backup-first upgrade and updated tests/docs.

# v0.5.0

- Profile pictures in settings, avatars across feeds/profiles, post/reply images and article covers.
- Multipart upload endpoint, signature/decode checks, bounded processing, WebP re-encoding, metadata removal and quotas.
- Owner/purpose checks when attaching; permission-checked media reads follow publication/moderation state.
- Image descriptions, previews, removal from forms and upload busy states.
- Additive media migration and backup-first upgrade; existing content stays intact.
- Node.js version preflight and persistent-media deployment/backup documentation.

# v0.4.0

- Separate `articles.manage` from publishing permission; editor lists are scoped to author unless explicitly granted management access. Direct cross-author edits return 403.
- Server-generated, stable article URLs; no manual slug field.
- Sanitized Tiptap rich text editing with an editor-only JavaScript chunk.
- One article feed card and discussion thread; engagement shared across pages.
- Additive migration backfills discussions for existing published articles without changing their body or URL.
- Backup-first upgrade script for v0.3.

# 0.3 community checkpoint

Added RBAC/custom roles, permission-filtered editable menus, explicit trusted admin bootstrap, member role migration, social interactions/following, private bookmarks, deduplicated member-day views, registration interests/settings, profile website/bio/department, topic/community filters, link detection/composition preview, public communities/membership, separate articles/editorial drafts and publishing, verification/password reset via file/SMTP delivery, moderation/account controls and audit history.

New migration adds tables/columns and initial catalogs; existing accounts/posts remain. Existing accounts receive Member. No passwords, administrator accounts, news articles or old website content are seeded. Recovered content is not imported yet.

Local database default port is now 55432 to match the tested Windows setup. Added root npm start, port-conflict preflight and a backup-first upgrade-from-v02.ps1 script. Existing .env and Compose mapping are carried forward during upgrade.

Current limits: public-only communities, flat menus, basic deterministic feeds, no independent repost chronology, 100-item staff/article lists, synchronous SMTP, no rich-text/media uploads, notifications, quote posts or fully reviewed incident-retention workflows. Production deployment/load/restore tests remain pending.
