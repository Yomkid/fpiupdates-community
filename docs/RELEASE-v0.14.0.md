# FpiUpdates v0.14.0 — Campus football

## Start here

1. Upgrade and sign in as an administrator. Open **Campus sports → Open sports desk** (`/sports/desk`), or Administration → Sports.
2. Create a competition with name, season, description, format and points. Leave unpublished while preparing it, or publish when ready. Private competitions/fixtures are visible to sports organisers only.
3. Add teams. Group-and-knockout teams need a group such as A/B; group names are normalised to uppercase. League and knockout teams have no group field.
4. Add fixtures with two different teams from the same competition, stage, kickoff time, venue and optional scorekeeper. Kickoff input uses your device timezone (shown in the form); public dates use Nigeria time (WAT). Group fixtures must use teams from the same group.
5. To assign another reporter, use Administration → Accounts to grant the **Sports scorekeeper** role, then select the account in the fixture. Assignment alone does not grant a permission; the role and assignment are both checked.
6. Publish the competition. The reporter opens Sports desk and selects an assigned match. Enter the latest complete totals, reported minute and public note, then save. No external score API or video stream is required.
7. A reporter can mark full-time, but an organiser must confirm the final result before it affects the standings. Corrections to confirmed results require an organiser and a new public explanatory note.
8. Select **Feature this match in the sidebar** on the fixture to enable the compact card. It appears beneath announcements, separately from ads/trends, when eligible.

## Formats and tables

Football only: league, knockout, or groups then knockout. Team limits: 64 per competition; fixtures: 500 per competition. Group, league, round of 16, quarterfinal, semifinal, third-place and final fixture stages are supported where appropriate to the format. Fixtures, future pairings and qualification are entered manually by the organiser. The knockout tab groups fixtures by round; it is not an automatic bracket generator. Create further-round fixtures after confirming qualifiers.

Standings derive from current **confirmed FULL_TIME group/league results**, not accumulated goal events. Corrections recalculate rather than add points again. Knockout matches and penalties never add to group standings. Defaults are win 3/draw 1/loss 0; configurable 0–10. Points lock after the first score update, even if a match is subsequently reset. Format locks once fixtures exist. Team group changes lock once that team has any fixture. Team names can be corrected; names must be unique within a competition ignoring case.

Sort order is points, goal difference, goals scored. Exact sporting ties share a rank (marked =); alphabetical display order is not a qualification decision. Organisers resolve ties under their competition rules and manually enter knockout qualifiers. Head-to-head, disciplinary deductions, aggregate two-leg ties and automatic advancement are not implemented. Use only a competition whose rules fit these capabilities, or extend them before use.

## Live reporting and corrections

Statuses: scheduled, live, halftime, full-time, postponed, cancelled. Scores and optional penalties accept integers 0–99; reported minute 0–150. A tied full-time knockout match requires both penalty totals with a shootout winner. Penalties are accepted only for a tied full-time knockout result. Scheduled/postponed/cancelled states must have zero score, no minute and no penalties; any reset is recorded as a correction/update. Abandoned matches, awarded results, stoppage-time notation, player/event statistics and multi-leg aggregate rules are deferred.

Reporters may update assigned published matches to live/halftime/unconfirmed full-time; they cannot confirm, cancel, postpone, edit fixtures, change teams/rules, or alter a confirmed result. Organisers can update any match, confirm results and correct mistakes. Permissions are loaded on each request, so removal or suspension stops reporting. Production reporting also requires verified email under the existing verification policy.

Every fixture/score write runs transactionally. Revision checks and serializable transactions reject stale/conflicting saves with HTTP 409. The score form keeps its draft and offers **Load latest score** when polling detects a newer revision. It does not silently merge competing totals. Each write records actor, time, revision, explanatory note, previous/current state and an audit entry. Public update history shows the note, score state, kind, timestamp and reporter name when visible; private assignment IDs/previous-state payloads are not exposed. Team, stage and kickoff are locked after play starts; venue, assignment and featured status can be corrected with an explanatory note.

