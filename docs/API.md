# v0.12.0 analytics API

All routes are under /api/v1. Unsafe cookie-authenticated requests retain exact-origin checks. Public summaries are aggregate-only; no personal identifiers, private account fields, bookmark owners, report identities, hashing secret, finance data or private weekly payload are returned.

| Route | Access and behaviour |
| --- | --- |
| GET /stats?period=today,7d,30d,all | Public, default 7d; aggregate metrics, Nigeria-time bounds, measurement start/coverage, daily series and ranking-enabled flag; cached up to 30 seconds |
| POST /stats/collect | Exact trusted browser Origin required, optional session; {visitorId UUID,eventId UUID,kind PAGE/PULSE,page enum,source enum}; 600/min/IP route allowance |
| GET /stats/rankings | Optional session; disabled-state response until configured, then visibility-filtered public discovery rankings |
| GET /stats/reports?before=YYYY-MM-DD | Public, newest 12 completed snapshots, exclusive weekStart cursor; never selects adminData |
| GET/PUT /stats/preferences | Session required; own {excludeFromPublicRankings:boolean} only; no other account selector |
| GET /admin/analytics?period=... | analytics.view; public summary plus private counts/resources, sources/pages and module availability |
| GET /admin/analytics/rankings | analytics.view; eligible public-record discovery rankings, including public-ranking opt-outs for internal analysis |
| GET /admin/analytics/reports?before=YYYY-MM-DD | analytics.view; same archive cursor, including private aggregate snapshots |
| GET /admin/analytics/settings | analytics.view; only trackingSince and publicRankings, never secret |
| PUT /admin/analytics/settings | analytics.manage; {publicRankings:boolean}; audited, invalidates public summary cache |

Page categories: feed/articles/communities/profile/search/stats/other. Sources: direct/search/social/referral/internal. Unknown fields and invalid UUIDs/enums/periods/report dates are rejected. The server derives account identity from the session, never the beacon body. DNT=1, Sec-GPC=1 and recognised crawler/headless user agents return {recorded:false}. Client opt-out prevents the beacon entirely. Otherwise {recorded:true,pageView:boolean} acknowledges a transaction: daily browser insert/update, distinct signed-in member/day and lifetime summary, unique page-event hash, daily totals and coarse category/source aggregates. PULSE does not add a page view. No client-selected timestamp is accepted. Event/browser identifiers are untrusted measurement inputs, not audited billing evidence or identity verification.

Public metrics: members/communities are current inventories; newMembers and content/interactions use the selected creation/publication window. Published eligibility excludes hidden/deleted posts, inactive authors/communities and unpublished articles. Article discussion roots are excluded from social-post totals; quotes are a subset of posts/replies. Like/repost counts represent retained eligible interactions, not every historical click. postViewDays uses the existing member/post/UTC-day view records and is explicitly separate from page views. activeMembers is distinct eligible measured accounts in the period (all-time from lifetime member summaries); onlineNow uses lastSeen within five minutes. visitorDays sums distinct daily browser hashes and does not deduplicate people across days. Daily audience aggregates retain observations at the time and can differ from current eligible-account counts after deletion/suspension.

Current series show daily views/visitors/active accounts and registrations of currently active accounts. All-time series is limited to the latest 90 days; before tracking, audience cells are marked unmeasured. Period active-member deduplication outside retained 90-day member/day history is null; lifetime distinct activity remains available from member summaries. Admin current inventories/resources are labelled separately from period movements. Week-two return rate uses currently active registrations after tracking start, at least 14 days mature, within the selected period and rolling 90-day registration window; measured activity on Nigeria registration days 7–13 counts as a return. Rates are percentage points (0–100). Missing maturity/denominator returns null, not a fictitious zero-percent rate.

Rankings include followers, liked/discussed/viewed/reposted eligible posts/articles and communities by active membership. Counts are all-time current records, direct replies and signed-in view-days. Public opt-out excludes the target account and authored content, not anonymous aggregate contributions to others' counts. Blocks/mutes filter public ranking reads when signed in; globally public content remains publicly accessible outside personalised filters. Private reports are numeric aggregates only, never frozen lists of identities or content previews.

