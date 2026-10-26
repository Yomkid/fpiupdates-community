# Current release: v0.29.2

See [PATCH-v0.29.2.md](PATCH-v0.29.2.md) for release controls, organisation applications and badge appearance.

See [PATCH-v0.29.1.md](PATCH-v0.29.1.md) for the public-access and layout fixes.

Read [UPGRADE-v0.29.0.md](UPGRADE-v0.29.0.md) for this release, the local backup/upgrade script, GitHub workflow and hosted deployment sequence. See [VALIDATION-v0.29.0.md](VALIDATION-v0.29.0.md) for checks and limits. Earlier version notes below are retained for reference.

# FpiUpdates v0.28.0

An independent Ilaro community platform with NestJS/Prisma/PostgreSQL backend and a separate React/Vite frontend. Node >=22.12 is required; PostgreSQL 17 runs locally through Docker Compose. Use http://localhost:5173 (the configured browser origin). The API is http://localhost:3000/api/v1.

## Upgrade

Stop the old application with Ctrl+C. Extract the new ZIP into its own folder and run `upgrade-from-v027.ps1 -OldProject <existing-fpiupdates-folder>`. The existing database is backed up first, the backend environment and Docker configuration are copied, and default local uploads are copied if present. Earlier v0.3/v0.4 installations can also be supplied; all unapplied additive migrations run in order. Do not delete the PostgreSQL volume. Keep the previous project and backups until verification is complete. Custom MEDIA_DIRECTORY values should use absolute persistent paths outside versioned project folders.

If Windows finds NVM's old Node first, prepend your verified Node 24 installation to PATH in the current PowerShell session before running setup. Setup checks the active version. For a fresh installation, run setup.ps1. npm start at the project root starts both applications once dependencies and builds are ready. The old server must be stopped to release ports 3000/5173.

## New in v0.28.0

Black installation icons, appearance-aware browser colour, installation guide/promotion and measured installation statistics; opt-in background Web Push foundation; dynamic titles and public server-generated share metadata/images; About story and public information pages. Advertising drafts and staff review are available behind a disabled-by-default feature switch. Payments, sponsored delivery and private-message background push are not included. See docs/RELEASE-v0.28.0.md for activation, hosting requirements and limits. No paid storage or provider account has been activated.

## New in v0.27.0

Compact engagement controls with hidden zero counts, opened-post views, private-identity bookmark totals, a share menu/native device sharing, and batched visible-post count refresh. Four-step standalone signup, optional personal details and public skills/occupation, persisted optional feed onboarding and follow suggestions, clearer input states, feed-column desktop toasts and soft Home refresh. One additive migration preserves existing users. See docs/RELEASE-v0.27.0.md. This release activates no storage service or billing.

## New in v0.26.0

Mixed ranked For you, chronological Following and a selectable joined-community feed. Persistent private R2 storage, verified storage test and resumable local-image migration; post-image feature controls remain separate from the global upload pause. One additive migration preserves historical media. See docs/RELEASE-v0.26.0.md and docs/R2-STORAGE.md. No live storage account has been connected.

## New in v0.25.0

Installable PWA metadata/icons, user-initiated install/update controls, a private-data-free offline fallback, Gmail API sending alongside SMTP, and one-origin Docker/Render staging configuration. All uploads can be paused on ephemeral hosts. See docs/GMAIL-AND-STAGING.md for private GitHub, Gmail, Google sign-in and Render/Neon setup; no provider account has been connected. See docs/RELEASE-v0.25.0.md. No database migration.

## New in v0.24.0

Feature release controls and a text-first launch preset; scheme-free, non-underlined display links; clickable bio references without mention notifications; aligned social typography; two feed tabs and counted new-arrival notices; profile post totals/scoped search; and a richer Explore page using real content. See docs/RELEASE-v0.24.0.md. One additive migration preserves prior content and grants administrators features.manage.

## New in v0.23.0

Mention avatars, independent announcement/sports placement and device controls, compact cards, team logos and player/scorer rosters, contextual conversation people, actor-based desktop previews, image viewers and profile cropping, refreshed settings and opt-in verified-email discovery. One additive migration preserves existing content and adds the Follow menu. See docs/RELEASE-v0.23.0.md.

## New in v0.21.0

Compact grouped notifications, All/Mentions/Unread filters, reply conversation cards, linked actor avatars and a combined post-alert timeline at /notifications/posts. Likes group multiple people on one post, or one person across several posts. Existing notification events and read timestamps are preserved. See docs/RELEASE-v0.21.0.md.

