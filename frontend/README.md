# React frontend

React 19, TypeScript, React Router, Lucide icons and Vite. Separate package and deployment from the NestJS backend.

- `npm ci` installs exact dependencies.
- `npm run dev` starts http://localhost:5173, proxying /api to localhost:3000.
- `npm run build` checks TypeScript and writes static frontend/dist.
- `npm run preview` previews the build; run a backend/API route configuration separately (the development proxy is not a production server).

Optional .env: VITE_API_URL defaults to /api/v1. It is public build-time configuration, not a secret. API_PROXY_TARGET can override the local backend target when starting Vite. Proxy preserves Origin; use localhost in the browser and configure FRONTEND_ORIGINS accordingly.

Routes: / campus, /search?q=... search, /u/:username profile, /posts/:id conversation, /register, /login, /about. Apache SPA fallback is in public/.htaccess. No sample users/posts are embedded into the app.

The browser uses fetch credentials:include and HttpOnly sessions. No credentials are written to localStorage. Mutating cookie requests require the backend's exact Origin allowlist. TLS and same-site frontend/API domain arrangement are required in production. Public user/post data must never be rendered as HTML. Styles use the system UI font stack with no external font requests.

The report dialog stores a private ticket for permission-checked staff review. Block/mute controls appear in post menus and profiles; private lists are managed at /settings/safety. Moderators can filter, review, resolve/reopen and hide/restore reported content. Shared URLs use the current browser origin. Likes, reposts, quotes and bookmarks are implemented; in-app reply/follow/repost/quote notifications are available at /notifications.

Desktop navigation and the mobile header share an unread badge. One provider syncs notifications about every 5s active/15s in background, updates the tab title, and supports optional desktop alerts while the site remains open. Inbox GETs do not mark items read; explicit read actions persist on the server. /notifications is available to members and follows menu visibility settings.

## Browser regression test

Build the backend first. Create a disposable PostgreSQL database, apply backend migrations to it, and set E2E_DATABASE_URL to that same test connection string. Run `npx playwright install chromium`, then `npm run test:e2e` from frontend. The test starts both applications unless E2E_REUSE_SERVER=1 explicitly requests an existing test server. It creates test accounts/posts; never use a real/live database. CI service tests run independently. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH optionally selects a preinstalled Chromium binary.


## Checkpoint 0.3

New routes: /settings, /bookmarks, /communities and /communities/:slug, /articles and /articles/:slug, /editorial, /admin, /forgot-password, /reset-password and /verify-email. Registration supports interest checkboxes. The desktop navigation comes from /navigation; the mobile bar links to core screens, and profile links reach settings/bookmarks/staff tools. Approved http(s)/www URLs become outbound links; the first URL receives a bounded backend-fetched metadata preview when available. Menu labels do not grant API permissions.

Optional staff browser regression requires E2E_STAFF_EMAIL/E2E_STAFF_PASSWORD for a deliberately provisioned isolated test account. Recovery UI regression requires E2E_VERIFY_TOKEN/E2E_RESET_TOKEN for one-use isolated fixture tokens. Never provide production credentials. These tests skip unless explicitly configured. The basic member test remains runnable without staff secrets.
