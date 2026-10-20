# FpiUpdates v0.22.0 — previews, home and mobile composition

## Links and previews

- Detect recognizable bare domains such as `x.com`, `krosscheckapp.com`, `fpiupdates.com.ng` and `youtu.be/video-id`. HTTPS is added to bare URLs. Detection uses the same pinned Linkify version on the server and browser; emails, decimals, filenames and invalid suffixes are not treated as web links simply because they contain a dot.
- Use the first recognized public HTTP(S) link for the preview. Other links remain clickable. Mentions/hashtags inside bare URL paths or fragments are excluded from entity parsing and suggestions.
- YouTube watch, short, embed, live and youtu.be video links use a canonical video ID with YouTube's oEmbed metadata endpoint. When metadata is unavailable, try page metadata and a bounded YouTube thumbnail fallback.
- Recognized public Facebook post/video links try Facebook's oEmbed endpoint before ordinary page metadata. Only text/thumbnail metadata is used; third-party HTML, scripts and iframe players never run in FpiUpdates.
- Generic metadata fetching now supports bounded gzip/deflate/Brotli decompression, a larger bounded HTML budget, additional Twitter image metadata and IPv4 preference after checking every DNS answer. Redirects and image URLs retain public-address validation and DNS-pinned connections.
- Compact cards show their image on the left. Wide images and YouTube video thumbnails use a larger cover card. Missing/broken images use a compact link icon instead of a broken image.
- Old text-only cached previews can refresh in place without changing IDs. Signed-in feed/detail/quote cards can recover a preview missing from an older post. Basic link cards remain visible if external metadata cannot be fetched. Refreshes are shared/cached and failures never prevent publishing.

A rich preview depends on what the source makes public. Private/deleted/age-restricted content, login/consent pages and blocked requests may return only a basic link card. This release does not promise unrestricted Facebook scraping or automatic video playback. Provider responses were tested with controlled fixtures; live YouTube/Facebook requests from your Windows PC or hosting account must still be checked there.

## Home and mobile

- Compact sticky For you / Following / Latest header. For you is the default home tab; existing explicit mode links still work. The home mobile bar uses a profile shortcut, compact branding and notifications.
- The composer appears directly below the tabs. Scheduled active platform announcements appear after it on desktop and mobile; the same announcement is not repeated in the home sidebar. Existing mobile featured sports cards remain available.
- New arrivals are checked every 20 seconds while the home document is visible, and on focus/visibility return. A Show new posts button with author avatars appears without inserting posts or moving the reading position. Clicking it refreshes the selected timeline and returns to its top. No exact unseen-post count is invented from a limited polling response. Feed-event timestamps preserve the actual timeline order for posts and reposts.
- Mobile Write a post is a floating lower-right button above bottom navigation. It opens the existing composer in place and is hidden on opened posts, opened articles and message conversations. Notifications replace the old middle compose slot in bottom navigation.
- An opened post's inline reply composer starts compact and expands on focus. When that composer scrolls out of view, a small mobile reply bar returns to and focuses that same composer. There is no duplicate reply draft or change to its parent ID.

## Upgrade and checks

Stop the previous app, then run `upgrade-from-v021.ps1 -OldProject <existing-fpiupdates-folder>` after extraction. The upgrade backs up PostgreSQL, preserves environments, Compose configuration and default local uploads, and runs setup. Use the supplied combined PowerShell block to verify the ZIP before extraction. There is no new migration; all twenty existing migrations are unchanged. LinkifyJS 4.3.3 is now an explicit backend/frontend dependency.

Check a bare domain, the YouTube link you reported, a public Facebook post/video, and a normal article link in the composer and published feed/detail view. Check the mobile floating button, compact replies, new-post notice and announcement placement. Browser tests use controlled provider fixtures, not a claim of live provider access or native Windows validation.
