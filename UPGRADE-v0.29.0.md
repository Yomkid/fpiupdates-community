# FpiUpdates v0.29.0 — identity, account entry and managed help

This release is based on the uploaded GitHub source at commit 28283e1187023f2e8b8ecda0d319dc46bcac2dc6. It preserves the Vercel API proxy, current Render Docker deployment, PostgreSQL data and environment variable names. No production credentials are included.

## What changed

- Two-step email/password signup: essential account fields, then username and terms. Optional profile fields are in Settings. Google enrollment no longer requires topic selection.
- Generic “Looks good” field feedback removed. More compact input spacing, useful validation feedback and dismissible submit errors.
- Dedicated email confirmation gate before entering the signed-in application, with resend cooldown, refresh and correction of an unverified address using the current password. Google accounts bypass separate confirmation only when Google's email verification was validated.
- Dismissible, account-persisted profile-completion card. Photo, bio and interests are optional; private data does not count toward completion.
- Coloured branding on navigation, startup, account entry, email templates and newly generated PWA icons. PWA icons retain a black background. Browser/device caches may delay replacement of installed icons.
- Landing-page Google entry, installation button/help and dismissible installation promotion. No automatic installation or guaranteed cross-browser duplicate detection. QR codes are deferred; installation instructions and native prompts are the supported launch paths.
- Green SVG identity badges with an explanation dialog. Verification is separate from email confirmation and staff access. Subscriptions are not implemented or coupled to verification.
- Username reservations, manual assignment, 30-day protection and profile alias resolution for former usernames. Protected brand names can be assigned by staff; core system names cannot. Existing occupied handles cannot be seized by reservation or assignment.
- Verification applications, username claims, impersonation reports and appeals. Staff can request information, approve/reject and grant/review/suspend/revoke badges. Account notices appear in Home and Notifications; request decisions and badge changes also attempt branded account emails.
- Admin-managed rich-text pages and help articles with private drafts, preview, explicit publication, effective dates and published history. About/Help and initial help articles are seeded. Privacy/Terms/Guidelines drafts require operator review; existing beta notices remain public until publication.
- Source formatting and repeatable Prettier scripts.

## Local upgrade (Windows)

Keep your existing project folder. Extract this release into a NEW folder. The script copies configuration, starts the existing local Docker database, saves a SQL backup, installs dependencies, generates Prisma Client, applies migrations and builds both apps. It does not delete the old project or push anything to GitHub.

The automatic path intentionally refuses a hosted DATABASE_URL. Use `-PrepareOnly` for hosted configuration, then follow the hosted deployment instructions below. Backup files contain user data: store them privately and never commit them.

```powershell
$oldProject = Join-Path $HOME 'Documents\GitHub\FpiUpdates-v0.28.0\fpiupdates'
$zipPath = Join-Path $HOME 'Downloads\FpiUpdates-v0.29.0.zip'
$destination = Join-Path $HOME 'Documents\GitHub\FpiUpdates-v0.29.0'
if (Test-Path $destination) { throw 'Choose a new extraction folder.' }
Expand-Archive -LiteralPath $zipPath -DestinationPath $destination
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& (Join-Path $destination 'fpiupdates\upgrade-from-v028.ps1') -OldProject $oldProject
```

Then stop older app terminals with Ctrl+C and run `npm.cmd start` in the new `fpiupdates` folder. PostgreSQL remains in the existing Docker volume. Local file email transport writes verification links into `backend/.local-mail`; inspect these locally. Never post the tokens publicly.

The helper backs up the Compose `db` database. If you use a different local PostgreSQL database, take a backup of that exact database and apply the migration manually; do not rely on the Compose backup.

## Keep your GitHub repository as the source of truth

After testing the extracted release, apply it to your CLEAN existing Git checkout:

```powershell
& 'C:\path\to\FpiUpdates-v0.29.0\fpiupdates\apply-to-repo.ps1' -Repository 'C:\path\to\your\existing\fpiupdates'
```

