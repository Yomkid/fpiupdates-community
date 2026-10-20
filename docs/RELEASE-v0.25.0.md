# FpiUpdates v0.25.0 — PWA, Gmail and staging preparation

## PWA

The application now has a web manifest, 192/512-pixel maskable icons derived from the existing brand mark, standalone launch metadata and home/Explore/notification shortcuts. More → Install FpiUpdates and Settings → App & installation expose installation controls. A browser install prompt is used only after a click; unsupported browsers receive their manual installation guidance. iPhone/iPad users can use Safari → Share → Add to Home Screen. Actual controls depend on browser/device and HTTPS (localhost is permitted for development).

The existing notification worker is also the PWA worker, avoiding two workers competing for root scope. Only a public offline page, manifest and two icons are cached. API responses, user profiles, private feeds/messages, mail/reset URLs and uploaded media are not cached by the worker. Offline navigation shows a reconnect screen, not a stale signed-in shell. There is no offline posting or offline private-feed reading. Web app installation is not an app-store release or closed-app Web Push implementation.

When an updated worker is waiting, the installation area offers Reload to update. It activates only through that action; the app does not force a reload over an unfinished composer draft. Existing native notification click destinations remain supported.

## Gmail and Google

Existing file-development and SMTP email delivery remain. EMAIL_TRANSPORT=gmail-api adds Gmail sending over HTTPS for hosts that block SMTP. It builds an RFC mail message, uses OAuth refresh credentials on the backend, sends with the Gmail API and does not put credentials into the browser or mail body. Transport failures retain the existing recovery service's safe errors and token cleanup. Google sign-in still requests only basic identity scopes; the sender account's gmail.send consent is separate.

The local gmail:authorize operator command uses a five-minute loopback state/PKCE flow and saves a non-overwriting, ignored .env.gmail snippet. The email:test command sends one explicit test message to the operator-supplied recipient. No Gmail account, app password, OAuth client or inbox was configured/sent to in this build environment. The guide covers local SMTP/app-password setup, HTTPS mail consent, testing-mode token expiry and the existing member Google sign-in callbacks.

## Hosting and repository preparation

The root Dockerfile builds frontend/backend and can serve both from one origin. The optional SERVE_FRONTEND mode keeps /api separate from static assets and handles deep SPA routes. Hashed public assets receive immutable caching; shell/worker updates do not. TRUST_PROXY_HOPS is opt-in for a known hosting proxy. render.yaml describes a small free staging service using an external PostgreSQL URL, Gmail API secrets and the assigned HTTPS hostname. Source remains divided into backend/frontend folders; a shared hosting origin is a deployment choice.

MEDIA_UPLOADS_DISABLED=true pauses every new image upload, including profile/cover images, and publishes that availability to the UI. The free staging recipe uses it because runtime local files are ephemeral. It does not erase historical media. Automatic publishing/analytics workers are also disabled in this small preview recipe, so do not rely on scheduled jobs there. Production requires persistent storage, always-on background execution, provider configuration and backup/restore testing.

The repository has not been uploaded to GitHub and no live service has been created. .gitignore/.dockerignore exclude environments, uploads, generated email, backups, dependencies, release ZIPs and common OAuth credential downloads. Review staged changes locally before creating/pushing a private repository. GMAIL-AND-STAGING.md contains the account setup/deployment sequence and official references.

## Upgrade

Run upgrade-from-v024.ps1 -OldProject <working-fpiupdates-folder> after extracting. An earlier supported folder may also be supplied; migrations are applied in order. The script backs up PostgreSQL and preserves environment/Compose/default local uploads. No new database migration is added; all twenty-two delivered SQL migrations stay unchanged. New provider settings must be entered manually; upgrading does not replace local credentials.

After setup, check Settings → App & installation. To test the email provider, configure a sending account privately and run the explicit test command. To deploy, create the private repository and provider accounts, set actual staging secrets/origin/callback URLs, then test the real container and hosted app before inviting people. A later production domain is a new browser origin: staged installations and sessions do not automatically move to it.