## New in v0.20.0

People discovery with Who to follow, contextual You might like, a dedicated /people page and real Followers you know profile context. Profile safety actions live behind a three-dot menu; Following toggles unfollow. The right sidebar scrolls with the document and sticks naturally without an inner scrollbar. See docs/RELEASE-v0.20.0.md. No database changes.

## New in v0.19.0

Readable parent-linked conversations: one thread label below the initial post, aligned connected continuations, first-response previews with inline additional replies, clickable reply handles, inline long-text expansion and a sticky right sidebar. See docs/RELEASE-v0.19.0.md. No database changes.

## New in v0.18.0

Emoji pickers for posts, replies, quotes, thread continuations and private messages. Cursor-aware insertion preserves Unicode text; published post/quote/reply text and message bubbles use locally hosted Twemoji artwork. The picker and its data load on first use. See docs/RELEASE-v0.18.0.md.

## New in v0.17.1

Transparent enhanced logo artwork, rotating arrows on both the landing page and app, and downloadable white/black versions with transparent lettering. No database change. See docs/BRAND-ASSETS.md.

## New in v0.17.0

Google sign-in (enabled after OAuth configuration), private one-to-one text messages with requests and reporting, profile post-alert bells and grouped notifications. Opened conversations now show real parent ancestry and keep the composer immediately under the selected post. Nested quote previews preserve the quoted original, and sign-in/registration have clearer forms. See [release notes](docs/RELEASE-v0.17.0.md) and [Google configuration](docs/GOOGLE-SIGN-IN.md). Existing accounts must explicitly connect Google in Settings; matching email addresses never silently merge accounts.

## New in v0.16.0

Explore now searches Posts, People, Articles and Communities. Username matches are prioritised, suggestions show people and existing hashtags, and posts have an Images only filter. Search terms, categories and filters stay in the URL; recent paginated result lists are restored when you open a result and go back. Blocks, mutes, publication status and guest preview limits continue to apply. No additional search service or database migration is required. See [release notes](docs/RELEASE-v0.16.0.md).

## New in v0.15.0

Welcome page at `/`, signed-in feed at `/home`, contextual account dialogs, username-or-email login and guided registration. Back navigation restores recent loaded feeds and scroll position. The global Post button opens a draft dialog anywhere. New posts/replies have a 280-code-point limit with a progress ring and highlighted overflow. Publish up to ten connected posts atomically, or continue a thread with self-replies; author answers and expandable reader branches stay separate. Compact glass headers, legible handles, larger desktop profile photos, contextual people cards, More navigation and Light/Dark/System appearance complete this release. See [release notes](docs/RELEASE-v0.15.0.md) for limits and upgrade checks.

## New in v0.14.0

Campus football competitions: teams, fixtures, group/league tables, manually scheduled knockout rounds, assigned scorekeepers, manual live/halftime/full-time updates, organiser confirmation, correction history and optimistic revision checks. Match/competition discussions link to the main feed; featured match cards appear separately from announcements. Start at `/sports` or `/sports/desk`. See [v0.14 release notes](docs/RELEASE-v0.14.0.md) for setup, rules, permissions and operational limits. No external sports API or automatic match reporting is added.

## New in v0.13.0

Rich profiles with covers, optional campus identity, follower lists, content tabs and one pinned post/article; green-700/black styling; 17px/24px post typography; full-width opened posts; 16:9 article covers; sticky article formatting toolbar. Discovery sidebar shows real recent hashtag trends or honest selected Explore topics, latest articles and optional announcements/Sponsored cards. Administration → Discovery manages scheduled cards with expiry. See [release notes](docs/RELEASE-v0.13.0.md) for definitions, permissions, upgrade and limitations. Sports and Sparrow remain future modules.

## Platform statistics in v0.12.0

Public /stats shows real aggregate member/community totals, period registrations/public posts/replies/articles/likes/reposts/quotes, measured active members/online estimates, page views and visitor-days. Today/7-day/30-day/all-time selectors, charts with a table alternative, CSV export, measurement start timestamps and partial-coverage explanations are included. The feed and public navigation link to the page. Public snapshots can be cached for 30 seconds; visible dashboards refresh every minute.

Admin /admin/analytics adds growth/verification/sessions, week-two return cohorts, engagement and entry-source/page-category aggregates, all-time current public-content rankings, moderation workload/review time, image/database size, approximate API error/latency counters and current process resources. New analytics.view and analytics.manage permissions are granted to the reserved administrator role only. Other roles can be assigned them explicitly. Staff tools include a link to the dashboard.

