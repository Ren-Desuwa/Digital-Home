# Verification — 19 October 2026

## Google sign-in and responsive UI update

- 22 integration tests pass against real SQLite using all generated migrations and the production API handler.
- TypeScript checking and the production Vinext/Vite build pass.
- New additive OAuth migration applied locally and to production; existing household schema/data is unchanged.
- Local browser checks passed on login, dashboard, phone navigation, and horizontally scrolling meal planning. Phone (390px) and tablet (820px) checks found no horizontal document overflow; phone form inputs use 16px text. Desktop login was visually checked at 1280px.
- Phone login preview saved in `screenshots/google-login-phone.jpg`.
- Real user account sessions and household data were preserved during browser QA; no existing user was signed out.

## Authentication coverage

Google authorization code + PKCE, actual RS256 signatures, provider certificate checks, issuer/audience/nonce/expiry validation, verified email, one-time browser-bound state, expired attempts, denied consent, first-run Google setup, repeated Google login, explicit linking from a logged-in account, refusal of uninvited Google accounts, rejection of silent email-based linking, duplicate Google-account linking denial, session revocation during linking, and rejection of account linking from a shared-screen PIN session.

Existing account/password recovery, child permissions, PIN pairing/revocation, recurrence/rotation, completion approval races, reward reservation/refund races, grocery synchronization, recipe URLs, Manila dates and request validation remain covered.

## Configuration and remaining verification

Google requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_ORIGIN. Production APP_ORIGIN is configured in `web/wrangler.production.jsonc`. At the time checked, Cloudflare's secret list was empty, so real Google login is not enabled or end-to-end verified. The sign-in button stays disabled until configuration is complete. Setup and deployment instructions are in `web/GOOGLE_LOGIN.md`.

A real family usability trial and Google consent/login round-trip remain outstanding. Mobile packaging, push delivery, offline editing, automatic presence and a formal accessibility audit remain deferred.

## Deployment

Deployed to https://digital-home.ren-desuwa.workers.dev on 19 October 2026.
Cloudflare Worker version: `bc2b89a3-297e-42b7-8ccc-18bced737f72`.
