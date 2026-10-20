# v0.12.0 analytics deployment

Stop the previous app and run upgrade-from-v011.ps1. The additive 202610170004_analytics migration preserves existing records, creates analytics tables plus a one-time random hashing secret/tracking timestamp, defaults public rankings to disabled, adds the member opt-out, seeds navigation and grants analytics.view/manage only to the reserved administrator role. Custom staff roles retain their existing permissions. SQL backups include the secret, rollups and report snapshots; uploaded images still need the existing filesystem backup.

Keep the API process alive for minute-level operational flushes, weekly snapshot catch-up and raw-data retention. ANALYTICS_WORKER_DISABLED=true is for isolated tests/maintenance, not the normal live server. Audience writes commit immediately; operational buffers can lose the last unflushed observations on a crash. Weekly reports start only once a measured week has completed, and initial partial coverage is labelled. No extra Redis, paid analytics provider, tracking credential, port or npm dependency is introduced.

LocalStorage now contains an optional daily random analytics identifier and, when explicitly selected, an analytics opt-out. These are not access tokens. Only coarse page/source enums are sent; application audience tables do not store IPs/user agents/full URL/referrer strings. Hosting/proxy access logs are a separate operator responsibility. Honor configured exact frontend origins for the anonymous collection endpoint, retain TLS in production and do not use visitor beacons as financial billing evidence. DNT/GPC and common crawlers reduce measured traffic. NAT traffic over the collector's 600/minute IP allowance and browser restrictions can undercount; native capacity/rate testing is required before a campus-wide launch.

Verify public/private routes, custom role revocation, ranking settings/opt-outs, meaningful measurement timestamps, same-browser deduplication, Monday WAT boundaries and backup restoration on the real host. Native PostgreSQL query plans, concurrent collection/report claims, shared-host process persistence and Windows PowerShell scripts remain deployment checks. Do not advertise current-process uptime as measured site availability or display disconnected revenue as zero. Current local media quota remains 512 MiB; remote storage is not implemented here.

# v0.11.0 deployment

Stop previous API/frontend processes and run upgrade-from-v010.ps1. It backs up the existing PostgreSQL database and preserves environment, compose configuration and default local uploads. Apply 202610170002_mention_kind and then 202610170003_text_entities; the MENTION enum must commit before the following trigger uses it. Existing migration files are unchanged. This requires the same enum/table/index/function/trigger privileges as earlier releases. No additional runtime service, port, package dependency or API credential is needed.

Database backups now include text entities. No historical entities or alerts are backfilled. Keep the preceding backup and project folder until verification. Check two-account mention notification delivery, username-change linking, blocked/muted suggestions, exact hashtag pagination and mobile composers on the actual host. Existing secure-context/permission requirements for desktop alerts still apply; no closed-site Web Push was added. The Node shared-hosting persistence/capacity, Windows upgrade execution, native PostgreSQL 17 concurrency and complete restore remain separate launch checks.

# v0.10.0 publishing deployment

Stop the previous app, run upgrade-from-v091.ps1, and preserve its generated SQL backup, prior source and media files. The additive 202610170001_publishing migration creates ArticleWorkingCopy and its user references/indexes. No reset, volume deletion or archive import is needed. SQL backups cover working copies and schedules; local cover image files require a separate filesystem backup, as before.

Run the API continuously for timed publication. The embedded scanner checks approximately every 15 seconds, at most 20 due copies per tick; overload/outages can delay delivery. Schedule records use TIMESTAMPTZ and survive restarts. The UI always asks for Nigeria time, independent of the browser's locale/timezone. If local PowerShell is closed, the API stops and due articles wait for its next start. A frontend-only/static host cannot execute this scanner. Confirm process persistence/restart behavior and native PostgreSQL privileges with Truehost; shared Node.js support alone does not establish scheduling reliability.

No Redis or extra billed scheduling service is introduced. Leave PUBLISHING_WORKER_DISABLED unset/false on at least one live API process. That flag is for controlled tests/maintenance, not a user-facing scheduling toggle. Verify schedule, cancel/reschedule, worker restart recovery, actual UTC database session, email-verification policies and backup restoration on the target host before launch. Existing article discussions remain subject to moderation and block/mute visibility; publishing an edit does not bypass a hidden discussion.