Polling is every 15 seconds while the page is visible; this is not push, a broadcast or an autonomous clock. The reported minute does not tick on its own. Score cards show the last score-update time. Live cards flag delayed updates after ten minutes. No promise of uninterrupted coverage: arrange an actual reporter at the match.

## Featured cards and public pages

- `/sports`: published competitions, paginated 20 at a time.
- `/sports/:id`: overview, fixtures/results, groups/league table, knockout rounds and competition discussion.
- `/sports/matches/:id`: scoreboard, update/correction history (30 per page), authorised score form and match discussion.
- `/sports/desk`: organisers' competition editor or reporters' assigned-match list. Desk lists up to 100 competitions/assigned matches; reporter picker up to 100 eligible accounts.
- Sidebar/mobile feed/Explore: optional featured match card, separate from announcements. Among up to 50 featured candidates, live/halftime comes first, then scheduled within the next seven days (up to two hours after kickoff), then full-time updated within the last 24 hours. Closest kickoff wins within a priority. Postponed/cancelled/private fixtures are excluded. Unfeature completed or unmonitored matches; LIVE does not automatically become full-time.

Discussion posts are ordinary moderated social posts with explicit competition/match links. They appear in the main feed and relevant discussion feeds; replies inherit the parent context. Unpublishing a competition hides linked posts from normal reads/feeds/notifications/trends and hides the public competition, match and featured card. It does not erase previously public copies/screenshots. Existing block/mute and moderation rules continue to apply to posts. Competition/score information is public rather than a private user conversation. Likes/replies/reposts use the existing post interactions.

## Permissions and upgrade

Migration `202610180001_campus_sports` adds sports tables, optional Post context references, two navigation entries and the unassigned Sports scorekeeper role. Reserved administrator receives `sports.manage` and `sports.report`; existing custom roles and existing users receive nothing automatically. Custom organisers can be granted `sports.manage`; it includes access to the desk and score updates. The Sports desk navigation entry checks `sports.report`, so a custom manage-only user can enter from Administration → Sports or the public sports page.

No example competitions, teams, scores or assignments are seeded. Choose an organiser and reporter before expecting updates.

Stop old app terminals with Ctrl+C. Run `upgrade-from-v013.ps1 -OldProject <previous fpiupdates directory>` in the new release. It backs up PostgreSQL, preserves .env/compose/default uploads and applies only unapplied migrations. Keep the previous project and backup. Relative custom MEDIA_DIRECTORY locations still need equivalent copying; absolute persistent paths remain valid. Node >=22.12 is required.

## Deferred

Other sports/scoring rules, external live-score providers, Sparrow summaries, automatic qualifiers/bracket lines, multi-leg aggregates, player lists/goal timelines, subscriptions to team alerts, ticket payments and sports media streams. There is no new external sports-service subscription or additional server process in this release.

## Validation performed

- Backend/frontend production builds and Prisma schema validation.
- 18 unit tests, including points/tie/confirmation calculations and knockout penalty validation.
- 61 API integration scenarios on an isolated PostgreSQL-compatible PGlite wire server (single connection, UTC), including the existing social/publishing/safety/notification/analytics suite and sports permissions, stale revisions, confirmation/correction history, assignment checks and unpublished discussion filtering.
- Browser end-to-end organiser → assigned reporter → organiser confirmation → spectator flow; real form creation, standings, feed-linked discussion, desktop featured card and mobile public card. Existing profile/discovery end-to-end workflow also passed. Visual review and narrow-screen overflow checks performed.
- v0.13 migration fixture preserved existing accounts/password hashes/posts/analytics settings/custom roles; no sample sports records or automatic account-role assignments created. All 15 previously delivered migrations remain byte-identical.

Native Windows PowerShell/Docker PostgreSQL 17, Truehost deployment, real match coverage and concurrent production traffic were not executed here. Keep the previous project and generated database backup until local upgrade verification succeeds. No external sports-data agreement or automatic match feed is included.
