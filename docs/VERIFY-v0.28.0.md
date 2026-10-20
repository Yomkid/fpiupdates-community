# v0.28.0 validation

- Backend Prisma generation and production build: passed.
- Frontend TypeScript and production build: passed. Existing advisory: main bundle exceeds Vite's 500 kB threshold; lazy article/message chunks remain separate.
- Backend unit suite: 36 passed, 0 failed, including push endpoint restrictions, preview escaping/visibility, schedule limits, expired sessions, delivery retries and review ownership.
- Disposable PostgreSQL-compatible PGlite fixture: all 25 migrations applied. HTTP assertions passed for install privacy/permission checks, public/private HTML and image previews, campaign ownership/review/audit/no-charge boundaries, push subscription validation and logout cleanup. Real PostgreSQL deployment testing remains required before launch.
- Chromium browser flow: passed. Installation guide and white manifest theme, light/dark toolbar colour, account login and dynamic profile title, unconfigured-push state, public metadata/image, campaign draft/save/submit and mobile no-horizontal-overflow.
- ZIP CRC, SHA-256 and unchanged historical migration comparison: verified at packaging.

The working environment reset during development; v0.27.0 was recovered from its verified saved ZIP before rebuilding v0.28.0. The results above refer to the rebuilt final files.

Physical-device/provider checks remain separate: Android and desktop background push; iPhone/iPad Home Screen permission/delivery; actual WhatsApp/X previews from a public HTTPS deployment; icon refresh on previously installed apps. No physical-device or real push-service delivery has been claimed as verified here. No real VAPID identity, payment account or paid storage was activated.
