# VUNA Life: Builder Pack

For the co-builder and any AI coding tool. Put this file, `veritas_campus_map.json`, `veritas_game_map.svg` and the VUNA Life design doc in the repo root. Paste Prompt 0 first in every new session, then one phase prompt at a time.

---

## 0. Master prompt (paste first, every session)

```
You are building VUNA Life, a web-first digital campus platform for Veritas University Abuja (Bwari, Nigeria).
It is a verified "digital twin" of one real school: a real-university layer (timetable, attendance, announcements)
plus a game layer (avatars, a 2D campus map, Campus Credits economy, goals, social presence).
Inspiration: the game Lagos Life. Players return because the game knows their real life at the school.

HARD RULES (never break):
1. Never invent campus facts. Unknown things are stored as status TO_VERIFY. Never rename or add a building without the owner's confirmation.
2. Academic wall: game data never changes real grades, attendance records or discipline records.
3. Privacy by default: other students see only avatar, username and department until a hello is accepted. Presence is building-level, never exact coordinates, with no history table.
4. All money logic is server-side. The client can never set a balance. Ledger is append-only. Prices, caps and fines live in a config table.
5. No dating system. No relationship labels. Bonds come only from shared activity.
6. Every AI character is visibly labelled as AI.
7. Radar and Bluetooth are OFF in the web version (designed, switched off).
8. Never ask for or store real phone numbers, documents or IDs in game forms.
9. Under-18 accounts: chat only with accepted friends.
10. Consequences are proportionate and temporary. One mistake must never ruin a semester.

STACK: Next.js (TypeScript), Supabase (PostgreSQL, Auth, Realtime), Upstash Redis (rate limits, QR rotation, caps),
MapLibre or plain SVG for the map, Vercel hosting. Flutter app later (phase 2). Python/FastAPI later for anomaly detection only.

Read the design doc and veritas_campus_map.json before writing code. Ask before assuming anything about campus facts.
Work in small steps, write tests for money and attendance logic, and explain each change briefly.
```

---

## 1. The map (what is given, how to use it)

Files:
- `veritas_game_map.svg`: the finished 2D game map (roads, fields, courts, building footprints, labels). Use it as the visual background layer.
- `veritas_campus_map.json`: the same geometry as data. Roads, tracks, fields, courts and buildings, each in source-image pixels (`polygon_px`) and in local metres (`polygon_m`). Scale: 0.763 m per pixel (200 m = 262 px).

Known limits (tell the builder, do not hide them):
- Traced from a satellite image about 5 years old. 3 to 4 newer buildings are missing: the Software Engineering / computing building, a new cafeteria (built about 2 months ago), and 1 or 2 others.
- Positions are about 15 to 25 m accurate. North is assumed up. There is no GPS georeference yet.
- 30a, 30b, 30c, 31, 32, 33, 38 are shops and cafes whose names are pending. 11, 12, 21, 22, 24 to 29 are unnamed.
- Hostel B's position is proposed, not confirmed. The main gate position is inferred from the owner's description.
- Status values: USER_CONFIRMED, SECONDARY_SOURCE, UNNAMED, NAME_PENDING, PROPOSED, MISSING_FROM_OLD_IMAGE.

