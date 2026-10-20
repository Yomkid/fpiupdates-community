# FpiUpdates v0.23.0 — people, media and presentation

## People and settings

Mention suggestions now include avatars, display names and usernames. Mention and hashtag links remain clickable without underlines. Inline author identities truncate long names/handles rather than pushing dates onto another line; opened posts retain the close stacked name/handle layout.

The Follow menu opens /people. Opened conversations show actual participants and ancestor authors, initially three with an inline expansion. Desktop uses the sidebar; smaller layouts show participants below the conversation. Blocked, muted or unavailable profiles are filtered.

Settings now has Profile, Privacy & discovery, Notifications, Account & security, and Appearance sections. Upload controls have labelled Choose/Change, reposition and remove actions. Avatar and cover changes open a drag/zoom positioning dialog; save the profile after uploading. Profile pictures, profile covers and post images open an in-app viewer with fit/zoom and Escape-to-close. Cropped images pass through the existing server validation, re-encoding, storage quotas and ownership checks.

Email discovery is off by default. Verified members can opt in, then other verified members who enter their exact email can find the public profile. Contact lookup accepts at most twenty emails, is session/IP rate limited, respects blocks/mutes and returns no email/phone values. Entered contacts are not stored as an address book. Clearing the form removes current entered values/results. Phone discovery stays disabled until phone ownership verification is implemented; changing a phone number clears verification and opt-in. This release does not import device contacts or implement SMS verification.

## Announcements and sports

Discovery management offers Sidebar, Home feed, Mobile and Desktop/tablet controls. Existing announcements keep feed visibility during migration. New announcements default to sidebar, both device classes. Feed announcements remain after the home composer. If both placements are selected, both display intentionally. Selected topics and sponsorship cards retain their existing sidebar roles. Announcements use shorter text previews and sports cards use a more compact layout.

Featured fixtures have the same four placement/device controls. Sports organisers can upload team logos, add/edit player rosters with football names, shirt numbers, optional photos and optional links to existing usernames. A manually entered player never creates a platform account. Public rosters/media require a published competition; authorised organisers can preview drafts. Profile links respect viewer visibility.

Authorised reporters can enter goal minutes, scorer and goal/penalty/own-goal type, and correct scorer entries with a public reason and audit record. Request IDs prevent duplicate submissions and revisions reject stale changes. The scorer log can be incomplete: scoreboard totals remain authoritative and are updated separately using the existing Update match controls. This is manually maintained local football coverage, not an external live sports data feed.

## Desktop notifications

Opted-in desktop alerts can include the actor's name/avatar, action and a short post/article preview. Clicking opens the relevant local post/profile/timeline. A browser-specific preview preference hides personal details when desired. Notification permission is still requested only through an explicit user action. Windows/browser controls the toast shape, hover expansion and text truncation. Polling requires the application to be running; this release does not add closed-browser Web Push delivery.

## Trends

Retain **Trending in Ilaro** for measured local hashtag activity. At least three distinct visible authors in the last twenty-four hours are needed, with recent participation/freshness affecting rank. Until enough activity qualifies, display **Explore topics**, clearly selected topics rather than invented trends. Articles remain a separate updates section. Automatic natural-language story clustering or Sparrow summaries are future work; this release does not claim AI-generated headlines.

## Upgrade

Stop the old app, extract into a new folder, and run `upgrade-from-v022.ps1 -OldProject <old-fpiupdates-folder>`. It backs up PostgreSQL, preserves environments/Compose/default local uploads and runs setup. Keep the previous folder and backup until checks pass. One additive migration adds visibility preferences, sports rosters/goals and the Follow menu; all twenty historical migrations remain unchanged.

After upgrade, check a mention suggestion, avatar/cover positioning and viewer, privacy settings, announcement targeting, a team logo/roster, and a scorer entry. Enable desktop notifications explicitly and test with activity from another account. No new paid service is needed for these features.
