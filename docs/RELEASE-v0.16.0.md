# FpiUpdates v0.16.0 — Search and discovery

## What changed

Explore (`/search`) now has Posts, People, Articles and Communities tabs. Sidebar search opens the same page. Search terms, selected tab and the post image filter are stored in the URL, making results linkable and preserving the selected category when navigating Back.

- Posts: case-insensitive text search, newest first, with an optional Images only filter. The filter means an uploaded post-image attachment; it does not include link-preview images or article covers. Existing topic links still open their post list. Article entries can still appear in the feed; use Articles to search story titles and summaries directly.
- People: search public usernames, display names and bios. Exact usernames rank first, then username prefixes, then remaining matches in username order. A leading @ is accepted. Results link to profiles and include a follow toggle; state stays consistent with profile and opened-post follow actions. Email, phone, birth date, password data and staff permissions are not searchable or included in these results.
- Articles: searches published titles and excerpts, newest publication first. Drafts, hidden discussion posts, unavailable authors and muted/blocked accounts are excluded. Search does not scan HTML markup or article bodies in this release.
- Communities: matches active public community names, slugs and descriptions, ordered by name then ID. Results show kind, description and membership totals and open the existing community page. Joining still happens there.
- Suggestions: after two typed characters and a short debounce, show up to three matching people and three existing hashtags. Enter or the Search button submits the phrase; suggested people and hashtags open their own pages. Tab reaches the suggestion links and Escape dismisses them. No search-history storage or external search provider is added.

Empty searches display existing discovery panels and a few useful example searches. Empty result categories explain that a shorter phrase or another spelling may help. Topic-only exploration remains a Posts view until a text query is entered.

## Pagination, safety and appearance

Results load in pages rather than downloading a whole directory. Search cursors are validated against the query and category, with stable boundaries for tied timestamps/names and relevance buckets. Signed-in clients request 15 results at a time; the API caps page size at 30. Guests receive up to five results with the existing sign-in prompt when more are available. Public content remains public: guest previews are onboarding, not an anti-scraping or privacy guarantee.

People and article searches use the same active-account, block, mute and public-content visibility rules as the platform. Community search excludes inactive communities. Every request reapplies server visibility checks. Search suggestions follow these rules too.

Recent result lists are cached in this tab, bounded to 30 scopes and five minutes; posts retain their existing separate list cache. Back restores recent loaded results and scroll position. Reloading the browser, expired caches, changing search terms, refreshing after a safety action or changing account can require a new request. Result caches are separated by signed-in account, and platform mute/block changes invalidate search caches. Follow changes update cached people results.

The page supports desktop/mobile and existing Light/Dark/System appearance. Follow buttons and avatar letters also receive a dark-mode contrast correction. No new application process, queue or paid search service is introduced. Queries use the existing PostgreSQL database. Substring search can require table scans; production-scale full-text/trigram indexing, typo tolerance and advanced semantic ranking remain future work and should be planned from measured search traffic.

## API and upgrade

New `GET /api/v1/search` parameters: `type=people|articles|communities`, `q`, optional `limit`, optional `cursor`. Posts continue through `GET /api/v1/posts?q=...`, with optional `mediaOnly=true`. Query text is limited to 80 characters. Search is read-only and uses the existing session/rate-limit infrastructure.

Stop the old apps, extract into a new project folder and run `upgrade-from-v015.ps1 -OldProject <previous-fpiupdates-folder>`. The script backs up PostgreSQL, preserves existing environment/Docker settings and default local uploads, then installs and builds both apps. Keep the old project and backup until your local checks succeed. Node >=22.12 remains required.

No schema change or new SQL migration is needed. All seventeen delivered migrations remain unchanged. Existing users, roles, posts, media, articles and statistics are preserved. New search fixtures are test-only and are not seeded into your installation.

## Verification

- Backend/frontend production builds and 18 unit tests.
- 73 API integration scenarios on an isolated PostgreSQL-compatible PGlite wire server, including the existing suite and new relevance pagination, follow state/private-field checks, blocks/mutes/suspensions, article visibility and equal-date pagination, inactive communities and equal-name pagination, guest limits, invalid/scope-mismatched cursors and image-only post filtering.
- Browser workflow covering live suggestions, all four categories, image filtering, following, loading further people/articles, opening profiles/articles/communities and returning to the same search, restored scroll position, mobile overflow, Dark appearance and guest sign-in within search.
- Desktop/mobile/Dark visual review. Existing v0.15 account/navigation/composer regression workflows also checked.

Native Windows PowerShell, Docker PostgreSQL 17, Truehost hosting and production load were not run here. Verify the upgrade locally before treating this as a public-launch deployment.
