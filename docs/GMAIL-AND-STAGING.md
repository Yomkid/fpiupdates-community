# Gmail, Google sign-in and a temporary staging deployment

Prepared 20 October 2026. No Gmail, Google Cloud, GitHub, Neon or Render account has been connected by this package. Provider delivery, consent and live deployment need the owner's account settings. Keep passwords, refresh tokens and database URLs out of chat and GitHub.

## Recommended sequence

1. Install this release locally and test PWA/offline behaviour.
2. Use a dedicated Gmail sending account for verification/reset emails. Google sign-in uses a separate OAuth web client.
3. Put the source in a private GitHub repository, rooted at the fpiupdates folder (backend/, frontend/, Dockerfile and render.yaml at repository top level).
4. Create a separate Neon staging database and a Render Free Docker web service. One origin serves the compiled React frontend and /api, avoiding cross-site session-cookie complications. No custom domain is required; use the assigned HTTPS onrender.com address.
5. Enter Gmail API and Google sign-in credentials in hosting secrets; register exact callback URLs. Test with a second account.
6. Before production, choose an always-on host, persistent media storage and real backup/restore operations. Set production domain/callbacks only after DNS/HTTPS work.

## Gmail option A: easiest local SMTP test

Google app passwords require 2-Step Verification and may be unavailable for some account/security configurations. Use an app password, not your normal Gmail password. Add/change these in backend/.env and restart the app:

```dotenv
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sender@gmail.com
SMTP_PASS=your-app-password-without-grouping-spaces
SMTP_FROM="FpiUpdates <your-sender@gmail.com>"
APP_URL=http://localhost:5173
```

From backend/, after building, run `npm run email:test -- your-test-recipient@example.com`. This sends an explicit delivery-test email to the address you choose; check inbox and spam. Then test registration, Settings → Account → Send verification email, link expiry/reuse and password recovery. Setting REQUIRE_VERIFIED_EMAIL=true locally lets you test the production participation gate. This SMTP setup will not work on Render Free, which blocks ports 25, 465 and 587.

## Gmail option B: HTTPS sending on free staging

The gmail-api transport uses Google's Gmail API over HTTPS, with only gmail.send consent for the sender account. It does not request mailbox-reading access. Members signing in with Google continue to grant only openid/email/profile; their sign-in grants are never used for sending mail.

1. In Google Cloud Console create a separate mail-sending project/client for a small test. Enable **Gmail API**. Configure Google Auth Platform branding/audience, add the sending Gmail account as a test user, and add the gmail.send scope when configuring data access. Google may apply sensitive-scope/app-verification requirements before broader production use.
2. Create a **Web application** OAuth client for this local operator tool. Add exactly `http://127.0.0.1:53682/oauth/gmail/callback` to its authorised redirect URIs. This is not the member Google sign-in callback.
3. Put GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and SMTP_FROM="FpiUpdates <your-sender@gmail.com>" in backend/.env. The sender must be the account that authorises sending, or an authorised Gmail send-as address.
4. From backend/, run `npm run gmail:authorize`. Open the printed Google consent URL in your browser and authorise the dedicated sending account. The loopback callback checks state and PKCE, listens only on 127.0.0.1 and times out after five minutes. It prints no tokens.
5. The tool creates backend/.env.gmail with mode 0600 where supported and refuses to overwrite an existing file. Copy its entries into backend/.env for local use, or individually into Render environment secrets for staging. The generated file is ignored by Git and Docker. Do not upload it or paste it in chat. If reauthorising, safely move the previous file out of the way before running again.
6. Select EMAIL_TRANSPORT=gmail-api, restart and run the explicit email:test command above. The package cannot confirm inbox delivery without your credentials.

For an External OAuth app in Google's **Testing** state, mail-scoped refresh tokens normally expire after seven days. Reauthorise as needed for a short test. This exception differs from identity-only Google sign-in scopes. Gmail also has sending/anti-abuse limits; use it for a small pilot, not bulk mailing. A verified-domain transactional email provider is the later production path.

## Member Google sign-in

Follow GOOGLE-SIGN-IN.md. For localhost use GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI=http://localhost:5173/api/v1/auth/google/callback. For staging, register the exact assigned HTTPS origin and `https://YOUR-SERVICE.onrender.com/api/v1/auth/google/callback`, and use that URL in GOOGLE_REDIRECT_URI. Keep APP_URL and FRONTEND_ORIGINS equal to that same origin. Do not put secrets in VITE_ variables. Test a newly enrolled Google account, an already linked account and explicit linking from a password account. Gmail sending and Google sign-in may be configured independently.

## Private GitHub repository

No repository has been created or pushed automatically. The supplied .gitignore excludes environments, generated mail, local uploads, database backups, dependencies, build outputs, credential downloads and ZIP bundles. It cannot protect secrets you manually paste into tracked source files.

