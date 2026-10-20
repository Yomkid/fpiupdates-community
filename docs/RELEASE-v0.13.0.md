# FpiUpdates v0.13.0 — Discovery and profile design

## Included

- Brand primary #15803D (green-700 reference), black text/secondary controls; system font stack, no proprietary font download. Social post/reply/quote/composer text 17px with 24px line-height, article/editor text 18px.
- Feed posts retain an avatar/content column; opened posts place text and media below the author across the full content width. Reply popup behaviour remains unchanged.
- Article covers use a centred 16:9 crop in articles, cards and upload previews. Original files are not destructively cropped. Regular post images retain their proportions. No manual focal-point selector in this release.
- Article formatting toolbar stays beneath the sticky page heading and scrolls horizontally on narrow screens.
- Rich profiles: 3:1 cover, larger avatar, bio links, optional campus identity, department/location/website/joined date, follows-you label, follower/following dialogs with pagination, Posts/Replies/Media/Articles tabs, one pinned owned top-level post or article. Posts tab includes attributed reposts. Media tab contains authored image posts/replies, not link-preview images. Published articles only; private drafts never appear. Public campus identity is self-described, not verification.
- Cover uploader reuses 5MB/16MP JPEG/PNG/WebP validation, WebP reencoding and existing storage quotas. Profile-cover images use PROFILE purpose (separate from restricted editorial COVER uploads). Existing covers/avatars remain unchanged unless saved.
- Phone/date of birth remain private; bookmarks and liked-post history are not exposed. No private messaging or identity verification badge is added.
- Right sidebar: search, optional platform announcement, optional labelled Sponsored card, Trending in Ilaro or Explore topics, latest three published articles, footer. No empty ad placeholders. Mobile feed shows announcements; Explore shows discovery cards.

## Discovery administration

Administration → Discovery → Manage announcements, topics & sponsors (`/admin/discovery`). Permission `discovery.manage` added only to reserved administrator role on migration. Custom roles gain nothing automatically; role administrator can explicitly grant permission. Server checks current permissions on every request and audits saves.

Create ANNOUNCEMENT, SPONSORED or TOPIC cards with title, description, local path/HTTPS destination, start/end date, position and enabled checkbox. Device timezone is displayed in the editor. End must follow start. Active means enabled AND started AND not expired. Lowest position wins for the single announcement and sponsor. Up to five selected topics; disable cards to remove them. Listings show up to 100 cards. No payment checkout, ad impression/click reporting or automated approval in this release. Use sponsored cards only for approved campaigns.

Existing topic catalog supplies fallback links if no active TOPIC selections exist. These links open posts tagged with that interest topic; they are not fabricated trending hashtags. Announcement dismissal lasts for the mounted page session and resets after navigation/reload; updates can appear again. Sidebar refreshes every ten minutes while visible and immediately after saving a card in the same browser. Expiry is checked on server reads, so an already-open card can remain until the next refresh.

## Trending definitions

- Hashtags only initially; other topics/entities/events and Sparrow grouping are future work.
- Last 24 hours, excluding future-dated content; published, not deleted, active authors, active communities, published articles and active conversation owners.
- At least three distinct authors per hashtag. Repeated token occurrences count once per post; repeated posts from one account do not increase the distinct-author score. Reposts are not token-bearing posts and do not increase the score. Replies can participate.
- Candidate set: top 100 tags by distinct author count, ranked by `(authors + 2 * authors_in_last_3_hours) / (1 + hours_since_latest_post / 6)^1.2`; show five. Counts reflect distinct posts/authors in the window. This is an initial activity ranking, not a factual endorsement or sophisticated coordinated-spam detector. Moderators should review abusive topic activity.
- Signed-in ranking and latest articles honour bilateral blocks/mutes and content eligibility. Anonymous public content remains public. Query runs when requested; no new Redis/background service needed. Frontend refresh ten minutes. Tune query/caching and thresholds against production load before large-scale rollout.
- Insufficient qualifying activity returns clearly labelled Explore topics; no invented posts or counts. Empty selection/catalog hides the panel.

## Upgrade

Stop old app terminals with Ctrl+C. Run `upgrade-from-v012.ps1 -OldProject <old fpiupdates directory>` from the newly extracted release. It backs up PostgreSQL first, copies existing .env files, compose.yaml and default backend/.uploads, then installs/generates/applies migrations/builds/starts. Custom MEDIA_DIRECTORY remains in .env; relative custom paths require manual copying to the equivalent new backend path. Do not delete Docker volumes. Node >=22.12 required.

New immutable migration: 202610170005_discovery_profiles. Adds optional user fields and DiscoveryCard table; no historical content rewrite, fake trends, seeded sponsors or public role promotion.

## Deferred

Campus football competition centre/scorekeeper roles and external sports APIs; Sparrow summaries; automatic non-hashtag topic clustering; mutual connections; verification; paid ad booking and reporting; cover focal-point controls; external media storage.

## Validation performed

Backend and frontend production builds; Prisma schema validation; 16 unit tests; 56 API integration scenarios on an isolated PostgreSQL-compatible PGlite wire server (single connection, UTC); desktop/mobile browser scenarios and visual review; persistent Playwright discovery/profile workflow. Checks cover trend thresholds/deduplication/mute/moderation, card dates and permissions, pin ownership/visibility, private fields, profile cover persistence, article toolbar positioning and no horizontal overflow at 390px. A v0.12 schema upgrade fixture preserved account/password/post data and custom-role permissions. All 14 previously delivered SQL migrations remain byte-identical.

Windows PowerShell/Docker PostgreSQL 17, Truehost deployment and production traffic were not executed in this environment. Upgrade script is provided for your local installation; keep old project and backup until you confirm it works. Live score/AI/payment/storage-provider capabilities are not implied by this release.
