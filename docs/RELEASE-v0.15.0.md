# FpiUpdates v0.15.0

## Navigation and account entry

- `/` is the public welcome page; signed-in visitors continue to `/home`.
- Public profiles, individual posts, articles, sports and discovery remain accessible. Anonymous post lists show up to five entries and request sign-in for further browsing. This is an onboarding preview, not a privacy boundary or protection against scraping. Published content remains public; private account fields stay private.
- Account dialogs open over the page being viewed. Sign-in and registration keep that destination. Direct `/login?next=...` and `/register?next=...` accept safe local destinations; unsafe external redirects fall back to `/home`.
- Login accepts email or username, including a leading @. Existing email login clients remain supported.
- Registration has account details, an available-username step with suggestions, and optional interests. Availability is advisory until the database accepts registration. Reserved staff/brand handles cannot be newly registered or adopted; existing accounts retain their handles. Birth date is optional and private. Phone, location and profile details can be edited in Settings. No new phone verification, OAuth or production email provider is added.
- Back buttons use the previous in-app history entry. Direct links without in-app history fall back to Home for members or Explore for guests. Feed mode and profile tab are in the URL. Recent loaded post lists and scroll positions are retained in memory in the current tab; list caching is bounded to 30 scopes and five minutes, and scroll history to 100 entries. Browser reloads, expired caches, refreshed content or changed safety filters can require a fresh list. No persisted browsing history is added.

## Composer, threads and replies

- The main Post button opens a dialog from any page. Closing it retains the draft while that logged-in tab remains open; Discard clears it. Refreshing or signing out clears this composer draft. Article autosave remains a separate, server-backed feature.
- New posts and replies allow 280 Unicode code points. The ring turns amber near the limit and red at 280; overflow is highlighted and publishing is disabled above 280. The API enforces the same limit. This is not X's weighted URL/emoji counting algorithm. Existing longer posts and article bodies are preserved.
- Add another post to publish up to ten parts together. All parts commit in one transaction; a per-account request identifier prevents duplicate publication on a retry. Only the first part currently supports the image, quote and preview controls; continuation parts in the multi-post composer are text with mentions/hashtags.
- Ordinary consecutive self-replies are recognised as author continuations. The migration recognises existing continuous same-author chains without changing their text. The feed marks threads and the conversation page shows connected continuations.
- A reply to another person's contribution remains a conversation branch, even if written by the original author. Original-author answers are prioritised in reply lists. Branches show author answers and offer Show replies / Show more replies; deeper conversations open separately to keep mobile indentation usable. Branch expansion itself is not retained after a full page reload.
- Muting, blocking, moderation, community membership and inherited reply policy continue to apply. Thread counts include only continuations visible to the viewer. Deleting the original post does not automatically remove every reply; moderation procedures still apply to individual content.

## Layout and appearance

- Main surface and sidebars share a white background in Light mode. Primary green stays #15803D, with black text. Dark mode uses a black surface and brighter green accents.
- Light, Dark and System are available through More and Settings. The preference is stored in this browser and follows operating-system changes when System is selected. It is not yet synchronised between devices.
- Less-used permitted navigation entries appear in More, including staff tools when authorised. The popover scrolls within the viewport and closes on outside click or Escape. Mobile also has More.
- BETA sits beside the platform name. The former campus marker and department slogan have been removed from the left sidebar.
- Compact translucent sticky headings, system sans-serif typography, 17px/24px post text, clearer handles and a larger desktop profile avatar improve spacing and readability. Twitter's proprietary font is not bundled.
- Opened posts put the handle below the display name, show a follow control for other accounts, and retain their timestamp. Relevant people cards use the author, quote author and mentions; article pages can show their author. These are contextual suggestions, not paid placement or inferred personal recommendations.

## Upgrade

Stop the old applications with Ctrl+C. Extract this release into its own folder, then run `upgrade-from-v014.ps1 -OldProject <previous-fpiupdates-folder>`. The helper backs up PostgreSQL before applying migrations, copies the backend/frontend environment and existing Docker configuration, and copies default local uploads. Absolute custom media paths remain in the copied environment. Node >=22.12 remains required.

The additive `202610180002_entry_threads` migration adds thread metadata and publication retry records, backfills existing reply chains, and changes the existing root navigation entry to `/home`. All sixteen previously delivered SQL migrations are unchanged. Existing accounts, password hashes, roles, posts, articles, media and statistics are retained. Keep the old project and database backup until your local upgrade checks pass.

## Validation performed

- Backend and frontend production builds, Prisma validation and 18 unit tests.
- 67 API integration scenarios on an isolated PostgreSQL-compatible PGlite wire server (single connection, UTC), covering the existing platform and new username login, suggestions, 280-character Unicode limits, historical long posts, ordered/idempotent atomic threads, self-reply classification, reply pagination, guest previews and contextual people filtering.
- Browser workflows: loaded-feed Back/scroll restoration, opened-post follow/context, global draft persistence, overflow highlighting and disabled post/reply buttons, multi-post publication and self-continuation, desktop/mobile navigation, saved Dark/Light/System appearance, guest preview, contextual sign-in, guided registration and return destination.
- A pre-upgrade fixture preserved existing accounts/password fingerprints and a 1,000-character post, recognised self-reply chains, and kept author answers to other members as separate branches.
- Desktop/mobile visual review and narrow-screen overflow checks. The release archive was checked against the previous release for unchanged migration files.

Native Windows PowerShell, Docker PostgreSQL 17, Truehost deployment, large production datasets and concurrent production load were not executed here. The upgrade backup and your local smoke test remain necessary. No extra service, Redis instance, hosting plan or external paid API is required by this release.