Map rules for the game:
1. Render the SVG as the base. Draw tappable hit areas from each building's `polygon_px`.
2. Tapping a building opens its activity list (study, eat, check in) from the `buildings` table. Buildings with no name show "Unnamed building" and no activities.
3. The avatar walks along road and track polylines (tap-to-walk). Do not let it cross water or forest blobs.
4. Hostels carry `gender_attr` as an attribute only. Rules use it (boys cannot enter girls' hostels). Never put gender in a name.
5. Georeferencing (later): two real GPS points convert pixels to latitude and longitude. Store `centre_lat`, `centre_lng`, `entrance_lat`, `entrance_lng`, `accuracy_m` per building. Replace the traced footprints with walked ones as they arrive.
6. Admin screen: add, move or rename a building, always logging who changed it (audit_log).

Named buildings (all USER_CONFIRMED): 1 Law Faculty; 2, 3, 4 Blocks A, B, C; 5 Block D; 6 Multipurpose Hall; 7 Auditorium; 8 Library; 9 Clinic; 10 Faculty of Medicine / Pharmacy building; 13 Senate Building; 14 Paetos (girls); 15 CICL (girls); 16 Stanzel (girls); 17 Old Kelson (girls); 18 New Kelson (girls); 19 Hostel R (boys); 20 Hostel S (boys); 23 Hostel A (girls); Hostel B (girls, next to A); 34 New Lecture Theatre; 35 Bookshop; 36 Down Cafe; 37 Postgraduate and ICT building; Chaplaincy (from the map label); fields F1 (big new) and F2 (small old); courts (basketball, volleyball, badminton).

---

## 2. Core data model (Supabase tables)

users, verification, departments, courses, timetable, buildings, sessions, attendance, events, event_checkins, goals, user_goals, stats, wallets, ledger, items, inventory, hellos, friendships, chats, messages, presence, activities, bonds, discipline, hair_state, fines, rumors, gossip_feed, day_summaries, config, audit_log.

Key columns:
- buildings: id, pin, name, category, gender_attr, status, footprint polygon, centre, entrance, centre_lat, centre_lng, accuracy_m
- wallets: user_id, balance (server only). ledger: id, from_user, to_user, amount, reason, meta, created_at (append-only)
- presence: user_id, building_id, state (solid, likely, event, ghost), since, expires_at. Ephemeral, auto-deleted, never a history table.
- sessions: id, type (class, mass, event, exam), venue_id, opens_at, closes_at, qr_seed
- attendance: id, session_id, user_id, checked_in_at, status (present, late, absent), flag, verified_by
- config: key, value (prices, caps, fines, ratio 1 CC = about 10 naira)

Rules: wallet and ledger maths only in server transactions; every admin or lecturer data view writes to audit_log; no price or cap hardcoded.

---

## 3. Game rules the code must implement (starting values, all in config)

- Time is server time. Never trust the client clock.
- Hostel lock 22:00. Mass 12:10 to about 13:00 Monday to Friday, one faculty per day, compulsory. Missed mass: 500 CC fine and a warning meter.
- Hair stages: Fresh, Neat, Growing, Overdue, Violation, grows on real days.
- Discipline ladder (private to the player): Warning, Form, Restriction, Standing.
- Currency about 1 CC = 10 naira. Weekly allowance 1,200 to 2,000 CC (varies per player). Meals 100 to 160 CC. Haircut 150 to 250 CC. Daily earning cap starts about 300 CC.
- Six paths: Scholar, Social, Faith, Athlete, Creative, Leader. They rise only from verified participation. No public grade rankings.
- Presence states: Solid, Likely here (grey, not tappable), In event, Ghost.
- Hello flow: one hello per person, cooldown if ignored, chat opens after acceptance with username and avatar only.
- Attendance (web): rotating QR (10 second signed tokens), short window, one device per account, flag review. Label this as weaker than the later Bluetooth version.
- Gate sequence: one scripted scene. Officer personalities Strict, Sleepy, Chatty, By-the-book. Bag search outcomes depend on response and personality.
- Evening hustle: vendor gives stock on consignment, selling 18:00 to 22:00, price slider, carry limit.

Choice density: a meaningful choice every 60 to 90 seconds of active play, and if two minutes pass without one, inject one.

---

## 4. Phase prompts (paste one at a time, after Prompt 0)

### Phase 1 (weeks 1 to 2): foundation and real data
```
Set up the repo (Next.js TypeScript, Supabase). Implement auth with a school-email one-time code.
Import veritas_campus_map.json into the buildings table, keeping status values and footprints.
Build an admin screen to add, move or rename buildings and to mark TO_VERIFY items, logging every change to audit_log.
Create tables for departments, courses and timetable with CSV import.
Done when: a real student can verify, see their department, level and Monday timetable.
```

### Phase 2 (weeks 3 to 4): daily return hook
```
Build the Home screen: next obligation, three goal cards, wallet and earning-cap progress, hair and discipline status, an announcements strip.
Build the timetable view and class alerts. Build a goals engine that assigns daily templates from config.
Done when: a student opening it each morning sees their real schedule.
```

### Phase 3 (weeks 5 to 6): attendance and mass
```
Implement sessions with rotating signed QR tokens (10 second rotation via Redis), one device per account, short windows and flag review.
Auto-create a daily 12:10 mass session. Add check-in, the 500 CC missed-mass fine from config, and a warning meter.
Build the lecturer screen to open a session and review flags. Write tests for token expiry, replay and duplicate scans.
Done when: one real class runs it for a week alongside normal attendance.
```

### Phase 4 (weeks 7 to 8): economy and day card
```
Implement wallets and an append-only ledger with server-side transactions only. Add config-driven prices (food table), weekly allowance and daily earning caps.
Build the canteen purchase flow, the hair state machine, and the shareable Day Summary card.
Add anomaly detection: freeze an account that exceeds the earning cap or shows impossible gains. Test that a client can never set a balance.
Done when: students share their day card without being asked.
```

### Phase 5 (weeks 9 to 10): the campus and people
```
Render veritas_game_map.svg as the map. Add tappable building polygons, tap-to-walk along road and track polylines, and a building activity list.
Implement presence (check-in or activity based, Supabase Realtime, ephemeral rows), "who is here" per building, and the hello to friendship to chat flow with cooldowns, block, two-tap report and no real names or hostel details.
Add shared activities: library tables, mass seats, canteen.
Done when: two strangers meet at a library table and message each other.
```

### Phase 6 (weeks 11 to 12): gate, hustle, closed beta
```
Build the gate arrival scene with four officer personalities and the bag search branch table.
Build evening hustle v1: vendor consignment, price slider, 18:00 to 22:00 window, hostel-front selling, unsold stock risk.
Prepare a closed beta for one faculty of 50 to 100 students with drop-off instrumentation.
Done when: beta students open it 5 or more days a week.
```

### After the MVP (in order)
Discipline scenes, campus radio (clearly labelled AI host), snitching with the inference system (only on game-verified events, with a moderation and appeal path), bonds and shared history, exam-season mode, inter-faculty launch, Flutter app with BLE radar, venue beacons.

---

## 5. Out of scope for the MVP
Dating of any kind, radar, snitching, campus radio, breakup mechanics, 3D, marketplace, payments.

## 6. Success targets at the end of beta
DAU/MAU 40% or more; 3 or more sessions a day among active users; 20% or more of active users sharing a day card each week; 60% or more of the beta cohort checking in to mass through the app; 1 or more friendships per active user per week; 4-week retention 50% or more; female to male active ratio 35:65 or better.

## 7. Open items the builder must not guess
Names of shops 30a to 33 and 38; unnamed buildings 11, 12, 21, 22, 24 to 29; the missing new buildings; real GPS points; department-to-block mapping; faculty mass days; dress code; banned items at the gate; the real school rulebook; what happens to a student outside after the 10pm lock.
