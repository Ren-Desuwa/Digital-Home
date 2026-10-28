# Digital Home — active product roadmap

This is the canonical roadmap for future work. New chats should read this file before planning or implementing project expansion. `ROADMAP.md` records the original single-household website phases.

## Product direction

Expand Digital Home from a private household-management website into a platform anyone can sign up for: independent households, household communication, and a customizable Sims-style home builder for trying room layouts, furniture and finishes.

The timeline is milestone-based. Dates, launch priorities and the first public-release scope have not been decided. The milestones below describe the intended expansion, not completed implementation or an instruction to start a rewrite.

## Current implementation status

- The original website includes parent/child accounts, shared-screen pairing and PIN switching, home/away status, chores and rotations, completion review/history, meals, saved recipe links, groceries, optional points/rewards, and responsive layouts.
- Website and backend were deployed to Cloudflare Workers with D1. Google OAuth integration was implemented and deployed; production credentials and the real Google consent/login round-trip must be rechecked before calling Google login verified.
- A new standalone Home Studio in `web/builder/` implements the grid prototype with Three.js: floor painting, tile-edge walls, doors/windows, furniture placement/moving/rotation/colors, collision checks, room naming, undo/redo, browser autosave, export/import, snapshots and a 2D fallback. It is packaged for Vercel independently of the household backend. Grid layouts do not yet synchronize with household storage or chores.
- Earlier local code includes device inventory, a single-floor room/furniture editor, an SVG-based interactive 3D projection, saved layouts, and room-linked chore dashboards. These additions have not been deployed or browser-tested. They are a starter, not the complete planned builder.
- The current application remains single-household and stores operational data as one household aggregate. Public registration, multi-household isolation, chat and the proposed stack migration are not implemented.
- The most recent recorded local checks passed 27 integration tests, TypeScript checking and the production build. Interactive/touch QA and a real family trial remain open. See `VERIFICATION.md` for evidence and limits.

## Recovered 3D builder direction — 28 October 2026

Source: the saved chat **Check 3D House Branches**, with a later recap in **Digital Home Repo**. These details extend the broad roadmap; they do not describe completed features.

Confirmed user preferences:

- Grid-based placement, inspired by Minecraft's block-based building.
- A rotatable house view.
- Thin walls along floor-tile edges.
- An interactive sample to try before expanding the implementation.

Proposed first prototype from that discussion: one floor, paintable floor tiles, drawable edge walls, doors, and a small furniture catalog with grid snapping and 90-degree rotation. Transparent placement previews, erase, undo/redo, zoom/pan, cutaway walls and top view were proposed controls. Keep building and camera gestures distinct, and preserve room naming and links to chores.

These prototype details remain proposals beyond the confirmed preferences above. A cozy dollhouse style and a starter home with an empty-plot option were suggested; the starting layout was not decided. Roofs, windows and multiple floors remain later expansion candidates.

The grid interaction is now implemented in the separate Home Studio prototype. Next builder work: review the prototype on actual devices, then design versioned household persistence and chore integration for grid layouts without losing existing rectangular-room layouts. Direct furniture dragging, connected household storage, and layout version history remain open.

Publication status is tracked in `VERIFICATION.md`. The standalone Studio is intended for Vercel, while the household app retains its Cloudflare/D1 deployment.

## Proposed architecture — not yet adopted

Candidate stack: Next.js + React + TypeScript; PostgreSQL/Supabase for database, managed authentication, realtime and storage; Three.js + React Three Fiber for the editor; Tailwind and reusable UI components. Hosting remains undecided pending requirements and budget. The existing Vinext/Cloudflare/D1 implementation has not been migrated.

The architecture must support household-scoped membership and authorization, separate operational records, persistent chat, project permissions, versioned scene data, and model/texture storage. Chat history must persist independently of realtime delivery. Keep the existing deployed app available while preparing and validating migration; existing sessions/passwords must not be assumed to transfer automatically.

## Expansion milestones

