# FpiUpdates v0.24.0 — text-first launch controls and clearer discovery

## Links, profiles and typography

The URL renderer previously printed the original scheme and a separate CSS rule underlined ordinary web links. Display text now omits http:// and https:// while the actual safe HTTP(S) destination remains unchanged and available on hover. Links, mentions and hashtags remain green and clickable without an underline. Stored post text and character counts are not rewritten.

Bios render valid @username references, hashtags and web links. Rendering is local presentation only: editing a bio does not create mention tokens or send notifications. Email addresses are not treated as username mentions, and entity-shaped text inside URLs is not split into profile/hashtag links. Unknown usernames can lead to the existing unavailable-profile page.

Feed identities use a 40-pixel avatar and aligned, single-line name/handle/date with ellipsis as needed. Opened posts retain stacked name and handle. Post/bio copy uses system UI fonts at 17px, 24px line height and weight 400; feed handles are 15px and profile handles 16px. Profile names and handles have a close but readable gap. Existing user-selected light/dark/system appearance remains supported. No proprietary font file is copied.

Profile header shows a visible original-post total (published, non-deleted top-level posts; subject to content visibility). It excludes replies, repost events and unavailable content. A search icon opens the shared Explore search with from:username. A phrase after that filter searches that author's original top-level posts. Hidden content, inactive accounts, blocks and search mute rules remain enforced. Private-bookmark and staff-tool shortcuts are removed from the profile body; their menu locations remain available.

## Home and Explore

Home now has For you and Following. For you retains the existing selected-topic/joined-community filter when configured, otherwise the public community timeline. Following shows followed accounts' timeline events. Both currently order by time, with no claimed machine-learning ranker. The redundant Latest tab is removed; old home mode=latest links open For you. Internal latest search/Explore/API timelines remain supported. The refresh control now uses a refresh icon.

The new-arrival notice shows up to three distinct actor avatars and an observed timeline-event count, capped at 50+. It polls up to fifty items every twenty seconds while visible and checks on focus. It never claims an unlimited unseen count. Near the top, it appears above the post list, after the composer and any active announcement/sports cards. While scrolling, it sticks below the timeline tabs. Once an inline slot has been shown, its space is retained during docking to avoid moving the reading position. Clicking refreshes the selected timeline and returns to its top. Posts are not silently inserted during reading.

Explore now has a compact sticky shared search header and Explore, Topics, Articles, optional Sports, and People sections. Its default page composes real selected/measured topics, eligible announcements/sponsors, published articles, featured sports when enabled, suggested people and public conversations. Unavailable article/topic sections use honest empty states. Sports is hidden when paused. No external live-score provider, fabricated news cluster or AI headline service is added. X Explore returned 403 to the attempted lookup; the supplied screenshots, rather than a claimed live authenticated X visit, informed this layout.

## Feature releases

Administration → Feature releases provides:

- Post image uploads: block new post/reply/thread image uploads and attachment reuse. Already published images stay visible; avatar/cover uploads are separate.
- Campus sports: pause sports pages, featured cards, uploads, management and new sports-linked posts. Existing records are retained.
- Private messages: pause inbox/pages, message requests and polling. Existing conversations are retained; moderation records remain available to authorised staff.
- Article publishing: pause editorial tools, cover uploads and scheduled publishing. Published articles stay readable; schedules retain their due time and resume when enabled. If resuming old schedules is undesirable, review/cancel them before switching off.

Only features.manage can change release controls. Administrators receive it through the additive migration; other roles can be granted it through RBAC. Menus.manage alone does not grant feature control. Writes are audited. Switches apply at the API, including mixed-case/encoded media kinds, rather than merely hiding menu items. Existing permissions, verification, ownership, validation and quotas still apply when a feature is enabled.

The Text-first launch preset atomically pauses post image uploads, sports and messages; text posts/replies/threads, profiles, communities, links and articles remain. Link preview cards can still contain source thumbnails. Existing installations keep features enabled until an administrator chooses switches/preset, so an upgrade does not silently interrupt current use. Other open tabs refresh flags every thirty seconds or on focus; the API enforces the saved switch immediately for new requests. An already-running operation may complete. These are platform-wide switches, not audience/cohort percentage rollouts. New future features must be registered in server policy and UI; an unknown key is rejected.

## Upgrade and checks

Stop the old application and run upgrade-from-v023.ps1 -OldProject <old-fpiupdates-folder> from the newly extracted folder. The old folder may be v0.23 or v0.22; unapplied migrations run in order. PostgreSQL is backed up and environments, Compose settings and default local uploads are preserved. Keep the old folder and backup until the new version works.

One additive FeatureSwitch migration grants administrator feature permission. All twenty-one migrations shipped in v0.23 remain unchanged. After upgrading, open Administration → Feature releases and apply the text-first preset when ready. Check profile bio links, profile search, mobile identities, the two home tabs and new-post notice. Native Windows, deployment and provider access remain checks for the target machine; detailed validation is in VALIDATION.md.
