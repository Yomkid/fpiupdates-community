# Validation — 26 October 2026

- Backend TypeScript build and frontend TypeScript/Vite build.
- Prisma Client generation and schema validation.
- All 40 backend unit tests passed, including protected handle availability, conflicting staff assignment, HTML sanitization and email escaping.
- The complete 26-migration SQL chain applied to a disposable embedded PostgreSQL-compatible database, including seeded help content and published history. This is not a test of the production Neon connection or Truehost.
- Four targeted API integration tests passed against that database: permission enforcement, reservation checks across signup/profile editing, handle assignment and old profile resolution, verification approval/notices/audit, and separation of drafts from published pages/history.
- Chromium browser checks with mocked APIs passed at desktop and 390px mobile widths: landing Google/install entry, two-step signup, absence of generic “Looks good” hints and optional registration fields, email gate/resend, admin reservation and badge controls, rich-text preview, and badge dialog close without unintended navigation. No browser runtime errors or mobile horizontal overflow were observed in those checks.
- Source formatting applied with the project's pinned Prettier version.

Reproducible browser checks: build frontend, install Playwright Chromium on the development machine, then run `npm --prefix frontend run test:release-ui`. This suite mocks APIs; the targeted backend integration suite covers actual controllers and persistence. Existing historical end-to-end tests were not all migrated or executed and some still describe older registration screens.

Not exercised here: real Gmail delivery, actual Google account consent/callback, OS-level installation or push delivery, Windows execution of the PowerShell helpers, production deployments, load testing or a full accessibility/security audit. Review the upgrade instructions and test those paths on your own staging setup before inviting the public.