# v0.9.1 delivery setup

Sync polling has a 60-request/minute allowance per session plus a 1,800-request/minute IP backstop. Other routes retain their previous limits. This avoids grouping all regular polling into the old 180/minute allowance for one campus Wi-Fi IP; it does not establish a tested hosting capacity.

Run both new migrations in order; LIKE enum addition must commit before the following trigger is installed. Serve /notification-worker.js as JavaScript at the origin root, without SPA fallback. It has no fetch handler/cache. HTTPS is needed outside localhost for browser notifications. Users must enable permission and OS notifications themselves. The Notifications page includes Enable/Disable and Send test notification controls. Web Push for a closed site is not implemented.

The app checks active tabs about every 5 seconds, background tabs about every 15 seconds, and backs off after failures. Browser throttling and operating-system sleep can delay updates. Existing API throttles and native Truehost capacity still need load validation. Do not promise instant delivery or banners when the browser/OS blocks them.

# v0.9 deployment additions

Apply 202610160007_notifications while the old application is stopped. Its PostgreSQL account must create tables, indexes, enum types and PL/pgSQL functions/triggers. This is the same class of function/trigger privilege already needed for feed events. Application database connections append -c timezone=UTC to their startup options, preserving other URL options and TLS settings. Confirm session timezone is UTC when checking a native deployment. No Redis, notification daemon, SMTP or additional port is required for in-app notifications. Existing production email verification requirements still apply to social writes.

Count polling runs every 30 seconds per visible signed-in tab, with failure backoff and focus refresh. Native PostgreSQL query plans, concurrent load and Truehost limits still need validation before a public launch. Notifications store references, not copies of uploaded media. Their data is covered by PostgreSQL backups. Automatic retention/pruning is not implemented; include table growth in capacity planning.

# v0.6 deployment additions

Preview fetching needs outbound public DNS and HTTP/HTTPS. It uses direct DNS-pinned connections and does not inherit HTTP proxy environment variables. Sites denying crawlers or responses beyond the size/time budgets fall back to ordinary links. No scripts, iframes or videos are executed/embedded by the preview parser. Keep infrastructure egress rules that deny internal/metadata networks as an additional boundary.

The migration creates PL/pgSQL trigger functions for FeedEvent. Confirm the PostgreSQL account has the required schema/function/trigger privileges before applying in production. Cached preview metadata/thumbnails are stored in PostgreSQL and therefore included in its backup; user-uploaded image files still require a separate media-directory backup. Cache capacity starts at 500 snapshots and 256 KiB per thumbnail; its maintenance/eviction interface is future work. Old posts are not automatically crawled. R2/CDN work is still pending.

# cPanel compatibility and deployment checklist

Truehost support has said Starter permits Node.js/PostgreSQL; reported sample account ceilings: 4 GB physical memory, 50 processes, 20 entry processes. CPU allocation and real workload capacity remain unverified. A memory ceiling is not reserved RAM. No deployment test has been performed on Truehost.

## Compatibility probe before full deployment

1. Confirm a compatible Node version and supported PostgreSQL version; npm and SSH available.
2. Create a separate test database and least-privilege database user. Do not use KrossCheck credentials.
3. Configure the Node application manager with project root `backend` and startup file `dist/main.js`. Use the manager's Node virtual environment. Obtain host guidance if its loader rejects the compiled startup style.
4. Install exact dependencies using `npm ci`, generate Prisma Client and compile. Run migrations with `npm run db:migrate`; generation/compilation must occur while dev dependencies are available. If memory constrained, build in a compatible CI/Linux environment and verify the resulting artifact on the host. Do not upload Windows node_modules.
5. Configure NODE_ENV=production, DATABASE_URL, DB_POOL_MAX (start 3), FRONTEND_ORIGINS=https://fpiupdates.com.ng and the port required by the host. There is no fixed public port assumption; the host must route requests to its managed application.
6. Restart through cPanel and test /api/v1/health and /api/v1/health/ready, registration, login, publication and logout over HTTPS. Keep probe accounts private.
7. Test after idle periods/restarts, validate forwarded client IP behavior, verify TLS/database transport according to provider instructions. Never disable certificate verification to mask failures.
8. Load-test measured request rates with representative data; track errors, response times, process limits and database connections. Increase package only based on evidence.

