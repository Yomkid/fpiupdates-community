# FpiUpdates v0.26.0

## Changes

- Home has For you, Following and a remembered joined-community tab with a switcher. The community composer targets the selected community; For you remains public. Empty membership shows a link to explore communities.
- For you no longer hard-filters to interests or memberships. A bounded candidate set combines 300 newest visible feed events and 100 recent original events ranked by like count from the past seven days. It ranks freshness, followed authors/reposters, selected topics and joined communities, with bounded likes/reposts/replies. Views are excluded. Likes/reposts are already unique per member; the capped reply signal is a reply count, not a distinct-participant metric. This is an explainable first version, not machine learning or a guarantee of comprehensive platform-wide relevance.
- Roughly one in five slots offers a fresh low-engagement candidate when available. Author diversity and original/repost deduplication reduce repetition. Community diversity follows relevance/discovery, with no hard per-community quota yet. Safety/report spam classification is not an automatic ranking signal in this version; existing moderation status, blocks and mutes are enforced.
- Following and community feeds stay chronological. New arrivals use a chronological poll and remain behind the existing notice until clicked. No extra Latest tab.
- Ranked order is saved for 30 minutes (at most 400 events), with viewer-bound cursors and visibility rechecked on every page. Expired feeds ask for refresh; restart does not destroy the snapshot because it is in PostgreSQL. New refreshes may produce new rankings. Expired snapshots are removed on subsequent ranked-feed creation.
- Private R2 image storage with per-image location metadata, preserving existing local records. Existing image validation, re-encoding, authorization, quotas and feature switches remain.
- Operator storage upload/read/delete test and resumable local-image migration with byte verification. See R2-STORAGE.md.

## Upgrade

Stop old app processes, extract into a new directory and run upgrade-from-v025.ps1 with -OldProject pointing to the installed project. v0.24 or earlier folders can also be supplied; the script backs up the database, preserves environment, uploads and Compose configuration, and applies pending migrations. One additive migration adds media location fields and feed snapshots; no historical migration is rewritten. Uploads stay paused where previously configured. No live R2, Gmail, Google or hosting account is configured automatically.

## Limits

This release does not implement video uploads, automatic cross-provider failover, public CDN delivery, automated orphan retention, or distributed multi-region ranking. Keep the original uploads directory and a database backup. The integration is locally tested using mocked R2 transport; a real bucket and hosted restart test must be completed privately before enabling hosted uploads.
