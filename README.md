# VUNA Life — Phase 1: foundation and real data

A web-first digital twin of one real school (Veritas University Abuja, Bwari).
Verified students sign in with a school-email one-time code, see their real
department and Monday timetable, and admins manage the 43-building campus map
plus department/course/timetable CSV imports — every mutation audited.

This repo contains Phase 1 of the build plan in the World Design Document.

## Stack (per the design doc; do not change without owner sign-off)

- **Next.js 16 + TypeScript + Tailwind + shadcn/ui**
- **Supabase** (PostgreSQL, Auth, Realtime) — production target. SQL migrations
  at `supabase/migrations/0001_init.sql` are the source of truth.
- **Upstash Redis** — rate limits, QR rotation, caps. Not used in Phase 1; it
  comes online in Phase 3 (attendance QR rotation).
- **MapLibre GL** with self-hosted campus tiles — the SVG map background is
  rendered as the base layer in Phase 5 (campus + people). Phase 1 doesn't touch
  the map UI yet.
- **No Prisma in production.** The design doc says so. Prisma/SQLite is used
  only as a **DEMO_MODE local dev adapter** so the app runs without live Supabase
  credentials. The moment you set the Supabase env vars, the db adapter stops
  using Prisma and routes through `@supabase/supabase-js`.

## DEMO_MODE

When `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are not set, the app runs in DEMO_MODE:

- Data is read from a local SQLite DB at `db/vuna-life.db`, seeded from
  `upload/veritas_campus_map.json`.
- OTPs are not emailed — they are shown on-screen. The demo OTP is `123456`.
- The email domain whitelist check is bypassed at the `/api/auth/request-otp`
  layer only, so you can sign in with any email. **The pure check function
  still rejects every email when the whitelist is empty** — see
  `tests/email-domain-check.test.ts`. The bypass lives only in the API route
  and disappears the moment `IS_DEMO_MODE` is false (i.e. real Supabase env
  vars are set).
- A yellow DEMO MODE banner is shown at the top of every page.

A demo student `student.demo@vuna-life.local` (CSC, 200 level, role: admin)
and a demo Monday timetable (two CSC201 classes in Block A, pin 2) are seeded
when you run the seed script with `DEMO_SEED_SAMPLE_DATA=1`.

## Setup

1. **Install deps** (already done in the sandbox; do it again on a fresh clone):

   ```bash
   bun install
   ```

2. **Copy env example and fill in** (you can leave the Supabase fields blank
   for DEMO_MODE):

   ```bash
   cp .env.local.example .env.local
   ```

   Populate `ALLOWED_EMAIL_DOMAINS` with real school domains when you have
   them. The format is a JSON array: `["veritas.edu.ng","students.veritas.edu.ng"]`.
   Empty list = verification closed.

3. **Push the Prisma schema and seed the campus map**:

   ```bash
   bun run db:push              # creates the local SQLite schema
   DEMO_SEED_SAMPLE_DATA=1 bun run scripts/seed-campus.ts
   ```

   The seed imports all 43 buildings, 8 roads, 5 tracks, 2 fields, 1 court
   group, 17 config rows, and (if `DEMO_SEED_SAMPLE_DATA=1`) a demo student
   + admin + Monday timetable.

4. **Run the dev server**:

   ```bash
   bun run dev   # http://localhost:3000
   ```

5. **Run the test suite** (Phase 1 ships tests for the email domain whitelist
   — the most security-critical pure function):

   ```bash
   bun test tests/email-domain-check.test.ts
   ```

## Production deploy

When you have live Supabase credentials:

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (or your Vercel project env).
2. Run the SQL migration against your Supabase project:

   ```bash
   supabase db push
   # or paste supabase/migrations/0001_init.sql into the Supabase SQL editor
   ```

3. Populate `allowed_email_domains` in the `config` table (or via the admin
   UI's Config tab once you've signed in as admin) with the real school
   domains. Until then, verification is closed by design.
4. The app will now route through `@supabase/supabase-js` and DEMO_MODE will
   turn off automatically.

## File map

```
supabase/migrations/0001_init.sql   # production SQL schema (source of truth)
prisma/schema.prisma                  # local dev adapter mirroring the above
scripts/seed-campus.ts                # ingests veritas_campus_map.json into the DB

src/lib/
  supabase.ts                         # server/browser Supabase client wrappers
  db.ts                                # Prisma client (DEMO_MODE only)
  auth/
    email-domain-check.ts              # whitelist check (pure, tested)
    otp.ts                              # OTP generation + signed JWT session
    session.ts                          # cookie helpers
  db/
    buildings.ts                        # building CRUD + audit_log writes
    academic.ts                         # departments, courses, timetable upserts
    audit-log.ts                        # single audit-log entry point
  csv/parse.ts                          # CSV parsers (departments/courses/timetable)

src/app/
  page.tsx                              # single visible route — auth-aware UI
  layout.tsx
  middleware.ts                         # session cookie refresh
  api/
    health/route.ts                     # DEMO_MODE banner check
    auth/{request-otp,verify-otp,signout}/route.ts
    buildings/route.ts                  # any authenticated user can list
    admin/
      buildings/route.ts                # admin CRUD with audit_log
      audit-log/route.ts
      config/route.ts
      import/{departments,courses,timetable}/route.ts
    student/me/route.ts                  # Phase 1 exit-test endpoint

