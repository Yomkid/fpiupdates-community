# FpiUpdates v0.20.0 · People and profile controls

## Sidebar behavior

The right column has no fixed/max height, overflow container or independent scrollbar. It scrolls naturally with the document. ResizeObserver measures its height: short sidebars stick near the top, while tall sidebars scroll until their bottom fits the viewport, then stick there. Users reach every card through the ordinary page scrollbar. Existing tablet/mobile hiding remains.

Who to follow appears below the normal sidebar discovery cards on home and other eligible pages. Profile pages show You might like near the top, excluding the profile being viewed. Relevant people on post/article pages remain separate. Show more opens /people for up to 30 suggestions. Find people is also linked from the home heading, and a compact recommendation panel appears after the loaded feed on screens where the right sidebar is hidden.

## Suggestions and social context

Signed-in recommendations prefer accounts followed by visible people the viewer follows, then offer a bounded fallback ordered by existing follower counts and registration. Self, already followed accounts, the viewed profile, suspended accounts, bilateral blocks and viewer mutes are excluded. This is a simple deterministic community discovery list, not an AI relevance or verified-account system. No suggestions are fabricated when no eligible account exists.

A profile’s Followed by row shows actual accounts the current viewer follows that also follow that profile. The row is hidden when the intersection is empty or the profile is unavailable/blocked. Names, up to three small avatars and a real total are shown. Clicking opens Followers you know, paginated in batches of 30. Different viewers see their own intersection. Hidden/suspended/muted accounts do not leak through the count, names or avatar previews.

Followers/following lists now have Follow/Following controls. Existing Follow buttons say Following after a successful follow; clicking again unfollows. Profile follower totals update for that profile action. No new follow status or schema field is introduced.

## Profile safety

Block/Mute are not permanently exposed in the profile header. Open the three-dot button beside Follow to access them. Block still requires the existing confirmation. Escape/outside click dismisses profile options. A blocked profile retains its menu for Unblock, and hides Follow/message controls. Existing post three-dot safety controls and safety settings remain available.

## API

Session-only GET /api/v1/people/suggestions?limit=3|20|30&context=username returns public suggestion fields, isFollowing=false and a recommendation reason. context is optional. No email, phone, birth date or password fields are returned.

Session-only GET /api/v1/people/mutual/:username?limit=3&before=UUID returns total, data and nextCursor. The total is the viewer-specific visible intersection. Existing followers/following endpoints add isFollowing for each returned account, avoiding one additional profile request per list entry.

## Upgrade

Stop the old apps and run upgrade-from-v019.ps1 -OldProject <existing-working-project> after extracting into a new folder. The script backs up the database and preserves environment, Docker settings and default uploads. All nineteen SQL migrations and stored posts/replies remain unchanged. No migration, seed or reset is added. Node >=22.12 remains required. Native Windows/Docker/hosting acceptance remains the final environment check.