# v0.11.0 mentions and hashtags

- GET /discovery/mentions?q=<username-prefix>: current session required; 1–30 ASCII username characters; up to eight active matching accounts sorted by username. Returns only id, username, displayName and avatarMediaId. Bilateral blocks and the requesting account's mutes filter suggestions.
- GET /discovery/hashtags?q=<optional-prefix>: public with optional session; up to ten canonical tags from currently visible posts, sorted alphabetically, not a trending list. Recipient-specific block/mute and account/community/article visibility are applied before grouping. Only {tag} is returned.
- GET /posts?hashtag=<canonical-or-mixed-case-tag>: exact indexed tag matching, normal chronological cursor pagination and visibility filters; includes matching replies/quotes, without duplicate repost events. Empty, malformed or oversized tag queries are rejected. Existing q/topic/community filters can be combined.
- POST /posts: existing DTO remains unchanged. The server extracts entities from body; client-supplied tokens/user IDs are rejected. In one transaction it resolves existing accessible accounts, creates the post and entity rows, and fires notification triggers. Limits: 10 unique mentioned usernames, 10 unique normalized hashtags and 30 occurrences. Extraction failure rolls back the post and alerts.

Post projections, including quoted originals, now contain tokens: [{start,end,label,kind,hashtag,user}]. Offsets are JavaScript UTF-16 positions in the stored body. user contains only id/current username, or null if deleted/suspended/blocked for the viewer; userId is not returned separately. Clients must verify the exact body slice before rendering a token. Unknown/blocked usernames have no mention token. Hashtags are NFKC/lowercase canonical keys, not topic IDs. Text inside recognised URLs/emails is excluded.

MENTION joins the existing notification kinds and uses postId/contextPostId of the mentioning post, linking to /posts/:id. Stable event key MENTION:post:recipient deduplicates occurrences. An already-created REPLY/QUOTE event for that post/recipient suppresses the duplicate MENTION event. Existing inbox/read/sync routes require no new client parameters and apply their existing visibility rules. Initial sync does not replay historical events. No old post or article content is backfilled.

# v0.10.0 publishing API

All paths below are under /api/v1, require a current session and articles.write, and retain cookie-origin validation for unsafe requests. Write/publication endpoints also enforce configured email verification. Authors access their own drafts; articles.manage permits administration of other authors' drafts. Public article/feed endpoints select only Article, never the private working-copy payload.

| Method | Path | Result |
| --- | --- | --- |
| GET | /publishing | Up to 100 accessible saved working copies, newest updated first |
| GET | /publishing/:id | Saved private copy; existing Article falls back to version 0 until first draft save; unknown UUID is 404 |
| PUT | /publishing/:id | Full payload plus expected version; creates on version 0, increments on accepted save |
| PUT | /publishing/:id/publication | {version,action: publish, schedule, cancel or unpublish}; schedule additionally requires scheduledAt |

Payload: title (0–200), excerpt (0–400), body (0–50000), bodyFormat HTML/PLAIN, optional coverMediaId UUID/null, coverAlt (500) and HTTP(S) sourceUrl (1000). Blank title/body are allowed in private drafts. HTML is sanitized on save and again in the browser preview. Images must belong to the saving editor unless retaining an existing live/draft reference. Private cover reads are limited to the media owner, draft author or articles.manage; public references retain their existing safety filters.

A response contains id, authorId, payload, version, publishedVersion, scheduledAt, scheduledById, scheduleError and updatedAt; successful publication also returns publicSlug for its View link. No notification is sent for autosaves. A stale version returns 409; saving a scheduled copy returns 409. Refresh/reopen to resolve a conflicting edit rather than replacing its expected version blindly. Publication/scheduling requires a nonblank title of at least three characters and body text. The scheduledAt ISO timestamp must include Z or an explicit numeric offset, be at least 60 seconds ahead and no more than 366 days ahead; the UI translates its explicitly labeled Nigeria time to UTC. Validation failures roll back the version claim.