Admin rankings work immediately. Public rankings start disabled; an analytics.manage administrator can enable them in Settings. Users can exclude their account/posts from public rankings in /stats (also linked from profile settings). Public rankings apply normal account/content and signed-in block/mute visibility. They are popularity/discovery lists, not verification or endorsements. View rankings use signed-in member/post/UTC-day records, not raw anonymous impressions.

Audience measurement starts at migration time; old visitor traffic is not invented or backfilled. The browser sends a page event on pathname navigation and an activity pulse about once a minute while visible and recently used. A random browser identifier in localStorage rotates each Nigeria calendar day; only a daily HMAC digest is stored by the API. Page event IDs deduplicate Strict Mode/retries. Unique daily browsers are estimates: visitor-days across multiple days are not lifetime unique people. Multiple devices, storage clearing, automation, opt-outs and browser restrictions affect them. DNT/GPC, a browser opt-out and common crawler filtering are supported. No IP address, user-agent string, full page URL, search query or full referrer URL is stored in audience tables. Coarse entry sources are client-reported estimates.

Online is a five-minute measured signed-in-activity estimate, not a list of people. Unexpired sessions are a separate admin-only count. Account measurement stores first/last observation and lifetime observed-day count; member/day rows older than 90 calendar days are removed, anonymous visitor/day hashes older than 31 days and event deduplication hashes older than eight days are removed. Daily aggregates and weekly snapshots remain; account-linked records cascade on account deletion. Opting out stops future audience beacons, not existing aggregate counts. Aggregate operational API counters are separate.

Completed Monday–Sunday reports are captured automatically while the API runs, with catch-up after restart. Public and private aggregate snapshots are stored separately and remain immutable. Initial partial weeks are marked. Older weekly reports can be browsed and downloaded as CSV. Snapshots describe eligible records/status as observed at capture; they are not an append-only historical interaction ledger. All-time audience charts show the last 90 days. Registration-cohort returns need at least 14 days and use registration days 7–13 in a rolling 90-day eligible registration window; until then they say Waiting for data. Most traffic/activity cannot be reconstructed before measurement started.

The Future tab explicitly reserves revenue/refunds/fees/net receipts/outstanding payments/expenses/profit, promotion conversion reporting, commerce/events, independent uptime/delivery monitoring and cloud bandwidth billing. Unconnected features say Not configured and do not show fabricated revenue or financial zeros. This release does not add payments, paid promotion, ticketing or remote storage.

Upgrade with upgrade-from-v011.ps1. One additive migration creates the analytics tables/settings/menu entries and a public-ranking opt-out field. Existing content, accounts, roles, notifications, read state and uploads are preserved. The secret used for daily hashing is generated once in PostgreSQL and included in SQL backups, never exposed by an API. Do not set ANALYTICS_WORKER_DISABLED=true on the live API unless housekeeping/report execution is handled separately; it is intended for isolated tests. Native hosting capacity, Windows scripts and full restore still need verification before launch.

## Mentions and hashtags in v0.11.0

In the post/reply/quote composer, type @ followed by a username prefix to see matching active accounts. Use arrow keys and Enter/Tab, or click a suggestion. You can also type a full username manually. Publishing resolves existing accessible accounts on the server. A mention links to the account's current profile even if its username later changes; the original written label stays unchanged. Unknown/suspended/blocked usernames remain ordinary text. Existing posts are not retrospectively assigned mentions, avoiding incorrect identity attribution after username reuse.

Type #Ilaro or another hashtag to publish a clickable tag. Existing tag suggestions appear while typing. Clicking a tag opens /tags/:tag with an exact, case-normalized chronological feed including matching replies and quotes. Explore → Explore hashtags provides prefix discovery and an exact-tag search. Interests selected in onboarding remain separate from hashtags. Unicode letters/marks/numbers/underscores are supported, with NFKC/lowercase normalization and a 64-UTF-16-unit limit. Tags inside HTTP(S)/www links and recognised email addresses are not extracted. Unrecognised or oversized tokens remain plain text.

New mentions notify the mentioned account using the existing inbox/tab/toast/opt-in desktop system. Self mentions do not notify. Repeated mentions of one account produce one event. Reply or quote notifications to that same account take priority over a second mention alert. Blocks, mutes, suspension, deletion, moderation and normal post visibility apply. A mute suppresses new mention alerts; it does not remove a legitimate mention link from the post.

