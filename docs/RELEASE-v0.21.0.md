# FpiUpdates v0.21.0 — grouped notifications and post-alert timeline

## Changes

- Notifications use compact rows, category icons, linked actor avatars, related post thumbnails where available, and clear post/reply wording.
- All, Mentions and Unread filters. The settings gear reveals the existing desktop notification enable/test controls. No permission prompt runs automatically.
- Replies and mentions include interactive post cards. Opening a reply card marks its observed notification as read; profile/action clicks remain separate.
- Multiple people liking one post share a row. Other likes by one person across several posts/replies share an activity row. Multi-person post groups take precedence so an event appears once. Exact people and post counts are calculated across visible events, independently of the eight displayed avatars.
- Post-alert events from multiple accounts share a daily notification. Opening it leads to `/notifications/posts`, a combined chronological timeline of posts, quotes and attributed reposts from accounts whose bells are currently enabled.
- The timeline contains delivered alert events, beginning when alerts were enabled; it does not backfill the account's entire posting history. Turning alerts off hides that account from this timeline; turning them back on restores previously delivered visible events. Unfollowed, muted, blocked, suspended or deleted content remains filtered.
- A separate notification activity page shows the posts behind a multi-post like group, or people behind a multi-person follow group.
- Existing events and read timestamps are preserved during regrouping. Reading a group uses the observed event boundary; later arrivals remain unread. Mark-all uses the inbox request's starting time. Background refresh keeps the visible list in place.

## Grouping rules

Grouping uses Nigeria calendar days, not a claim to reproduce X's private ranking algorithm. Replies, quotes and mentions retain their individual destinations. Each like belongs to one group; if another person likes the same post, its events move into a post group without changing read timestamps. Unlike events recalculate the remaining groups.

## Upgrade

Stop the old application with Ctrl+C. Extract this package to a new folder. Run `upgrade-from-v020.ps1 -OldProject <existing-fpiupdates-folder>` from PowerShell. The supplied command block also verifies the ZIP checksum before extraction.

The upgrade script backs up PostgreSQL, preserves the existing backend/frontend environments, Compose settings and default local uploads, then runs setup. Keep the previous project and the resulting backup until you have checked the upgrade. Custom absolute media directories remain referenced through the copied environment.

One new additive migration, `202610190001_notification_timelines`, replaces the notification grouping function and adds like-regrouping triggers. Historical migrations remain unchanged. No external service or new runtime dependency is required.

## Check on your PC

1. Have one account like several of your posts. Open Notifications and check the single multi-post row; click it to view those posts.
2. Have another account like one of those posts. Check the multi-person post group and the remaining multi-post group; confirm no activity is counted twice.
3. Follow two accounts and enable their profile bells. Have them post, quote and repost. Click the grouped bell notification to open the combined Posts timeline.
4. Try Mentions, a reply card, actor profile links and the settings gear. Send a desktop test notification if browser permission is enabled.
5. Read an existing group, generate a new event and confirm it stays unread. Test the notification page on mobile and in dark mode.

## Validation

See the v0.21.0 entry in `docs/VALIDATION.md`. Desktop notification APIs are mocked for browser automation; actual Windows alerts still need your local check. Hosting deployment and native PostgreSQL server operation were not tested in this environment.
