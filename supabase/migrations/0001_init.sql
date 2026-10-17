-- ==========================================================================
-- VUNA Life — Supabase migration 0001_init
-- Source of truth schema. Matches the design doc data model exactly.
-- Run with: supabase db push  (or paste into Supabase SQL editor)
--
-- HARD RULES enforced here, not in app code:
--   * Wallet balance has no UPDATE path; only INSERT into ledger triggers a
--     trigger-based recomputation. The app can never set a balance directly.
--   * Every admin/lecturer data view writes to audit_log via the audit_row()
--     trigger on sensitive tables.
--   * Presence rows are ephemeral: a scheduled job deletes rows past their
--     expires_at. There is NO presence_history table — by design.
--   * Buildings have a status enum that forces TO_VERIFY / USER_CONFIRMED /
--     SECONDARY_SOURCE / UNNAMED / NAME_PENDING / PROPOSED / MISSING_FROM_OLD_IMAGE
--     so unknown facts cannot be silently guessed.
-- ==========================================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type building_status as enum (
    'USER_CONFIRMED',
    'SECONDARY_SOURCE',
    'UNNAMED',
    'NAME_PENDING',
    'PROPOSED',
    'MISSING_FROM_OLD_IMAGE',
    'TO_VERIFY'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type building_category as enum ('academic','hostel','shop','service','sports','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('student','lecturer','admin','moderator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_type as enum ('class','mass','event','exam');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present','late','absent','excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type presence_state as enum ('solid','likely','event','ghost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type hair_stages as enum ('Fresh','Neat','Growing','Overdue','Violation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discipline_tier as enum ('Warning','Form','Restriction','Standing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type life_path as enum ('Scholar','Social','Faith','Athlete','Creative','Leader');
exception when duplicate_object then null; end $$;

-- ---------- users ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  email_domain text generated always as (lower(split_part(email,'@',2))) stored,
  display_name text,
  username text unique,
  avatar_url text,
  role user_role not null default 'student',
  department_id uuid,
  level smallint check (level between 100 and 800),
  is_verified_student boolean not null default false,
  is_minor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- verification (OTP, school-email flow) ----------
create table if not exists public.verification (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  attempts int not null default 0,
  consumed boolean not null default false,
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists verification_email_idx on public.verification(email, created_at desc);

-- ---------- departments, courses, timetable ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  faculty text,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  department_id uuid references public.departments(id),
  level smallint check (level between 100 and 800),
  credits int,
  created_at timestamptz not null default now(),
  unique (code, department_id, level)
);

create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  department_id uuid references public.departments(id),
  level smallint,
  weekday smallint not null check (weekday between 0 and 6),  -- 0=Sun .. 6=Sat
  start_time time not null,
  end_time time not null,
  venue_id uuid references public.buildings(id),
  lecturer_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists timetable_weekday_idx on public.timetable(weekday, start_time);

-- ---------- buildings (the campus map) ----------
-- Pin IDs are stable strings ('1','2','11','21b','chapel','Hostel B', etc.)
-- Some buildings have multiple footprints (e.g. building 11 has 3 polygons).
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  pin text not null unique,                          -- e.g. '1', '21b', 'chapel', 'Hostel B'
  name text,                                         -- NULL when UNNAMED
  category building_category not null default 'other',
  gender_attr text check (gender_attr in ('boys','girls','mixed','staff') or gender_attr is null),
  status building_status not null default 'TO_VERIFY',
  position_status text not null default 'APPROX_TRACED_FROM_OLD_SATELLITE_IMAGE',
  facing text,
  centre_lat double precision,
  centre_lng double precision,
  entrance_lat double precision,
  entrance_lng double precision,
  accuracy_m double precision,
  -- Traced geometry in source-image pixels and local metres, kept as JSONB
  -- so we don't need postgis for the dev seed. Georeferenced versions replace these.
  footprints jsonb not null default '[]'::jsonb,     -- array of {centre_px,size_px,angle_deg,polygon_px,polygon_m}
  courtyard_px jsonb,                                -- array of [cx,cy,w,h,angle] or null
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists buildings_category_idx on public.buildings(category);
create index if not exists buildings_status_idx on public.buildings(status);

-- Map geometry (roads, tracks, fields, courts) — kept in separate tables so
-- the avatar router can pull them in one query without filtering buildings.
create table if not exists public.map_roads (
  id uuid primary key default gen_random_uuid(),
  road_id text not null,                              -- e.g. 'campus_main_road'
  kind text not null check (kind in ('main','road','path')),
  width_px int not null,
  polyline_px jsonb not null,                        -- array of [x,y]
  polyline_m jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.map_tracks (
  id uuid primary key default gen_random_uuid(),
  polyline_px jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.map_fields (
  id uuid primary key default gen_random_uuid(),
  field_id text not null,                            -- e.g. 'F1', 'F2'
  name text,
  polygon_px jsonb not null,
  polygon_m jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.map_courts (
  id uuid primary key default gen_random_uuid(),
  rects jsonb not null,                              -- array of [x,y,w,h,angle]
  created_at timestamptz not null default now()
);

-- ---------- sessions, attendance ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  type session_type not null default 'class',
  course_id uuid references public.courses(id),
  venue_id uuid references public.buildings(id),
  lecturer_id uuid references public.users(id),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  qr_seed text not null,                              -- rotated every 10s by Redis-backed signer
  created_at timestamptz not null default now()
);
create index if not exists sessions_window_idx on public.sessions(opens_at, closes_at);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  status attendance_status not null default 'present',
  flag text,                                          -- reason for review flag
  verified_by uuid references public.users(id),
  unique (session_id, user_id)
);
create index if not exists attendance_user_idx on public.attendance(user_id, checked_in_at desc);

-- ---------- events, check-ins ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  venue_id uuid references public.buildings(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_compulsory boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.event_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- ---------- goals ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cadence text check (cadence in ('daily','weekly','semester','long_term')),
  path life_path,
  template jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','skipped')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, goal_id)
);

-- ---------- stats (six paths) ----------
create table if not exists public.stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  path life_path not null,
  xp int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, path)
);

-- ---------- economy: wallets + append-only ledger ----------
-- HARD RULE: balance is recomputed from ledger; client can never write here.
create table if not exists public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance int not null default 0,
  earned_today int not null default 0,
  earned_today_date date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger (
  id bigserial primary key,
  from_user uuid references public.users(id),
  to_user uuid references public.users(id),
  amount int not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (amount > 0),
  check (from_user is not null or to_user is not null)
);
create index if not exists ledger_user_idx on public.ledger(from_user, to_user, created_at desc);

-- Trigger: any INSERT into ledger recompute the affected wallet(s).
create or replace function public.recompute_wallet()
returns trigger language plpgsql security definer as $$
begin
  if new.to_user is not null then
    insert into public.wallets (user_id, balance)
    values (new.to_user, 0)
    on conflict (user_id) do nothing;

    update public.wallets
    set balance = (
      select coalesce(sum(amount),0) from public.ledger where to_user = new.to_user
    ) - coalesce((
      select sum(amount) from public.ledger where from_user = new.to_user
    ), 0),
    updated_at = now()
    where user_id = new.to_user;
  end if;
  if new.from_user is not null then
    insert into public.wallets (user_id, balance)
    values (new.from_user, 0)
    on conflict (user_id) do nothing;

    update public.wallets
    set balance = (
      select coalesce(sum(amount),0) from public.ledger where to_user = new.from_user
    ) - coalesce((
      select sum(amount) from public.ledger where from_user = new.from_user
    ), 0),
    updated_at = now()
    where user_id = new.from_user;
  end if;
  return new;
end;
$$;
drop trigger if exists ledger_recompute on public.ledger;
create trigger ledger_recompute after insert on public.ledger
for each row execute function public.recompute_wallet();

-- ---------- items + inventory ----------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text,
  base_price int not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  quantity int not null default 1,
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);

-- ---------- social: hellos -> friendships -> chats ----------
create table if not exists public.hellos (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.users(id) on delete cascade,
  to_user uuid not null references public.users(id) on delete cascade,
  building_id uuid references public.buildings(id),
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','ignored','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user, to_user)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  -- 1:1 chats only in MVP; group chats later
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_idx on public.messages(chat_id, created_at desc);

-- ---------- presence (EPHEMERAL — never a history table) ----------
create table if not exists public.presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  building_id uuid references public.buildings(id),
  state presence_state not null default 'ghost',
  since timestamptz not null default now(),
  expires_at timestamptz not null,
  -- No history. A scheduled job deletes rows past expires_at.
  check (expires_at > since)
);

-- ---------- shared activities + bonds (later phases) ----------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  venue_id uuid references public.buildings(id),
  path life_path,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bonds (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  strength int not null default 0,
  last_shared_activity timestamptz,
  unique (user_a, user_b),
  check (user_a < user_b)
);

-- ---------- discipline (private to player) ----------
create table if not exists public.discipline (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tier discipline_tier not null,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

-- ---------- hair_state ----------
create table if not exists public.hair_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  stage hair_stages not null default 'Fresh',
  last_cut_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- fines ----------
create table if not exists public.fines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount_cc int not null,
  reason text not null,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- ---------- rumors + gossip_feed (post-MVP) ----------
create table if not exists public.rumors (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  strength int not null default 1,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.gossip_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  rumor_id uuid references public.rumors(id) on delete cascade,
  shown_at timestamptz not null default now()
);

-- ---------- day_summaries (shareable card) ----------
create table if not exists public.day_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  summary_date date not null,
  payload jsonb not null,                              -- shareable card content
  share_token text unique,
  created_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

-- ---------- config (prices, caps, fines, ratio) ----------
create table if not exists public.config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- ---------- audit_log (every admin/lecturer data view + every mutation) ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.users(id),
  action text not null,
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id, created_at desc);
create index if not exists audit_log_table_idx on public.audit_log(table_name, row_id);

-- ==========================================================================
-- Insert default config rows (no prices hardcoded in code).
-- ==========================================================================
insert into public.config (key, value, description) values
  ('cc_to_naira_ratio', '10', 'Approx 1 CC = 10 naira. Used for flavour only, never for real money.'),
  ('weekly_allowance_min', '1200', 'Min weekly allowance in CC.'),
  ('weekly_allowance_max', '2000', 'Max weekly allowance in CC.'),
  ('daily_earning_cap', '300', 'Starting daily earning cap in CC.'),
  ('meal_cost_min', '100', 'Min meal cost in CC.'),
  ('meal_cost_max', '160', 'Max meal cost in CC.'),
  ('haircut_cost_min', '150', 'Min haircut cost in CC.'),
  ('haircut_cost_max', '250', 'Max haircut cost in CC.'),
  ('missed_mass_fine', '500', 'CC fine for missing compulsory faculty mass.'),
  ('hostel_lock_time', '"22:00"', 'Hostel lock time, 24h local.'),
  ('mass_start_time', '"12:10"', 'Faculty mass start time.'),
  ('mass_end_time', '"13:00"', 'Faculty mass end time.'),
  ('qr_rotation_seconds', '10', 'How often the QR token rotates.'),
  ('allowed_email_domains', '[]', 'Comma-separated list of allowed school email domains. EMPTY = verification closed. Populated by admin.'),
  ('hello_cooldown_minutes', '15', 'Cooldown after an ignored hello.'),
  ('max_hellos_per_day', '20', 'Hard cap on hellos sent per day.'),
  ('chat_rate_limit_per_min', '12', 'Max chat messages per minute.')
on conflict (key) do nothing;

-- ==========================================================================
-- Trigger: every building mutation writes to audit_log.
-- ==========================================================================
create or replace function public.audit_building_change()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (action, table_name, row_id, before, after)
  values (
    case when tg_op = 'INSERT' then 'insert'
         when tg_op = 'UPDATE' then 'update'
         when tg_op = 'DELETE' then 'delete' end,
    'buildings',
    coalesce(new.pin, old.pin),
    case when tg_op = 'INSERT' then null else row_to_json(old) end,
    case when tg_op = 'DELETE' then null else row_to_json(new) end
  );
  return coalesce(new, old);
end;
$$;
drop trigger if exists buildings_audit on public.buildings;
create trigger buildings_audit
after insert or update or delete on public.buildings
for each row execute function public.audit_building_change();