Posts allow at most 10 distinct mentioned usernames, 10 distinct hashtags and 30 total entity occurrences. No historical alerts are backfilled. Only new social posts, replies and quotes are indexed in this release; rich article bodies, photo tagging, trending rankings and remote media storage are not included. Older text, articles and existing notification read states are preserved.

Upgrade with upgrade-from-v010.ps1, supplying any supported prior project folder. The two additive migrations commit the MENTION enum before installing PostToken and its notification trigger. No new paid service or runtime dependency is introduced. Cloud media storage remains a subsequent milestone.

## Publishing in v0.10.0

Editorial studio now autosaves a private working copy after about 1.5 seconds without typing. The status distinguishes Unsaved changes, Saving, Saved and failure. Incomplete titles/text can be saved; publication requires a title and article text. Use Save draft to retry a failed save, and Save & close before leaving. Reopen the article from Editorial after refreshing. Saved means the server accepted that revision; unsaved/offline changes are not guaranteed to survive closing the page.

Autosaving a published article never updates its public article or feed card. Preview first, then Publish now to make the saved revision public. The private modal shows the saved, sanitized story and cover at desktop or mobile width. Only the author or an administrator with articles.manage can open a working copy. Editors see their own work. Existing v0.9.1 articles open normally and receive a working copy on their next save. URLs, discussions, likes and replies survive subsequent publication. Unpublish article withdraws the public story and its discussion without deleting them; Publish now restores that same article/discussion.

Choose a date/time explicitly in Nigeria time (WAT, Africa/Lagos, UTC+1), at least one minute ahead and within one year. Scheduling saves and locks the revision. Cancel schedule to edit it or choose another time. The API checks due articles about every 15 seconds, in batches of 20, and publishes overdue work after restarting. Keep Docker and the API running for local scheduling; closing the frontend alone does not stop the worker. If the API/hosting process is stopped or asleep, publication waits. Shared hosting must support the persistent application process before scheduling can be relied on.

Publication rechecks current author/account status, editor permissions and required verification. A revoked permission or failed publication preserves the private draft and shows a schedule-review error instead of silently publishing. Concurrent saves use revision checks: another tab cannot overwrite a newer saved revision. Close without saving and reopen after a conflict to load the latest draft. Automatic saves are not a revision-history or offline-storage system. Social post scheduling and notifications for article publication are not included.

Upgrade with upgrade-from-v091.ps1. One additive migration creates the working-copy table; existing articles and social records are retained. SQL backups include drafts/schedules; cover files still need the separate media backup. The full PowerShell upgrade flow has not been executed on Windows here.

## Notification delivery fixes in v0.9.1

Likes now notify the post author, alongside replies, follows, reposts and quotes. Self-likes do not notify yourself. Repeated Like PUTs create one event; unliking removes it. Older likes are not backfilled—test with another account liking a new post, or unlike/re-like after upgrading.

The browser tab title shows (N) FpiUpdates and clears when notifications are read or the account signs out. A shared sync poll checks for new activity about every five seconds in an active tab and every fifteen seconds in a background tab, with failure backoff. Browser throttling/sleep can delay background checks. New foreground activity produces a toast with a View link, and an open inbox refreshes automatically. Initial page load updates the unread total without replaying old activity alerts.

Open Notifications → Enable desktop notifications to request browser permission. Permission is never requested automatically. Preferences are per account and browser, and can be disabled. Send test notification checks browser delivery. Desktop alerts are generic, without post text or account names, and use a service worker where supported. Notification clicks open /notifications. Read-all/sign-out clears outstanding app alerts where the browser permits it. The worker has no fetch handler and does not cache private API responses or pages.

Desktop delivery requires a supported browser and secure context (HTTPS or localhost), browser permission, and OS notifications enabled. This implements browser/desktop alerts while the site remains open; it does not deliver Web Push after closing the site/browser. Permission denial, focus-assist/Do Not Disturb and browser background suspension can prevent visible banners. Real Windows/Opera delivery remains to be checked on the target machine.

Upgrade with upgrade-from-v09.ps1. Two additive migrations commit the LIKE enum before installing its trigger; existing notification records/read state and uploads are preserved.

## Notifications in v0.9

