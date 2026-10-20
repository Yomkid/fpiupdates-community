# FpiUpdates v0.19.0 · Conversation layout fixes

## Changed

- Only top-level initial posts display View thread and the total, after their text/media/quote and before the timestamp/actions. Continuation posts do not repeat it. Author’s reply labels are removed. The opened page heading is Post.
- A continuing parent/child path stays aligned at one avatar column. Connector lines run between the related rows. Additional siblings are retained beneath their true parent, with a small alternate-branch inset rather than successively indenting every thread continuation.
- A branch previews its first chronological direct child, including a reader follow-up. Later replies to that same parent stay behind Show N more replies. Replying again to a parent does not replace its earlier response preview. At deeper than eight automatic preview levels, loading becomes explicit; it still expands inline rather than navigating to a new post page.
- Replying-to handles are profile links. A separate small parent arrow opens the exact parent post. Repeated self-reply context is omitted for non-detail thread continuations where the connector already explains it.
- The reply composer stays immediately beneath the selected post and targets its exact ID. Sending a nested reply refreshes ancestor counts/children without unmounting the whole conversation and losing expanded branches. Dialog focus returns to the triggering control without scrolling to the first page link.
- Long feed/reply text is clipped at eight 24px lines and gets a real Show more/Show less button when it overflows. This toggles in place; it does not navigate. An opened detail shows its full text. URL/mention/hashtag links and emoji rendering are retained. This does not change the 280-code-point publication limit or recover text manually truncated before saving.
- The right sidebar uses position:sticky and stays within the grid. A viewport height limit and its own scrollbar make tall sidebar content reachable. It remains hidden at the existing tablet/mobile breakpoint.

## API

Replies accept replyOrder=oldest for true chronological ordering, with an ID tie-breaker. It does not prioritise later author replies over earlier reader replies. Cursor direction is recorded and a mismatched requested order returns 400. Existing default latest ordering and author priority remain compatible for older API clients. Normal visibility, guest limits, blocks, mutes and parent IDs are unchanged. No records are moved, relinked or deleted.

## Upgrade and verification

Stop the apps, extract to a new folder, then run upgrade-from-v018.ps1 -OldProject <existing-fpiupdates-folder>. A v0.18.0-fixed folder is supported by supplying its actual path. The script backs up PostgreSQL, preserves the environment/Docker settings and copies default uploads. All nineteen existing migrations remain unchanged. No reset or new seed is needed.

Check an eight-post thread, a reader question with several author responses and a reader follow-up, Show more on multiline feed text, clickable reply handles, and sidebar behavior while scrolling. Further conversations load in place in bounded pages. Very large trees still load progressively rather than fetching every descendant at once.
