-- ==========================================================================
-- VUNA Life — Supabase migration 0004_phase6
-- Gate arrivals, hustle attempts, feedback, beta flag
-- ==========================================================================

-- ---------- gate_arrivals ----------
-- One row per (userId, date). Deterministic: the gate outcome is
-- computed server-side BEFORE the scene renders — the client cannot
-- skip consequences.
create table if not exists public.gate_arrivals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  arrival_date date not null,
  officer_personality text not null check (officer_personality in ('strict', 'relaxed', 'suspicious', 'friendly')),
  search_outcome text not null check (search_outcome in ('searched', 'cleared', 'contraband_found')),
  dress_code_result text not null check (dress_code_result in ('ok', 'violation')),
  discipline_applied text,
  declared_items jsonb not null default '[]'::jsonb,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, arrival_date)
);
create index if not exists gate_arrivals_user_date_idx on public.gate_arrivals(user_id, arrival_date);

-- ---------- hustle_attempts ----------
create table if not exists public.hustle_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_code text not null,
  item_name text not null,
  purchase_cost int not null,
  sale_price int not null,
  sold boolean not null default false,
  revenue int not null default 0,
  attempt_date date not null default current_date,
  created_at timestamptz not null default now(),
  check (purchase_cost > 0),
  check (sale_price > 0)
);
create index if not exists hustle_attempts_user_date_idx on public.hustle_attempts(user_id, attempt_date);

-- ---------- feedback ----------
-- The ONLY place free text is allowed (max 140 chars, rate-limited
-- 1 per student per 24h). Stored for admin review.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('bug', 'feature_request', 'suggestion', 'complaint', 'praise')),
  body text check (char_length(body) <= 140),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback(user_id, created_at desc);

-- Add isBeta flag to users
alter table public.users add column if not exists is_beta boolean not null default false;
comment on column public.users.is_beta is 'Beta cohort flag. Beta students get a gold Beta badge on their profile.';

-- Config: officer dialogue lines (not hardcoded — live in config)
insert into public.config (key, value, description) values
  ('gate_search_chance_strict', '0.8', 'Probability of a bag search when the officer is strict.'),
  ('gate_search_chance_relaxed', '0.2', 'Probability of a bag search when the officer is relaxed.'),
  ('gate_search_chance_suspicious', '0.9', 'Probability of a bag search when the officer is suspicious.'),
  ('gate_search_chance_friendly', '0.1', 'Probability of a bag search when the officer is friendly.'),
  ('gate_skip_delay_seconds', '3', 'Seconds before the skip button appears.'),
  ('hustle_window_start', '"18:00"', 'Evening hustle window start (server time).'),
  ('hustle_window_end', '"22:00"', 'Evening hustle window end (server time).'),
  ('hustle_max_attempts_per_evening', '3', 'Max hustle attempts per evening window.'),
  ('hustle_price_variance_pct', '20', 'Allowed variance ±N% from the suggested price.'),
  ('feedback_rate_limit_hours', '24', 'Hours between feedback submissions per user.'),
  ('feedback_max_chars', '140', 'Max characters in feedback body.')
on conflict (key) do nothing;

-- Officer dialogue lines (AI-labelledld — stored as config so they can
-- be updated without code changes). Each key is
-- gate_dialogue_{personality}_{outcome}_{line_number}.
insert into public.config (key, value, description) values
  ('gate_dialogue_strict_searched_1', '"Stand there. Open the bag. Now."', 'AI-generated dialogue — strict officer, bag searched.'),
  ('gate_dialogue_strict_cleared_1', '"You\'re clear. Move along — and fix that hair."', 'AI-generated dialogue — strict officer, cleared.'),
  ('gate_dialogue_strict_contraband_1', '"What\'s this? You know this is not allowed. Form, now."', 'AI-generated dialogue — strict officer, contraband found.'),
  ('gate_dialogue_relaxed_searched_1', '"Hey, just a quick check — you know how it is. Open up."', 'AI-generated dialogue — relaxed officer, bag searched.'),
  ('gate_dialogue_relaxed_cleared_1', '"You\'re good. Have a good day, eh."', 'AI-generated dialogue — relaxed officer, cleared.'),
  ('gate_dialogue_relaxed_contraband_1', '"Ah, you know I can\'t let this through. I\'ll have to write you up."', 'AI-generated dialogue — relaxed officer, contraband found.'),
  ('gate_dialogue_suspicious_searched_1', '"Hold on. I\'ve seen you before. Open the bag — slowly."', 'AI-generated dialogue — suspicious officer, bag searched.'),
  ('gate_dialogue_suspicious_cleared_1', '"You\'re clear this time. But I\'ll be watching."', 'AI-generated dialogue — suspicious officer, cleared.'),
  ('gate_dialogue_suspicious_contraband_1', '"I knew it. You thought I wouldn\'t notice? Form, and a warning."', 'AI-generated dialogue — suspicious officer, contraband found.'),
  ('gate_dialogue_friendly_searched_1', '"Ah, my friend! Sorry, I still have to check — rules are rules. Open up?"', 'AI-generated dialogue — friendly officer, bag searched.'),
  ('gate_dialogue_friendly_cleared_1', '"You\'re clear! Welcome back. How was the holiday?"', 'AI-generated dialogue — friendly officer, cleared.'),
  ('gate_dialogue_friendly_contraband_1', '"Ah, my friend... you know I can\'t ignore this. I\'ll have to write you up, but it won\'t be too bad."', 'AI-generated dialogue — friendly officer, contraband found.'),
  ('gate_dialogue_violation_hair_1', '"Your hair is past the limit. You know the rule. Form — go to the barber before you come back."', 'AI-generated dialogue — dress code violation (hair).')
on conflict (key) do nothing;
