# FpiUpdates v0.29.1 UI patch

Apply this to the installed v0.29.0 project. Stop the running app with Ctrl+C first. Run install-patch.ps1 -Project PATH_TO_FPIUPDATES. It backs up replaced files in the project's private backups folder, copies only the listed source files and builds the frontend. It preserves .env, media, databases, Git history and backend configuration. No database migration is required. The backend package remains v0.29.0; the frontend/root version is v0.29.1.

## Changes

- Green SVG identity badges no longer inherit handle colours, widths or full-row layout. Name and badge stay together; handle is below them in opened posts. Profile no longer displays the redundant Verified · category paragraph.
- Text links in Help, settings, verification guidance and prose are coloured and underlined. Post identities, navigation and mention/hashtag styles remain purpose-specific.
- Public feed, articles, posts, profiles and nested Help pages are readable by guests and signed-in accounts awaiting email confirmation. Private account/staff pages still lead to email verification. New signup/sign-in with an unconfirmed address still enters the dedicated confirmation flow. Public composers and common engagement controls offer verification before participation.
- Guests see a logo-only desktop left rail, a sign-in/Google/join panel and relevant conversation people, without the member menus, search or trending sidebar. Existing guest preview pagination and the bottom join banner are retained.
- Mobile bottom navigation has Articles instead of a duplicate Notifications item. The floating composer appears on Home, Explore and your own profile only. Profile photo/name spacing is reduced.
- Verification forms use accessible radio cards with green badge previews. All categories use the same reviewed-identity badge; choosing Business or Government does not create a different badge colour or automatically verify the account. Search fields are styled consistently.

## Current trending behaviour

Automatic trends currently use hashtags in visible posts from the last 24 hours. A hashtag needs at least three distinct active authors. Ranking considers distinct authors, additional weight for activity in the last three hours, and recency decay. The top five are returned. Repeated posts from one author do not add distinct authors; reposts do not create hashtag tokens.

The sidebar/Explore panels fetch on entry and refresh every 10 minutes while the page is visible. Without eligible trends, they show Explore topics: selected topic cards, or catalogue topics. Those are suggestions, not organic trends. Free-text topic clustering, AI news summaries and a separate trending-post ranking are not implemented in this patch.

## Checks and limitations

Frontend TypeScript/Vite build, route-policy checks and Chromium desktop/mobile-width UI checks cover guest layout, public reading with unconfirmed email, private-page gating, badge alignment/colour, link styling, mobile navigation, profile spacing and category previews. The previous account/identity release checks remain included. Backend code and migrations are unchanged. Windows PowerShell execution, live Google/Gmail delivery, device PWA installation and production deployment need testing on your own system.

## After local testing

Use your existing Git checkout for deployment. From the patched local project, run apply-to-repo.ps1 -Repository PATH_TO_YOUR_CLEAN_GIT_CHECKOUT to copy the complete v0.29.1 source to a new upgrade branch, including the v0.29.0 backend migration if it has not been deployed yet. Retain environment files outside Git. The UI patch itself requires no new migration; a first production upgrade from v0.28.0 still requires the v0.29.0 migration and hosted backup described in UPGRADE-v0.29.0.md. Check git diff, commit and push through your usual branch workflow. Do not upload this ZIP or backups to the source repository.

## Rollback

Stop the app. Restore replaced files from the backup directory to matching project paths and rebuild the frontend. The additional access-policy.ts file can remain unused after restoring the old App source, or be removed. No database rollback is needed.