This creates a new upgrade branch and copies source without replacing `.git`, secrets, dependencies, local uploads or backups. It does not mirror-delete files. Review `git diff --stat` and `git diff`, then run the builds and tests in that checkout. Commit the reviewed changes and push the upgrade branch. Merge into the deployment branch only after your hosted backup is ready. Do not force-push or replace the Git history.

If your working checkout has newer changes than the supplied source snapshot, merge those changes deliberately rather than blindly copying over them.

## Render + Vercel deployment

1. Take a private backup/snapshot of the CURRENT hosted Neon database. The local script does not back up Neon. Keep the previous deployed Git commit identifier.
2. Verify Render still uses that same DATABASE_URL and APP_URL points to the canonical frontend. Keep FRONTEND_ORIGINS, Google callback, Gmail delivery and VAPID configuration intact.
3. Deploy backend first. The existing Docker startup runs `npm run db:migrate`; verify the new migration `202610260001_identity_and_content` succeeds and `/api/v1/health/ready` returns ready.
4. Deploy/redeploy Vercel frontend from the same reviewed commit. Existing `frontend/vercel.json` stays in place.
5. Re-sign in as administrator. Open Staff tools → Username reservations, Verification & claims, and Pages & Help. The migration grants the new permissions only to the existing `administrator` role. Other staff roles need explicit grants in Roles.
6. Test email verification using an actual mailbox, Google callback on the canonical domain, an admin decision, a normal user denial, and a real phone installation. No email-provider or live Google delivery was exercised by the automated local tests.
7. Review and publish operator-specific policy content and a monitored support contact before public launch. This release does not automatically collect renewed consent after policy updates, perform legal review, or provide a document-upload identity service.

Account notices currently use active-page polling (60 seconds); they are not a new background push event. Existing social notifications and push configuration are preserved.

## Admin workflows

### Reserve and assign a name

Staff tools → Username reservations: enter the exact lowercase handle and internal reason. Existing account ownership is protected. To assign a reserved handle, get the target UUID from Staff tools → Accounts and enter it in Assign a username. Confirm the target and reason. Username claims are review records, not automatic transfers.

The old account keeps its ID, content, followers and login. Its former handle redirects during protection. Expired aliases do not redirect, so later legitimate owners are not shadowed. Existing tokenised mentions retain account IDs; plain historical text and external caches cannot be rewritten reliably.

### Grant verification

Staff tools → Verification & claims → Find an account. Select VERIFIED, category and reason after independent evidence checks. No terminal command is needed for routine badge grants. SUSPENDED/REVOKED remove the public badge. A display-name or handle change puts VERIFIED into REVIEW. Photo changes alone do not currently trigger re-review; staff should review misleading profiles through moderation.

Requests show evidence and status. NEEDS_INFO lets the applicant add information. Approving a VERIFICATION request grants the badge to an active, email-confirmed account. Other approved request types still need the separate appropriate action. Appeals do not automatically reverse moderation or grant verification.

### Edit public pages

Staff tools → Pages & Help: select or create a page. Supported page slugs are about, privacy, terms, guidelines, faq, help, and help-article-name. Help articles are publicly accessible as `/help/article-name`; seeded legacy `/help-...` links also work. Save draft, preview current edits, then explicitly publish the saved draft with an effective date. Publishing requires pages.publish; editing requires pages.edit. Changes are audited. Policy history is available from published policy pages.

## Validation and rollback

Run `npm.cmd ci`, `npm.cmd run format:check`, `npm.cmd --prefix backend run prisma:generate`, backend/frontend builds, and `npm.cmd --prefix backend test`. Integration tests require a disposable TEST_DATABASE_URL with migrations applied. Never point integration tests at production.

The migration is additive and does not delete account/post/statistics data. To roll back application behavior, redeploy the previous known-good source commit; leave additive database tables/columns in place. Do not run destructive Prisma resets or manually remove migration records. Full database restoration is a separate recovery operation and can discard writes made after the backup.

## Deferred work

Paid subscriptions and premium labels, automatic follower/engagement eligibility, QR installation, secure ID-document collection, external verification providers, automatic renewal of legal consent, a branding settings screen, and automated username dispute transfers are not included. Existing advertising payments and media storage limitations are unchanged.