Members have an inbox at /notifications for likes, direct replies, follows, reposts and quotes. Desktop navigation shows an unread badge; on mobile a header bell opens the inbox and shows the same count. All/Unread tabs, chronological pagination, individual read controls, Mark all as read and Refresh are available. Opening an item marks it read and opens the reply/quote, original reposted post/article, or follower profile. Opening the inbox itself does not mark anything read. Read state survives refresh and sign-in on another device.

One shared sync poll runs about every five seconds in an active tab and fifteen seconds in a background tab, with failure backoff. The inbox list refreshes when new activity is detected, on opening, Refresh, read-all and pagination. Optional desktop/browser alerts are available while the site stays open. Email alerts, closed-site Web Push, WebSockets and @mention notifications are not included. No Redis, separate worker process or additional notification service is required.

Source actions and notifications commit together through PostgreSQL triggers. Duplicate follow/repost PUT requests do not create duplicate notifications. Self activity does not notify the actor. Unfollowing and undoing a repost remove the corresponding notification. A direct reply notifies the parent post's author; a quote notifies the quoted post's author. If one post both replies to and quotes the same author, only the reply notification is sent. Article discussion interactions use the same rules, and repost notifications lead to the article URL.

Blocks in either direction and the recipient's mutes suppress new notifications. Existing notifications are filtered again when read or counted, including actor suspension, hidden/deleted posts, unpublished articles and unavailable conversation contexts. Unmuting can reveal older retained notifications; activity suppressed while muted is not backfilled. Personal safety settings never expose another member's inbox. Mark all as read uses the inbox's timestamp boundary so later-dated arrivals stay unread. Notification timestamps explicitly include a timezone for consistent handling across server timezones.

Upgrade from v0.8 with upgrade-from-v08.ps1. The additive migration adds an indexed notification table, transaction triggers and a members-only menu entry. Old activity is not backfilled, so existing accounts begin without a flood of historical alerts. Existing posts, media, accounts, roles and menus are preserved. The database user needs function/trigger creation privileges, as already required for feed events.

## Safety in v0.8

Use the post options menu or a member's profile to Block/Mute them. Settings → Blocked & muted accounts manages private lists, with pagination. No notification is sent. Blocking requires confirmation; muting is immediately reversible. Success and errors use toasts.

Blocking hides posts in both directions for signed-in accounts and denies new follows, likes, reposts, bookmarks, replies and quotes. Existing follows are removed in both directions; unblocking does not restore them. The blocker's profile view becomes a limited card with an Unblock control; the blocked account receives a not-found response. Nested replies retain the original conversation owner so a third-party reply cannot bypass a block against that owner. Signed-in image/article reads follow visibility rules too. Existing likes/reposts/view totals remain historical aggregates; blocking does not erase old activity or reports.

Muting filters home/Following/For You, search, reply lists, quoted previews and saved-post lists. Muted repost actors are filtered too. A deliberate profile or direct post visit remains allowed, as do interactions. Explicit profile post/repost lists are allowed; muted authors' embedded quote previews remain unavailable. Lists are private to the current account.

Public content remains readable while signed out or through another account. Blocking is not a private-account feature. Personalized filters apply when a valid session is supplied. Blocking does not itself report someone: report harmful content separately before blocking. Staff with moderation.manage can review reported evidence regardless of their personal blocks/mutes; normal member routes do not bypass blocks for staff.

Moderators can filter Open/Resolved/All reports by reason, page through the queue, record a review note, resolve and reopen reports, and independently hide/restore posts with a reason. Review timestamp, reviewer ID, latest note and audit history are retained. Resolving a report does not automatically hide its post. Account suspension still requires users.manage, revokes sessions and protects the last active administrator. This beta does not provide automated abuse detection, emergency response, legal identity verification or a production moderation staffing service.

Upgrade from v0.7 with upgrade-from-v07.ps1. The additive migration creates safety lists, backfills older conversation owners and adds report review fields. It does not reset posts, accounts or media. Earlier versions can also be passed via -OldProject.

## Composer and replies in v0.7

The compact composer expands when focused, grows with text up to a bounded height and keeps the toolbar compact. The image icon opens the native file picker immediately; selected images keep their preview, removal and description controls. The hashtag icon opens topic selection. There are no inactive GIF/poll/schedule toolbar items.

Click the reply icon on a post to reply in a dialog without navigating away. The original author/text and replying-to context appear above the focused reply input. Success closes the dialog and updates that card's count in place. Clicking ordinary post content opens the conversation; links, images, author links, selection and action controls retain their own behavior. Article cards still lead to their article page.

