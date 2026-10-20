# FpiUpdates v0.18.0 · Emojis

Click the smile button in the feed/global composer, reply popup, opened-post reply box, quote composer, thread continuation, new-message dialog or accepted private conversation. Search/select standard Unicode emojis, including skin-tone variants. Recently used selection is managed locally by Emoji Mart. Selection replaces the highlighted text or inserts at the remembered cursor, then returns focus to the text box. Escape closes only the emoji picker when it is open. Click outside or use its close button to dismiss it. Closing/loading the picker does not submit the form.

## Appearance and storage

The plain text fields show the device's native emoji design. The picker uses a locally generated Twemoji sprite, so its artwork also stays consistent across devices. Published post/reply/quote body text, private message bubbles and inbox previews use the same locally hosted Twemoji SVG artwork. This includes emojis pasted/typed from a device keyboard, not just picker selections. Unsupported or unavailable artwork falls back to the original text. URLs/mentions/hashtags stay real links; there is no HTML injection or rich-text storage conversion. Article HTML, notification previews and profile display names are not globally rewritten by this release.

PostgreSQL continues storing ordinary Unicode text. No new tables, image uploads or paid API are needed. Existing 280-code-point post/reply limits and 2,000-code-point message limits remain unchanged. Some emoji sequences (flags, families, skin tones, variation selectors) contain multiple code points and therefore use more than one count; no X weighted-length or single-grapheme counting change is made. Emoji insertion may exceed the limit so the existing warning/disabled-submit behavior remains visible.

Emoji Mart 5.6.0 and its data load only after opening the picker; typing does not fetch emoji search APIs. About 4,009 Twemoji SVGs are shipped as static files; a browser requests only artwork it needs, with lazy loading. Keep public/emoji in frontend build/deployment. These assets take disk space once, rather than being duplicated per post/user. There is no external emoji CDN dependency. Usual static-asset caching can be configured by the production host. If the picker chunks fail to load, close and retry; the system emoji keyboard still works.

## Credits and licences

Twemoji artwork is from https://github.com/jdecked/twemoji tag v17.0.2, copyright Twitter and contributors, CC BY 4.0. SVG files are unmodified; the picker sprite is a rasterised arrangement of the same artwork. Attribution is visible on /about. The graphics licence and project software licence are bundled in frontend/public/emoji. See https://creativecommons.org/licenses/by/4.0/. Emoji Mart and @emoji-mart/data use MIT licences; copies are in docs/third-party. Unicode recognition uses emoji-regex under MIT. Official picker documentation: https://github.com/missive/emoji-mart.

## Upgrade

Stop the existing apps with Ctrl+C, extract to a new version folder and run upgrade-from-v0171.ps1 -OldProject <existing-fpiupdates-folder>. A v0.17.0 folder can also be supplied. The script backs up the database and copies your existing environment, Docker configuration and default uploads. Node >=22.12 remains required. All nineteen SQL migrations are unchanged; this release seeds no users or content.