Publication and scheduled publication transactionally claim the expected version, verify the actor's current permissions/account/email requirements and author's active status, upsert the public article and create/update its single discussion, then clear its schedule and audit the action. Stable slugs and original publishedAt are retained. Unpublishing marks the public article DRAFT without deleting its discussion or engagements. Cancellation preserves the payload. The pre-v0.10 PUT /editorial/:id still handles untouched legacy articles, but rejects writes once a working copy exists; use /publishing for those articles.

# v0.9.1 notification delivery

Sync polling has a 60-request/minute allowance per session plus a 1,800-request/minute IP backstop. Other routes retain their previous limits. This avoids grouping all regular polling into the old 180/minute allowance for one campus Wi-Fi IP; it does not establish a tested hosting capacity.

LIKE is a NotificationKind. Inserting a Like notifies the post author through the same transactional helper used for other activity, with stable LIKE:actor:post event keys. A repeated PUT does not duplicate the event, self activity is excluded and DELETE removes it. Existing likes are not backfilled. Normal post/article, block/mute and account-status visibility applies to LIKE list/count/read/sync results.

GET /notifications/sync?cursor=<opaque> requires the current session and returns {unreadCount,newCount,cursor}. No cursor means a baseline (newCount=0) without replaying prior unread items. Later requests count visible unread events newer than the cursor in createdAt/id order. The returned cursor advances over visible activity, including read entries, and never moves backwards when a newer row is removed or hidden. Empty baselines use server time plus a zero UUID. No actors, bodies, recipient selector or desktop permissions are returned. Invalid cursors/unknown query fields are rejected. A GET does not mark items read. This endpoint inherits existing authentication/origin-independent GET and request-rate controls.

# v0.9 API additions

All /notifications endpoints require SessionGuard. Browser writes retain exact-origin checks; bearer requests use the existing explicit-token behavior. The recipient is always the session account; clients cannot choose another inbox.

- GET /notifications?filter=all|unread&limit=1..50&cursor=<opaque>: returns data, nextCursor, unreadCount, asOf. Default filter all, limit20; order createdAt DESC/id DESC. Each item includes id, kind, actor (id/username/displayName/avatarMediaId only), createdAt/readAt, bounded plain-text preview and internal href. A GET never changes read state.
- GET /notifications/unread-count: {unreadCount}; applies the same visibility rules as the inbox.
- PUT /notifications/:id/read: marks an owned visible notification read, preserves its original read timestamp on repeat, returns unreadCount. Foreign, hidden and missing IDs return 404.
- PUT /notifications/read-all with {through:<ISO8601 timestamp from inbox asOf>}: marks owned visible unread entries with createdAt <= through, returning updated/unreadCount. Later-dated entries remain unread. Invalid or future boundaries are rejected.

Kinds: REPLY (direct parent author), FOLLOW, REPOST, QUOTE (quoted author). Self actions are excluded. A post replying to and quoting the same author emits one reply notification; different recipients can each receive the relevant event. Repeated relationship PUTs do not duplicate events; undo/unfollow removes the related event. Followers, reposts and post insertions create notifications atomically through database triggers; muted/blocked activity is not backfilled later. List/count/read operations apply current block/mute, active-account and post/context visibility predicates. Published article reposts point to /articles/:slug; replies/quotes point to their own conversation; follows point to the actor's current username.

Existing activity is not backfilled by migration. The notifications menu is members-only and can be managed through the existing menu API; /notifications is an allowed menu destination. There are no new staff permissions, web-push subscriptions or email-delivery endpoints.

# v0.8 API additions

All safety endpoints require SessionGuard; browser writes retain the existing origin protections. Protective block/mute actions do not require verified email. UUIDs are validated. PUT/DELETE operations are idempotent and reject self-block/self-mute.