| Milestone | Features to add | Completion goal |
| --- | --- | --- |
| 1. Project foundation | Git repository, staging environment, automated checks, architecture decisions, small 3D prototype | Changes are versioned and the core builder interaction is proven. The local starter partially addresses the prototype; browser/device validation remains open. |
| 2. Public-platform accounts | Public registration, household creation, invitations, household switching, membership permissions | Independent households can use the platform without accessing each other's records. |
| 3. Household migration | Migrate chores, meals, groceries, rewards, accounts and existing records into the chosen architecture | Current workflows pass regression checks and household data is preserved through a tested transition. |
| 4. Household chat | Persistent messages, unread counts, typing indicators, attachments, notification preferences | Authorized household members can communicate reliably across devices, refreshes and reconnects. |
| 5. Basic home builder | Create rooms, enter dimensions, switch floor-plan/3D views, browse furniture, place/move/rotate/delete objects | Users can furnish, save and reopen a usable layout. Existing numeric controls and SVG projection are an initial local implementation only. |
| 6. Design tools | Grid snapping, undo/redo, autosave, layout versions, wall/floor finishes, furniture colors, screenshots | Users can explore designs without losing previous work. Explicit save exists locally; autosave and version history do not. |
| 7. Advanced home design | Multiple floors, doors, windows, stairs, roofs, exterior customization, expanded furniture catalog | Users can model more complete homes. |
| 8. Shared design planning | Project invitations, viewer/editor permissions, comments, layout comparisons, collaborative editing | Multiple members can contribute without overwriting one another's work. |
| 9. Mobile and public beta | Installable/mobile experience, push reminders, device performance tuning, onboarding, support and feedback | The platform is ready for broader household testing on the chosen devices. |

## Possible later additions

- Furniture wishlists, prices, product links and furnishing budgets.
- Chores and maintenance tasks attached to rooms or objects. Room-linked routines have a local starter implementation; object-linked maintenance remains future work.
- Before/after layouts and renovation planning.
- Shareable home tours and reusable design templates.
- Friends, cross-household chat or public communities, depending on the chosen audience.

## Decisions still open

- First public release: household hub first, home builder first, or both together.
- Initial builder freedom: dimensioned custom floor plans, customizable templates, or full multi-floor/exterior construction.
- Chat audience: household-only, invited friends/other households, or public communities and platform-wide direct messages.
- Budget and hosting, final stack, target devices, release dates and migration/cutover plan.

Recommendation from the planning discussion: settle the architecture and prove a small 3D editor early, then build the public-platform foundation. Do not treat proposed providers or future features as implemented.

## Immediate implementation backlog

The checklists below preserve the local starter work and remaining validation tasks.

## Easy

- [x] Add a parent-managed device inventory to Household: name/model, type, operating system, browser, member/shared owner, manual compatibility status, notes, edit and removal.
- [ ] Enter the family's actual devices in the app. No devices have been inferred or added on the family's behalf.
- [ ] Configure Google OAuth production credentials. Recheck production before assuming the October 19 configuration record is current.

## Mid

- [x] Start a single-floor room layout editor: add/remove rooms, dimensions, positions, colors and furniture.
- [x] Add an interactive 3D projection with rotation, zoom, cutaway walls and a top view.
- [x] Save layouts in household storage with parent-only edits, member/paired-screen viewing, validation and stale-edit protection.
- [x] Start the 3D household dashboard: link chore routines to rooms, show due/pending counts and assignments by room, display the household's manual home/away roster.
- [ ] Browser and touch QA for inventory and builder. Browser automation was unavailable during this implementation; tests and builds are not a substitute for this check.
- [ ] Deploy the inventory/builder changes after local review. This implementation has not been published.
- [ ] Verify real Google consent, login, explicit account linking and cancellation on desktop and phone.
- [ ] Complete the real family trial and fix observed issues.
- [ ] Complete an accessibility audit.
- [ ] Use the recorded devices to choose PWA versus mobile wrapper.

## Hard

- [ ] Add opt-in push subscriptions and reliable delivery, quiet hours and deep links on the actual family devices.
- [ ] Build and distribute a mobile wrapper, if selected instead of a PWA.

## Builder follow-up scope (not implemented)

The current builder is a starting version, not an architectural CAD tool.

- [ ] Direct dragging/snapping for room resizing and furniture placement; the first version uses numeric controls.
- [ ] Doors, windows, custom wall geometry and multiple floors.
- [ ] Richer furniture models and collision detection between furniture items. Current validation checks furniture remains inside its room.
- [ ] Member room locations and room-based presence. The current roster shows manually set home/away only.
- [ ] Complete/review chores directly inside the 3D dashboard. Current room task cards are read-only; existing Chores & tasks retains these actions.
- [ ] Choose priorities for these additions after the starter is reviewed.

## Deferred / outside the current implementation

Offline editing, automatic location tracking and external email reminders remain deferred.
AI recipe generation and recipe scraping remain outside the current scope.
