# Digital Home roadmap

## Phase 1 — Foundation and accounts

Implemented: responsive private household website, parent/child roles, email/password and parent-created child username/password login, parent recovery codes, child credential resets, paired shared screens and child PIN switching. Server-side authorization gates parent actions.

Acceptance: first-run setup is single-claim; children cannot gain parent permissions; unpaired browsers cannot use PINs; recovery invalidates existing access.

## Phase 2 — Household workflow

Implemented: Today dashboard; manual home/away; daily, weekly and one-off schedules; ordered fixed/rotating assignments; individual occurrences; due times; overdue indicators; reassignments; help requests; parent approval/rejection; completion and activity history; archiving future open tasks.

Acceptance: a week of responsibilities can be managed without duplicate occurrences or duplicate point awards. Away status does not alter the assignment order. Future tasks cannot be completed early.

## Phase 3 — Food and groceries

Implemented: weekly calendar with breakfast/lunch/dinner slots, saved source links including YouTube, verified starter links, manually entered preparation estimates/servings/tags/ingredients, collection-based recommendations using preference tags and recent meal history, ingredient review, shared groceries and purchase checkboxes.

Acceptance: links open original sources, only one meal occupies a date/slot, recommendations contain saved real recipes, ingredient quantities can be adjusted before adding, changes reach other devices.

## Phase 4 — Rewards and website completion

Implemented: optional points; single awards after final completion; rewards; point reservation on request; parent approval or rejection with single refunds; shared-screen controls; in-app reminders; responsive layout; keyboard-accessible forms/dialogs; household activity.

Acceptance: concurrency and permission integration tests pass; production build passes; browser flows work; family trial completed. **The family trial remains open.** No external reminder delivery is claimed.

## Phase 5 — Mobile and push (deferred)

After the website is complete and trialed, inventory actual family phones, choose a PWA or mobile wrapper, and test installation and push permissions on those devices. Implement quiet hours, opt-in reminder delivery and deep links at that point. PC remains a website.

## Defaults

One invite-only household; Asia/Manila; English UI with Filipino chore and meal names; online access; manual presence; parent-managed scheduling and meal plans; grocery contributions from all signed-in members. No public registration, automatic location tracking, AI recipes, scraping, or offline editing.
