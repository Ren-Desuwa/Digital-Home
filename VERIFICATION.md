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

## Current local additions — device inventory and 3D home builder

- Added parent-managed device inventory and a shared single-floor room/furniture layout with server-side persistence in the existing household aggregate. No schema migration is needed for these fields; existing households can use them without a reset.
- Added room links for chore routines, room-based due/pending dashboards and the existing household home/away roster in the 3D view.
- 27 integration tests pass, including new coverage for inventory CRUD, role/access checks, legacy households without layout fields, geometry validation, concurrent/stale layout saves and room-link cleanup without deleting tasks.
- TypeScript checking and the production build pass. Parent/member server renders were checked for role-specific controls, starter rooms and finite projected geometry.
- The starter SVG scene was rendered to PNG and visually inspected; the image is saved in `screenshots/home-builder-starter.png`. This is a scene render, not a browser screenshot.
- Browser automation was unavailable: no browser surfaces were connected, and opening the in-app browser returned “Browser is not available: iab”. Interactive and responsive visual QA remains outstanding.
- Changes are local and have not been deployed. No production data was modified and no actual family devices were entered.
- The original October 19 production and Google configuration notes above are historical; production configuration was not rechecked for this addition.

## 28 October 2026 — grid-based Home Studio

- Built a separate static React/Three.js Studio for Vercel. Existing Cloudflare/D1 household workflows and layout storage remain separate; the new grid schema saves locally in the browser.
- Added versioned JSON validation, geometry and collision rules, undo/redo, browser autosave with storage-error handling and cross-tab overwrite detection, export/import, PNG snapshots and interactive SVG fallback.
- Seven new builder model tests pass: starter and empty-layout round-trips, rotated footprints, furniture collisions/rugs, wall crossing, canonical shared edges, malformed imports and unknown-field stripping. All 27 existing household integration tests pass.
- TypeScript checking and both the standalone Vite production build and existing Vinext production build pass. The lazy-loaded Three.js chunk produces a size warning; it is not a build error.
- Browser checks exercised floor painting through precise placement, walls/doors, furniture placement and collision rejection, removal, undo/redo, save, JSON export, empty plot, restoring the exported file, camera rotation and top view. The 390 px responsive check has no horizontal document overflow. Physical touchscreen gestures, long-session performance and family usability have not been verified.
- Vercel configuration is supplied for repository-root and `web` project roots.
- Published the verified static build to production on 28 October 2026 in the personal `ren-72c4` workspace. Vercel reports READY for deployment `dpl_Ev4sbKhM43QQdu3rUe4XKhD8K1ZP`, project `prj_5vDB8MSGrhRuQ9ugXXU9GrBrSfc0`, builder source commit `56d548dd3a30101df8e923847bda90c4894986e2`.
- Live URL: https://digital-home-dusky.vercel.app (also https://digital-home-ren-72c4.vercel.app). Browser verification on the live site confirmed the 3D scene, camera rotation, floor-plan switching and camera reset. A live screenshot is retained with the chat artifacts.
- This release used a direct upload of the locally verified static build. Git linking was rejected because the personal Vercel account needs a GitHub Login Connection; automatic deployments from future pushes to main are not configured. The GitHub source remains pushed and the project keeps the source build settings for future Git linking.
- Studio saves remain browser-local; the Cloudflare household deployment and its data were not changed.