## Production gates (not met by this checkpoint)

Staffed moderation/report triage, account verification/recovery, reviewed privacy/retention policies, secure media processing, abuse controls beyond one process, dependency review, independent encrypted backups, tested restore, monitoring, source control and rollback rehearsal. Restrict testing until these gates are met. Treat all credentials as secrets.

Local schema migration is additive setup. Never run migrate reset/db push against a production database. Review future migrations and restore strategy before deployment. Code rollback must remain schema compatible. A hosting move requires database backup/restore, URL/env changes, media copying when applicable and checks before DNS cutover; no framework rewrite should be needed.

CORS origins must list exact trusted frontend origins. Rate limiting currently uses direct client IP and local memory. Configure trusted proxy addresses only after verifying the cPanel request path; blanket trust permits spoofing. Long-running jobs, WebSockets and cron behavior need separate testing before using them. No PM2/Redis requirement exists for this checkpoint.

Backups are not provided by this repository. Before public launch, document renewal ownership, independent backups, recovery objectives, alert recipient and an incident contact. Keep secrets, access tokens and unnecessary personal information out of logs.

## Frontend checkpoint 0.2

Build frontend with VITE_API_URL=https://api.fpiupdates.com.ng/api/v1 and deploy dist as static content. Configure exact HTTPS FRONTEND_ORIGINS and NODE_ENV=production on the API. Host-only cookies stay on the API hostname; credentialed fetch sends them for same-site HTTPS requests. Keep API/frontend within the same registrable site. Verify Secure/HttpOnly/SameSite flags, reload persistence, cross-origin write rejection and logout on the actual host. Use the supplied .htaccess fallback for deep frontend URLs if the server supports Apache-style rewrite rules. Do not point the static rewrite at the backend directory. Frontend production API settings are baked into its assets.


## Checkpoint 0.3 production requirements

Run npm ci, prisma:generate, db:migrate and build on the new backend. Do not change/remove the old migration. Configure APP_URL to the real HTTPS frontend origin, EMAIL_TRANSPORT=smtp and SMTP_HOST/PORT/USER/PASS/FROM. Production file-mail delivery is refused; verify mail delivery before enabling public signup. Production participation requires verified email regardless of a local false flag. Link tokens use fragments; never log or publish them. Keep .local-mail out of public hosting and backups shared with others.

Grant the initial administrator using npm run admin:grant -- ACCOUNT_EMAIL in backend after registration and migration. That command relies on privileged database access, so restrict shell access. Review staff role combinations. Menu hiding is not authorization. Set real moderation coverage and response procedures. Audit and report snapshots need a reviewed retention/access policy.

New front routes /articles, /editorial, /communities, /bookmarks, /settings, /admin, /verify-email, /reset-password and /forgot-password require the SPA fallback. Static frontend remains independently deployable. All links are text/http(s); remote URL preview fetching was deliberately not added.

The current server sends SMTP synchronously with finite timeouts. Use measured traffic to decide on background delivery and distributed limiting. Approximate member-day views are not billing-grade analytics. Validate permissions, client-IP handling, database connections, email delivery, backups and restoration on the actual host. Standard PostgreSQL 17 CI is configured; PGlite-based local tests do not establish hosting capacity.

## Media storage (v0.5)

Use Node >=22.12 and run npm ci on the actual deployment OS/CPU so Sharp's matching native package is installed; do not copy Windows node_modules to Linux. Truehost must support that binary and a persistent writable MEDIA_DIRECTORY. Prefer an absolute path outside the web root, owned by the backend OS user (default directory mode 0700 and files 0600). Do not expose it through Apache/Nginx static routing; the API checks whether an image may be viewed. Configure the hosting/proxy request body limit above the 5 MiB file limit plus multipart overhead (for example 6 MiB), and preserve the multipart Content-Type boundary. Do not blanket-enable trust proxy; configure client IP handling only for the actual trusted proxy.

Backups need both PostgreSQL and the media directory. Stop writes or take a consistent snapshot while backing up. Restore both into an isolated environment and test public/owner-only reads before production use. Default media limits are 512 MiB total, 100 MiB/account and 50 uploads/account/24h; retained files count. Storage management, cleanup, object storage/CDN support and multi-instance storage are future work. These paths are excluded from source ZIPs and git.
