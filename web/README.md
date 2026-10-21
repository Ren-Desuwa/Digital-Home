# Digital Home website

Google sign-in is supported alongside passwords and child PINs. See [Google setup](GOOGLE_LOGIN.md) for Google Cloud origins, callback URLs, Cloudflare secrets, migration, and deployment commands. Existing members connect Google from their own Household card after signing in.

React + Vinext + Cloudflare D1. The private household hub includes accounts, parent/child permissions, chore scheduling and review, real recipe links, meals, groceries and optional rewards.

## Local development

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_household.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_google_oauth.sql
npm run dev
```

Open the printed loopback URL and create the first parent account. Save its recovery code. Parent accounts sign in by email; children can use parent-created usernames or email. Email delivery is not configured. Parents recover with their one-time code and reset children’s passwords/PINs from Household.

Local D1 data is in ignored `.wrangler/state/`. Hosted deployment uses a separate D1 database and applies the generated migrations through Sites. A private Sites deployment also requires the platform’s access permission before household login; invite family through hosting access settings or configure appropriate private hosting before the family trial.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests apply real SQL migrations to SQLite and exercise the production API, including role enforcement, recovery, pairing, recurrence, rotation and races in completion and reward spending.

## Security and persistence

Single-household aggregate with revision-based compare-and-swap writes; no browser-local household database. Salted PBKDF2-SHA256 credentials, hashed bearer sessions/recovery codes, HttpOnly SameSite cookies, Secure cookies on HTTPS, same-origin JSON writes, and per-IP/per-identity authentication throttling. PIN sessions require their paired device to remain valid. Member cap: 30. The aggregate is designed for one small household, not public multi-tenant use.

Only parents configure members, schedules, meal plans, recipes and rewards. Children complete their own tasks, request help, update their own presence, contribute groceries and request rewards. Parent review is configurable per child. Points are reserved at reward request time and refunded exactly once on rejection.

Shared screen: pair as a parent in Household, then sign out. Children can open profiles with a PIN. Parent management requires email/password login. Pairing expires after 30 days; sessions after seven days.

Recipe sources are external links, including YouTube. Starter preparation/serving values are estimates. Ingredients are manually entered and reviewed before shopping; no generated instructions or scraping. Preferences are tags, not allergy checks.

Website phases 1–4 are implemented and require a real household trial. Mobile packaging, push notifications, offline editing and automatic presence are deferred. See [ROADMAP.md](ROADMAP.md).
