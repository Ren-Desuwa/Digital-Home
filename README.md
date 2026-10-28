# Digital Home

## Project roadmap

Read [ROADMAP_NEXT.md](ROADMAP_NEXT.md) for the canonical active roadmap: public registration and multiple households, architecture migration, chat, the customizable 3D home/furniture builder, advanced design, collaboration, and mobile/public beta. It distinguishes implemented local features from proposed milestones and unresolved decisions. [ROADMAP.md](ROADMAP.md) records the original website phases.

Google sign-in is supported alongside passwords and child PINs. See [Google setup](web/GOOGLE_LOGIN.md) for Google Cloud origins, callback URLs, Cloudflare secrets, migration, and deployment commands. Existing members connect Google from their own Household card after signing in.

A private household hub for chores, tasks, meals, groceries, and optional rewards.

The application lives in **web/**. It uses React 19, Vinext, and a Cloudflare D1 (SQLite) database. Household records live on the server; browser storage is not the source of truth. The default timezone is Asia/Manila.

## Home Studio · Vercel preview

Live Studio: [digital-home-dusky.vercel.app](https://digital-home-dusky.vercel.app). This release is a direct static deployment; automatic deployments require connecting GitHub in the personal Vercel account.

The standalone grid builder is in `web/builder/`. It has a real Three.js scene, a 20 × 20 m tile grid, floor painting, edge walls, doors/windows, nine furniture pieces, collision checks, moving/rotation/colors, room naming, undo/redo, camera controls and a 2D fallback. It opens with a furnished four-room sample and offers an empty plot.

Run `npm --prefix web run dev:builder` (port 5174), `npm --prefix web run test:builder`, and `npm --prefix web run build:builder`. The static build is emitted to ignored `web/dist-builder/`.

Import this GitHub repository into Vercel using the repository root. The root `vercel.json` sets the install/build commands and output directory; `web/vercel.json` also supports an existing Vercel project rooted at `web`. No environment variables or database are required for Studio. Both `/` and `/builder` open Studio in that deployment. Avoid overriding these settings with a Next.js framework preset.

Studio automatically saves in this browser, with explicit save, JSON export/import and PNG snapshots. It does not synchronize layouts between devices, authenticate household members, or connect the new grid schema to chores. The existing Cloudflare/D1 household app is a separate deployment, retains its original layout schema, and exposes Studio at `/builder` with a link from its existing home view. No household data is included in the static preview.

## Run locally

Requirements: Node.js 22.13+ and npm.

```sh
cd web
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_household.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_google_oauth.sql
npm run dev
```

Use the actual generated migration filename in `web/drizzle/` if it differs. Open the loopback URL printed by the server. Local database state lives in ignored `web/.wrangler/state/`; dev and built previews share it. Never copy local credentials or runtime data into source control.

The first visitor creates the household and first parent account. **Save the parent recovery code immediately.** Email addresses are login identifiers; this version does not send email. Recovery uses one-time parent recovery codes, and parents reset children's credentials in Household. Adding another parent produces that parent's own recovery code.

## Everyday use

- **Today:** daily progress, overdue responsibilities, meals, and manual home/away status.
- **Chores & tasks:** one-off, daily, and weekly schedules; ordered rotations; reassignment; help requests; optional child completion approval; history.
- **Kitchen:** seven-day meal plan, real recipe/video links, suggestions from saved recipes and preference tags, and shared groceries. Ingredient quantities are entered and reviewed manually. No recipe generation or scraping.
- **Household:** create members, reset passwords and child PINs, set approval requirements, edit preferences, pair shared screens, and view activity.
- **Little rewards:** optional point balances, parent-defined rewards, reservations on request, approval, and refunds when declined.

For a home display, a parent pairs that browser in Household, then signs out. The overview stays available for 30 days. Children switch to their profiles using a 4–8 digit PIN from Household. Parent controls require a parent email/password login. Disconnecting the screen removes local pairing; parents can revoke all paired screens. PIN access is deliberately limited to paired devices.

## New local features: device inventory and 3D home

Parents can manage device records under **Household → Our devices**: name/model, type, operating system, browser, owner, compatibility status and notes. Compatibility is entered manually after testing; inventory entries do not grant access or pair browsers.

**Our home · 3D** starts with a clearly labelled sample layout. Parents use **Build & furnish** to add and position rectangular rooms, set dimensions and floor colors, and add/move/rotate furniture using numeric controls. Camera rotation, zoom, cutaway walls and a top view are available to all household viewers. Save explicitly to share the layout; unsaved drafts remain while switching tabs. Layouts are stored on the server and stale concurrent saves are rejected.

After saving a layout, parents can link existing routines to rooms from **Household view**, or choose a room when adding a new chore. The 3D dashboard shows due/pending chore counts, assigned members and the manual home/away roster. Complete/review chores in **Chores & tasks**. Removing a room clears its routine links and removes its furniture, while preserving chores and task history.

This starter supports one floor, up to 20 rooms, 100 furniture items and a 30 × 30 m site. Doors/windows, direct object dragging, multiple floors and member room locations are not implemented. These new features have not been deployed or browser-tested yet. See [the active roadmap](ROADMAP_NEXT.md).

## Validation

```sh
cd web
npm test
npm run typecheck
npm run build
```

Integration tests execute the generated SQL migrations in real SQLite and exercise the same Request/Response API used in production. They cover authentication, permissions, PIN pairing, recovery, recurrence, rotation, completion/review races, grocery synchronization, recipe links, and concurrent reward spending.

## Persistence and access

D1 tables are defined in `web/db/schema.ts`; generated SQL and Drizzle metadata are in `web/drizzle/`. Apply migrations before running the app. Hosted Sites deployments apply migrations through the Sites workflow; local and hosted databases are separate.

One household is stored as an atomic aggregate with a compare-and-swap revision. Every write revalidates the session and permissions against the latest revision and retries contention. This keeps point awards and reward reservations atomic across devices. It targets a small private household (up to 30 members), not a public multi-tenant service.

Passwords and PINs use salted PBKDF2-SHA256; sessions and recovery codes are stored as digests. Session cookies are HttpOnly, SameSite=Strict, and Secure on HTTPS. Writes enforce same-origin JSON. Login/recovery/PIN attempts have per-identity and per-IP rate limits. Sessions expire after seven days. Recovery invalidates the parent's sessions and paired devices. Children cannot access credential fields through the API.

The Sites preview retains the platform's owner-private access boundary, with household login inside it. Family-wide remote access requires an appropriate hosting/access configuration and HTTPS. Do not make a private household database publicly readable. For self-hosting, retain the same API authorization checks and provide a D1-compatible database binding.

## Roadmap status

Website workflows for phases 1–4 are implemented. A real family trial is still needed to validate routines and usability. In-app reminders show due/overdue work and pending approvals. External email, device notifications, mobile packaging, offline editing, and location tracking remain deferred.

See [ROADMAP_NEXT.md](ROADMAP_NEXT.md) for the active expansion milestones and [ROADMAP.md](ROADMAP.md) for the original website acceptance criteria.