- GET /safety?before=<account UUID>: own blocks (blocked public-account projection), mutes (muted projection), nextCursor. UUID-descending bounded pages combine both lists. The same account may appear in both; a boundary group can exceed 100 by one.
- GET /safety/users/:id: own outgoing blocked/muted booleans. Does not reveal incoming blockers or anyone else's private lists.
- PUT/DELETE /safety/blocks/:id: block/unblock; block removes existing follows in both directions.
- PUT/DELETE /safety/mutes/:id: mute/unmute.
- GET /admin/reports?status=OPEN|RESOLVED|ALL&reason=SCAM|IMPERSONATION|THREAT|HARASSMENT|OTHER&before=<report UUID>: moderation.manage; newest first by createdAt/id, max100. Default status is ALL for compatibility; UI defaults to OPEN. Cursor denotes the final report of the previous page.
- PUT /admin/reports/:id/resolve and /reopen: moderation.manage; optional {note:string}, 5–500 trimmed characters. UI requires the note. Sets latest review fields and records an audit entry. The legacy empty resolve body uses a default note.

Signed-in blocked reads use 404; own outgoing blocked profiles expose only id/username/displayName/blocked/zero follow state for the unblock UI. Signed-out public routes continue to work. Muting intentionally permits explicit direct/profile reads; it is not an access restriction. Report/admin evidence is privileged and not subject to personal safety filters. No personal block/mute data is included in public account projections or notifications.

# v0.7 API additions

POST /posts accepts optional replyPolicy = EVERYONE | FOLLOWING for a new conversation. FOLLOWING means only accounts followed by the original conversation author may reply; the author may always reply. Replies inherit replyPolicy and replyPolicyOwnerId from the parent; a client-supplied policy cannot relax an existing conversation. Current follow relationships are checked on every reply. Community membership and verification rules continue to apply. Post projections expose the policy and its author id. Legacy records default to EVERYONE.

The reply popup and View toast use the existing POST /posts and GET /posts/:id APIs. No separate comment table or alternate counters are created.

# v0.6 API additions

POST /link-previews (authenticated) accepts {url} and returns {preview} or {preview:null}. GET /link-previews/:id/image serves only the cached WebP thumbnail; it does not take arbitrary URLs. Post creation itself obtains the first-link preview; clients cannot inject metadata or preview IDs. Post projections include linkPreview and optional quotedPostId/quotedPost. POST /posts accepts quotedPostId; its source must be publicly visible at publication. Quote counts appear in _count.quotes.

Top-level feed pages now return feedId, optional repostedBy/repostedAt, and event-based cursors; use feedId as the list key. Repost/undo uses the existing social endpoint. Following filters the event actor, and profile mode=reposts returns that user's repost events. Reply and bookmark pages retain post-based cursors. Do not reuse a cursor from a different endpoint or feed mode.

GET /auth/username-availability?username=... returns {available,valid}, with the current user's own username considered available. Register/Profile DTOs accept optional phoneNumber (+country code), dateOfBirth (YYYY-MM-DD) and location. Profile update also accepts username. DOB/phone appear only in auth/me; location is public. No phone verification is performed. Save-time uniqueness and DOB validation are authoritative.

# API v1 — checkpoint 0.3

Base /api/v1. JSON. UUID IDs. Unknown input fields rejected. Browser calls use credentials:include and approved Origin for mutations; explicit bearer credentials remain supported. No-store response headers. PUT/POST/DELETE may return 401/403/404/400; duplicate identity/slug conflicts are rejected. Session expiry is seven days; no automatic refresh token exists yet.

## Accounts

POST /auth/register, /auth/login return bearer credentials for non-browser clients. POST /auth/browser/register, /auth/browser/login set HttpOnly cookie and omit token from response. Registration accepts email, username, displayName, password (12–128 characters), optional topicIds (up to 10 unique UUIDs). GET /auth/me returns own profile, verification state, roles, permissions and interests. POST /auth/logout revokes current session and clears cookie.

POST /account/forgot-password {email} returns a generic message. POST /account/reset-password {token,password}. POST /account/verify-email {token}. POST /account/send-verification requires a session. File email transport is not exposed over HTTP. Password reset consumes the token once and revokes sessions.