src/components/
  auth/   sign-in-form, otp-confirm-form
  student/ student-dashboard (Monday timetable)
  admin/   buildings-panel, import-panel, config-panel, audit-panel, admin-shell

tests/email-domain-check.test.ts        # 26 tests, all pass
```

## Phase 1 exit test (per the design doc)

> Done when: a real student can verify, see their department, level and
> Monday timetable.

In DEMO_MODE this is demonstrable end-to-end:

1. Sign in with `student.demo@vuna-life.local` (any email passes in DEMO_MODE).
2. OTP `123456` is shown on-screen; enter it.
3. The student dashboard renders: `Demo Student`, `Computer Science (demo)`,
   `200 level`, Verified: Yes.
4. Monday timetable shows the two seeded CSC201 classes (08:00–10:00 and
   14:00–16:00) in Block A (pin 2).

In production, the same flow works once:
- The student's email domain is on the `allowed_email_domains` list (set by
  admin in the Config tab).
- The student's row in `users` has a real `department_id` and `level` (set when
  the admin imports the school record, which waits until the school is
  approached).
- The Monday timetable is populated via the CSV import flow at the Import tab.

## HARD RULES enforced in code (per the Builder Pack + design doc)

1. **Never invent campus facts.** The `buildings` table enforces a `status`
   enum: `USER_CONFIRMED`, `SECONDARY_SOURCE`, `UNNAMED`, `NAME_PENDING`,
   `PROPOSED`, `MISSING_FROM_OLD_IMAGE`, `TO_VERIFY`. New admin-added buildings
   default to `TO_VERIFY`. The `createBuilding` helper refuses to set
   `MISSING_FROM_OLD_IMAGE` directly (it's a derived status).
2. **Academic wall.** No game-table write mutates `users`, `departments`,
   `courses`, or `timetable`. The auth flow only flips
   `is_verified_student` on the user row.
3. **Privacy by default.** Other students would see only avatar + username +
   department (not implemented until Phase 5, but the schema is ready:
   `hellos`, `friendships`, `chats`, `messages` all separate `from`/`to`
   users, and `presence` is ephemeral with an `expires_at`).
4. **Server-side money only.** `wallets.balance` is recomputed from a
   trigger on the append-only `ledger` table. The app can never set a balance
   directly. (This is wired in the SQL migration; the Prisma schema mirrors
   it but SQLite has no triggers — the wallet adapter in Phase 4 will
   recompute on each read to compensate.)
5. **No dating, no relationship labels.** Only `friendships` (a/b unique),
   `hellos`, `chats`, `messages`, `bonds` (strength from shared activity).
6. **AI characters labelled.** No AI characters exist in Phase 1; the schema
   has `is_ai` slots where they will be added in Phase 5+.
7. **Radar/BLE OFF in web.** The `presence` table exists but is not read by
   any client yet. Phase 5 will use it for "who is here" per building, not
   radar. Radar ships with the Flutter app in Phase 2.
8. **No phone numbers, documents, or IDs in game forms.** The verification
   table stores only email + OTP hash + IP + user-agent. No phone, no ID.
9. **Under-18 chat restrictions** will live in `users.is_minor`; the schema
   has the column, enforcement comes in Phase 5 (chat).
10. **Consequences proportionate and temporary.** `discipline` has an
    `expires_at`; `fines` have a `paid` boolean; `hair_state` resets on cut.
    None of these can permanently affect the user's academic record.

## What's NOT in Phase 1

Per the design doc 12-week roadmap, Phase 1 covers **foundation and real
data only**. Everything else is deferred:

- Home screen, daily return hook, goals engine → Phase 2
- Rotating-QR attendance, mass, fines → Phase 3
- Wallets, ledger, canteen, day card → Phase 4
- Map, tap-to-walk, presence, hello-to-chat → Phase 5
- Gate scene, evening hustle, closed beta → Phase 6

Discipline scenes, campus radio, snitching, bonds, exam-season mode,
inter-faculty launch, Flutter app, venue beacons — all post-MVP.

## Open items the builder must not guess

These come from the user (section 7 of the Builder Pack and the design
doc's "Open items"). Treat all as TO_VERIFY until provided:

- Names of shops `30a`–`33` and `38`
- Identities of unnamed buildings `11`, `12`, `21`, `21b`, `22`, `24`–`29`
- The missing new buildings (Software Engineering / computing building,
  new cafeteria, ~1–2 others)
- Real GPS points for georeferencing the map
- Department-to-block mapping
- Faculty mass days (only NAS Monday is given)
- Dress code
- Banned items at the gate
- The real school rulebook
- What happens to a student outside after the 22:00 hostel lock
- The allowed school email domains

Each of these is stored in the DB with status `TO_VERIFY`, `UNNAMED`, or
`NAME_PENDING` as appropriate, and surfaced in the admin UI with a clear
badge so the owner can fill them in as the facts arrive.

## Build-order reminder (from the design doc)

> The real-university features (login, timetable, class alerts,
> announcements, attendance) come first because they give students a daily
> reason to return. The social layer, radar and virtual campus follow once
> there are real users to fill them.

Phase 1 delivers exactly that foundation. Phase 2 onwards layers the game
on top.
