# FpiUpdates v0.27.0

## Engagements and sharing

Feed actions use compact reply, repost/quote, like, view, bookmark and share controls. Zero counts and the old Reply/Share captions are omitted; accessible labels remain. Counts use compact thousands notation with exact totals in their title. An opened post shows its timestamp and member views together, and its bookmark count beside the bookmark control. Aggregate bookmark counts are public; who bookmarked a post remains private.

Visible and near-visible post cards share a batched engagement reader (up to 20 IDs/request), refresh when reached, on focus and every 12 seconds while the document is visible. A short count animation shows real changes and respects reduced motion. This is periodic refresh, not WebSocket push or instant cross-device delivery. Local like/repost/bookmark results update immediately after the API confirms them; background refresh briefly yields to pending actions. Background count updates do not reorder the feed. Existing signed-in view tracking remains once per member per UTC day; these are member-view events, not unique lifetime visitors.

Share opens a menu: Copy link, Share post via the device's native Web Share API, bookmark/unbookmark, and Send via chat when messages are enabled. Native sharing depends on browser/device support and secure context. Unsupported browsers offer a copy-link fallback; cancelling a native share is not treated as an error. Chat sharing only pre-fills a draft and requires the user to choose a recipient and send it; existing request/privacy and feature restrictions remain. Bookmark folders are not implemented and no folder action is advertised.

## Registration and profiles

The landing page opens standalone /register and /login pages. Login/registration dialogs remain available for contextual actions inside public pages, retaining the destination.

Email/password registration has four stages: account details, username, optional personal/profile details, and optional interests with community-guideline agreement. Username availability is checked before advancing and again by the database on creation. Passwords and form drafts are not persisted to browser storage. Colored textual feedback accompanies field states and inputs have visible focus styles. Optional details can be skipped; native select pickers retain their accessible device behavior inside styled fields.

Gender is optional and private to account settings, alongside date of birth and phone. Occupation is public, optional, with preset choices and an Other/custom input. Up to eight public skills can be entered as comma-separated text (40 characters per skill) and appear on the profile. Settings can edit/clear these fields. Existing users are not forced through onboarding.

New members see a dismissible, persisted feed onboarding card: optional topics if none were chosen, then suggestions based on the existing mutual-connection/follower-popularity ranking. Five follows are a suggestion, never a requirement. All steps can be skipped and For you still uses the mixed public feed. Email-verification requirements on following have NOT been bypassed: where enabled, an unverified member can verify or skip. Google enrollment retains its existing account-entry form and receives the optional feed onboarding card; additional personal details can be added in Settings.

## Navigation and feedback

Desktop toasts are constrained to the main feed/content column; mobile placement remains. Clicking the active For you tab refreshes its contents and returns to the top without a document reload. Clicking the platform/home logo while on Home does the same and selects For you. Modified link clicks still work normally.

## Upgrade and storage

One additive migration adds optional profile fields and a private onboarding stage. Historical migrations are unchanged. Run upgrade-from-v026.ps1 against the installed project; it backs up the database and preserves environment, local images and Compose configuration. Older installations can also be supplied and all pending migrations run in order.

No paid storage, R2 billing, Telegram integration or external service is activated. Storage configuration and upload switches remain as previously set. No user needs to provide cloud credentials for this UI/engagement update.