PUT /profile {displayName,bio,website?,department?}. Website requires http/https. PUT /profile/interests {topicIds}. GET /users/:username returns safe profile plus follower/following counts and viewer's follow state. GET /users/:username/posts is paginated; mode=reposts shows referenced originals reposted by that member.

## Posts and interactions

GET /posts, /posts/:id, /posts/:id/replies. List query: limit 1–50 (default 20), opaque cursor, q up to 80 characters, mode latest/following/for-you, communityId, topicId. Following needs a session. Response {data,nextCursor}; sort createdAt/id descending. A post includes public author, optional community/topic, _count {replies,likes,reposts,views} and viewer {liked,reposted,bookmarked}. Public counts never expose bookmark totals.

POST /posts {body,parentId?,communityId?,topicId?}. Body 1–1,000 characters after trimming. Membership required for community publication/replies. Verification required in production or when REQUIRE_VERIFIED_EMAIL=true. DELETE /posts/:id is author-only soft deletion. POST /posts/:id/reports {reason,details?} creates or returns a ticket; one per reporter/post. Reasons SCAM, IMPERSONATION, THREAT, HARASSMENT, OTHER. Report snapshot is stored privately.

PUT/DELETE /social/posts/:id/likes, /reposts, /bookmarks. Enabling uses PUT; disabling uses DELETE. POST /social/posts/:id/view records one signed-in member-day view and returns {views}. GET /social/bookmarks returns only the caller's visible saved posts. PUT/DELETE /social/users/:id/follow; self-follow prohibited.

## Catalog, articles and navigation

GET /catalog/topics. GET /catalog/communities returns active public communities, member count and viewer joined state. PUT/DELETE /catalog/communities/:id/join. Community feeds use GET /posts?communityId=UUID.

GET /articles returns up to 100 latest published article summaries. GET /articles/:slug returns one published article. GET /editorial requires articles.write; returns own drafts/articles, or all if articles.publish also present. PUT /editorial/:id saves an article: slug, title, excerpt, body (up to 50,000 characters), status DRAFT/PUBLISHED, optional sourceUrl. Publishing or editing a published record requires articles.publish. No raw HTML renderer is provided.

GET /navigation returns enabled menus filtered by current session permissions and member status. A hidden menu does not alter endpoint permissions.

## Staff (server-side permission guards)

- moderation.manage: GET /admin/reports, GET /admin/audit; PUT /admin/posts/:id/moderation {status:HIDDEN|PUBLISHED,reason}; PUT /admin/reports/:id/resolve.
- users.manage: GET /admin/users (latest 100 safe account summaries); PUT /admin/users/:id/status {status:ACTIVE|SUSPENDED,reason}.
- roles.manage: GET /admin/roles returns roles and permission catalog; PUT /admin/roles/:key {name,permissions}; PUT /admin/users/:id/roles {roleIds}. Administrator key reserved.
- menus.manage: GET /admin/menus; PUT /admin/menus/:key {label,path,permission?,membersOnly,enabled,position}. Destinations are restricted to implemented internal routes.
- communities.manage: GET /admin/communities includes inactive communities; PUT /admin/communities/:id {slug,name,description,kind,active}.
- topics.manage: PUT /admin/topics/:id {slug,name}.

Administrative report/audit/user lists are bounded to the latest 100 in this first version. Extend pagination before high-volume operations. Tighter per-route authentication limits remain in effect; general limiter is per-process, not a distributed security boundary. Health: GET /health and /health/ready (503 if database unavailable).

## Article experience in v0.4

`PUT /editorial/:id` accepts title, excerpt, body, optional bodyFormat (`PLAIN` or `HTML`), status and optional sourceUrl. The server creates the slug; an optional legacy slug input is ignored. Existing slugs remain stable. `articles.write` grants writing; `articles.publish` grants publishing one's own work; `articles.manage` additionally permits viewing/editing another author's work (writing and publishing checks still apply). The administrator receives the new permission in the additive migration.