Publication, reply and quote success toasts contain a View link to the new post. Action toasts last ten seconds and pause dismissal while hovered or keyboard-focused. Validation errors preserve the draft and appear in toasts.

When composing a root post, the audience selector offers Everyone or joined public communities. Selecting a community chooses where to post; it does not make the post private. Reply controls offer Everyone or Only accounts you follow. The backend enforces the latter, always allows the conversation author, checks current follow state and carries the original author's policy through nested replies. Existing conversations default to Everyone. Mutual-follow, mention-only, verified-account and regional reply options are not implemented. Replied-to community membership rules still apply.

Upgrade from v0.6 with upgrade-from-v06.ps1. The additive migration adds reply-policy fields without changing old content. Default uploads and configuration are preserved as before. Blocking, muting and expanded moderation are included in v0.8. Notifications are included in v0.9. Publishing automation, R2 integration and launch checks remain pending.

## Features retained from v0.6

- Automatic first-link preview in the composer and feed. HTTP/HTTPS and www links are recognized; only the first link gets a card. Other links remain clickable. Metadata prefers Open Graph, falls back to Twitter tags, title/description and finally the domain. Websites that deny crawlers, exceed limits or expose no metadata get a plain link/text fallback. Publication still succeeds when fetching fails. Existing posts are not automatically crawled/backfilled.
- Large landscape images (decoded width >=600 pixels and aspect ratio >=1.5) use a full-width card; other preview images appear on the right of a compact text card. A manually attached post image takes precedence over the feed's link card. Quoted originals can display their own preview.
- Preview images are fetched by the backend, decoded to bounded WebP thumbnails and served by FpiUpdates. Third-party cookies/scripts are not forwarded or executed. Public destinations only: DNS answers are checked and pinned to the outgoing connection, redirects are validated again, custom ports/credentials/IP literals/private destinations are denied. Requests have a six-second budget, three redirect hops, 512 KiB HTML and 2 MiB image limits. Preview cache is capped at 500 entries with <=256 KiB per thumbnail in PostgreSQL, separate from uploads. Cached previews are snapshots; refresh/eviction tooling is future work. If the cache is full, new posts still publish without fetched previews.
- Repost menu includes Repost/Undo repost and Quote. Plain reposts create chronological feed events with the sharing person's attribution. Quotes are new authored posts with one level of the original beneath them. Hidden/deleted/suspended originals become unavailable placeholders. Repost events disappear when undone; profile Reposts and Following use the event actor. A feed can show both an original post and subsequent repost events. Quote/repost totals are combined on the button.
- Optional DOB and phone in signup/settings; they are private to the account's authenticated settings response. Public optional location appears on the profile. Phone uses international format, e.g. +2348012345678; no SMS verification is implemented. DOB checks calendar validity and rejects future dates. Existing accounts start with empty new fields; signup is not blocked by missing optional fields. The platform's launch age/privacy policy still needs defining.
- Debounced username availability checks in signup/settings; uniqueness is enforced by the database at save time. Username changes affect the public profile address; old usernames are not retained as aliases.
- Action feedback and errors use dismissible toasts. Field constraints and destructive confirmation dialogs remain. Tiptap's link input is inline rather than a browser prompt.
- Larger 17px post/composer text and system UI font stack, without external font downloads. This resembles familiar social interfaces without bundling proprietary social-network fonts.
- Supplied FpiUpdates logo replaces FU. CSS rotates its outer arrows while the centre stays fixed; reduced-motion disables animation. Original logo file is retained without image editing.

## Existing features

HttpOnly browser sessions and bearer API access; registration/login/logout; email verification and password reset; profiles, interests and following; public communities; likes, bookmarks, views, replies and reporting; articles with rich text/automatic stable URLs/shared discussions; RBAC, menu management and moderation audit logs. Editors manage their own articles; articles.manage is required for other authors. Bootstrap the first administrator from backend with `npm.cmd run admin:grant -- YOUR_REGISTERED_EMAIL`.

Profile/post/article uploads remain local and optimized in backend/.uploads by default. Back up both PostgreSQL and the configured media directory. R2 integration, galleries, uploaded videos, private communities remain future work. No previous PHP/MySQL archive has been imported; legacy identifiers are reserved for a later controlled import.

## Verification and hosting

See docs/VALIDATION.md, docs/API.md and docs/DEPLOYMENT.md. Development mail is written to backend/.local-mail; production requires real SMTP and verified email. Actual Truehost deployment, Windows script execution, load/restore testing and a full public-launch review are not verified in this environment.