Create an empty **private** repository in GitHub, without adding a separate README. Open PowerShell in your working fpiupdates folder. Run `git init`, `git branch -M main`, `git add .`, then **review `git diff --cached --name-only` and `git diff --cached` locally**. Do not commit .env files, OAuth JSON downloads, database backups or uploads. If anything sensitive appears, unstage it and fix ignore rules first. Then commit, add the private repository's URL as origin and push main. Use Git Credential Manager or GitHub Desktop for authentication; no password belongs in a remote URL. Existing CI builds and tests the backend against disposable PostgreSQL and builds the frontend.

## Render Free + Neon staging

Current official docs describe a free Render web service that sleeps after fifteen minutes of no inbound traffic, takes roughly a minute to wake, and loses runtime filesystem writes on restart/redeploy/spin-down. Render's own free Postgres expires after thirty days; use a separate Neon free project instead. Neon advertises a free tier without a fixed trial expiry, subject to storage/compute/network allowances. Verify the current limits in your account before provisioning. A free preview is not production uptime.

1. Create a Neon **staging** database. Use its direct PostgreSQL connection URL with the supplied TLS settings (the direct hostname has no -pooler suffix). Keep it private. This app uses a small client pool and UTC startup options; the direct endpoint also keeps migrations independent of pooler compatibility.
2. Create a Render **Docker Web Service** from the private repo. Repository root is the fpiupdates folder; Dockerfile path ./Dockerfile, Docker context ., Free plan, health path /api/v1/health/ready. render.yaml supplies a Blueprint alternative.
3. Enter DATABASE_URL (Neon direct URL), DB_POOL_MAX=2, APP_URL=https://YOUR-SERVICE.onrender.com, FRONTEND_ORIGINS with the identical origin, REQUIRE_VERIFIED_EMAIL=true, TRUST_PROXY_HOPS=1 for the trusted hosting proxy, and your Gmail API secrets. Docker sets NODE_ENV=production and SERVE_FRONTEND=true. Do not override PORT; the server reads the hosting environment. No frontend VITE_API_URL is needed for this same-origin setup.
4. Keep MEDIA_UPLOADS_DISABLED=true: every fresh upload is rejected and the UI hides upload controls. Local disk is ephemeral, so do not invite users to upload avatars/covers there. Existing media records copied from another environment will not automatically transfer their image bytes. Persistent external media storage or a paid persistent disk is needed before media testing on a deployed host. v0.26 adds private R2 support: follow R2-STORAGE.md before lifting this pause.
5. Keep PUBLISHING_WORKER_DISABLED=true and ANALYTICS_WORKER_DISABLED=true for this small free preview to avoid idle database work. Scheduled publishing and automatic analytics reports will not run under these settings; text/auth/PWA/manual posting and manual publication remain available. Re-enable workers on an always-on environment when testing their scheduling. Even with workers enabled, a sleeping service cannot provide timely background delivery.
6. The Docker command runs committed migrations before startup. Do not import your local development database into a public preview by accident. Use a separate test database and selected test content. No database password is baked into the image.
7. Register and verify your own staging account. Free Render lacks shell/one-off jobs, so grant the first administrator from your local backend CLI, connecting deliberately to the Neon staging database. In a separate PowerShell window set `$env:DATABASE_URL` to that staging URL, run `npm.cmd run admin:grant -- your-account@gmail.com` from backend/, then remove that process variable with `Remove-Item Env:DATABASE_URL`. The command grants the specified existing email and records a bootstrap audit; it does not create an account or grant the first stranger to register.
8. Sign in again, apply the text-first preset and test two member accounts. Add Google callback credentials after the assigned site URL is known. Check both /home and a direct /u/username link, registration/verification/reset, sign-in persistence, offline fallback and phone installation controls.

The Docker recipe was supplied for deployment, but no Docker daemon or live provider account was available in the build environment. The equivalent single-origin static/API behaviour is covered by tests. Run the actual image build and hosting smoke test before inviting testers.

## Later move to production

Deploy the same source to the selected production host, configure its database/media environment, and test backup restoration before copying selected staging data. Keep staging separate. Add the production origin/callbacks to Google, update APP_URL/FRONTEND_ORIGINS/GOOGLE_REDIRECT_URI, set the domain and HTTPS, enable workers and move to domain-based transactional mail. Replace Gmail transport settings without rewriting registration/recovery. The PWA belongs to its origin: installation on the temporary staging hostname does not automatically become an installation on your new production domain. Ask testers to install the production address again.

## Official references checked

- Google app passwords: https://support.google.com/accounts/answer/185833
- Gmail sending: https://developers.google.com/workspace/gmail/api/guides/sending
- OAuth refresh-token/testing limits: https://developers.google.com/identity/protocols/oauth2
- Render Free limitations: https://render.com/docs/free
- Render Docker deployment: https://render.com/docs/docker
- Neon pricing/allowances: https://neon.com/pricing
- PWA installation behaviour: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