Published article detail now includes `discussion`, a standard post object. Feed posts include an optional `article` summary with id, slug, title and excerpt. Use existing post social/reply endpoints with `discussion.id`; there is no second set of article counters. Unpublished or moderated article discussions are not publicly accessible. A linked discussion cannot be deleted independently using the post delete endpoint.

## Media in v0.5

POST /media/avatar, /media/post or /media/cover accepts multipart field file (one file, no additional fields). Returns id, width, height and bytes. Requires session/production verification and writing permission for covers. GET /media/:id returns image/webp for a public attachment, its authenticated owner, or an article manager previewing a draft cover. No filesystem path or original filename is returned.

PUT /profile accepts optional avatarMediaId (null removes). POST /posts accepts imageMediaId and optional imageAlt (max 500); text is still required. PUT /editorial/:id accepts coverMediaId (null removes) and coverAlt (max 500). Existing values are retained when their fields are omitted. Media fields are included in public projections. Clients must send the intended purpose and upload their own media; arbitrary external image URLs are not accepted.


## v0.17 accounts, activity and private messages

- Public `GET auth/providers`, `GET auth/google/start?next=/local/path`, `GET auth/google/callback`, browser-bound `GET auth/google/pending`, exact-origin `POST auth/google/complete` (username, displayName, topicIds, agreed=true). HttpOnly onboarding cookies expire after 10 minutes. Existing session: `GET auth/google/connection`, password-confirmed `POST auth/google/link`, `DELETE auth/google/connection`.
- `GET posts/:id/ancestors` returns only visible real parents, earliest first; `earlierId` indicates capped earlier context, `unavailable` unavailable ancestry. Post projection supports a bounded nested quotedPost.
- `GET notification-groups?filter=all|unread&limit=20&cursor=...`, `PUT notification-groups/read-all` ({through:asOf}), `PUT notification-groups/:id/read` ({through:observedCreatedAt}), `GET notification-groups/:id` activity page. IDs refer to representative notification records, never client-supplied recipients. `GET notifications/sync?grouped=true` counts groups; legacy raw notification endpoints/default sync remain compatible.
- `GET profile-alerts/:accountId`, `PUT profile-alerts/:accountId/on|off` (must follow, not blocked).
- `GET messages/count`, `GET|PUT messages/settings` (policy REQUESTS|FOLLOWING|NOBODY), `GET messages?folder=inbox|requests&limit=20&cursor=...`, `POST messages/start` ({username,body,requestId:UUID}), `GET messages/:id?limit=20&cursor=...`, `POST messages/:id/send` ({body,requestId:UUID}), `PUT messages/:id/request/accept|decline`, `PUT messages/:id/read` ({messageId:observedMessageId}), `POST messages/report/:messageId` ({reason,details}). Sending follows the existing production verified-email requirement. Messages are returned oldest-first within each latest/history page. Retry the same send with the same requestId; generate a new UUID for each new message.
- `GET admin/message-reports` returns up to 100 open reports with only reported evidence; `PUT admin/message-reports/:id` ({status:OPEN|RESOLVED,note}). Both require moderation.manage. No arbitrary conversation-read privilege exists.

All private routes use the existing session/CSRF protections; bearer clients must supply their own valid session. Pagination cursors are opaque. Blocks and suspended accounts prevent private message access/sending; reports remain available to legitimate participants for evidence. Messages do not include email, phone, birth date, password hashes or OAuth credentials.


## v0.19 reply ordering

GET posts/:id/replies?replyOrder=oldest&limit=5 uses chronological createdAt/id ordering without author-priority reordering. Default/latest retains existing author-priority behavior. Reply cursors are tied to the requested order; changing order requires a new first page. Guest preview limits and content safety filters still apply. No schema change.


## v0.20 people discovery

GET people/suggestions accepts optional context (username) and limit 1–30. GET people/mutual/:username accepts limit 1–30 and optional before UUID, and returns total/data/nextCursor. Both require the caller’s session and use only public user projections. Recommendation and mutual results respect current account visibility. Connection lists include viewer-relative isFollowing. No database change.
