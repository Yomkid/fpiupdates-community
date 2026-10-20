# Google sign-in setup

Google sign-in is optional. Password accounts continue working when these settings are absent. No Google credentials are bundled. End-to-end Google sign-in requires your own configured OAuth client; automated tests stub the provider exchange and exercise the application's safeguards.

## Local configuration

1. Open Google Cloud Console, choose/create your project, and configure Google Auth Platform branding, audience and contact details. Use an External audience for a public community. While the project is in Testing, add the Google accounts that will test sign-in.
2. Create an OAuth client of type **Web application**. For local development, add `http://localhost:5173` as an authorised JavaScript origin and exactly `http://localhost:5173/api/v1/auth/google/callback` as an authorised redirect URI. The server handles the exchange; the JavaScript origin entry is not a client-secret store.
3. Add the following to **backend/.env**, without the leading comment markers. Use your own values:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/api/v1/auth/google/callback
```

4. Keep `FRONTEND_ORIGINS=http://localhost:5173` and `APP_URL=http://localhost:5173`. Restart the application. Open **http://localhost:5173**, consistently using that hostname. The Vite proxy forwards `/api` and OAuth cookies to the backend. Do not mix localhost and 127.0.0.1 during a sign-in attempt.
5. Sign in/register: Continue with Google → Google account selection/consent → choose FpiUpdates username, display name and optional interests → accept guidelines → original local destination. Existing Google-linked users skip account creation.

The button is hidden unless all three backend variables have valid configuration. Existing backend/.env files are preserved by the upgrade script, so these new values must be added manually. Never paste the secret in chat, commit it, put it in frontend/.env or a `VITE_` variable, or place it in a public upload folder.

## Existing accounts

A Google email matching an existing FpiUpdates account does **not** automatically link or sign in to that account. Sign in using the existing password, open Settings → Connected accounts, confirm the current password and choose Google. The callback must return in the same FpiUpdates session. One Google identity can belong to only one FpiUpdates account.

A new Google-only member has no usable password until they set one through the existing email recovery flow. A password must be set and confirmed before disconnecting the sole Google method. Google Gmail/Workspace-authoritative verified addresses are accepted as verified; other Google account email addresses receive FpiUpdates email verification. Configure real SMTP or Gmail API delivery before production use. See GMAIL-AND-STAGING.md for Gmail and temporary HTTPS hosting.

## Production

Use your real HTTPS site origin and matching exact callback, for example `https://fpiupdates.com.ng/api/v1/auth/google/callback`, registered in the Google client. This assumes `/api` is reverse-proxied to the API on the same site. Set the first FRONTEND_ORIGINS entry and APP_URL to that same HTTPS site. Check Google branding/domain ownership, privacy-policy links, audience/publishing requirements and requested basic scopes in the console before public launch. Test with a non-owner account after publishing the OAuth configuration. This release requests only openid, email and profile, not Google Drive or Gmail access.

The implementation uses a one-time browser-bound state, PKCE, a nonce, Google ID-token verification and short-lived onboarding records. Platform sessions stay HttpOnly cookies. Tokens and client secrets are not included in redirect URLs. Cancelled, expired or replayed attempts return a generic sign-in error. Configure a separate OAuth client for production if appropriate; changing a client requires consistent backend settings and callback registration.

References: [Google OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect) and [server ID-token verification](https://developers.google.com/identity/sign-in/web/backend-auth).
