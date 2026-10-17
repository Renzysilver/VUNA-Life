-- ==========================================================================
-- VUNA Life — Supabase migration 0005_phase7
-- Family backgrounds, avatar config, wardrobe items, Naira economy
-- ==========================================================================

-- Add background + avatar columns to users
alter table public.users
  add column if not exists background_tier text not null default 'comfortable'
    check (background_tier in ('hustler', 'comfortable', 'blessed')),
  add column if not exists background_rolled_at timestamptz,
  add column if not exists avatar_config jsonb not null default '{}'::jsonb,
  add column if not exists equipped_items jsonb not null default '{}'::jsonb,
  add column if not exists owned_items jsonb not null default '[]'::jsonb;

comment on column public.users.background_tier is 'Family background tier — immutable after roll. hustler/comfortable/blessed.';
comment on column public.users.avatar_config is 'JSON: { bodyType: slim|medium|full, skinTone: #hex }';
comment on column public.users.equipped_items is 'JSON: { outfit_top: itemId, outfit_bottom: itemId, shoes: itemId, accessory_1: itemId, ... }';
comment on column public.users.owned_items is 'JSON array of wardrobe item IDs owned by the user';

-- ---------- wardrobe_items ----------
create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('outfit_top', 'outfit_bottom', 'shoes', 'accessory_1', 'accessory_2', 'accessory_3', 'hair')),
  variant text not null,
  price int not null check (price >= 0),
  layer int not null check (layer between 1 and 9),
  description text,
  is_designer boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wardrobe_items_category_idx on public.wardrobe_items(category);

alter table public.wardrobe_items enable row level security;
create policy "wardrobe_auth_read" on public.wardrobe_items for select to authenticated using (true);

-- Config: Naira economy + Phase 7 additions
insert into public.config (key, value, description) values
  ('naira_currency_symbol', '"₦"', 'Currency symbol for display.'),
  ('daily_earning_cap_naira', '3000', 'Daily earning cap in Naira (replaces CC cap).'),
  ('missed_mass_fine_naira', '2500', 'Missed mass fine in Naira.'),
  ('haircut_cost_min_naira', '1500', 'Min haircut cost in Naira.'),
  ('haircut_cost_max_naira', '2500', 'Max haircut cost in Naira.'),
  ('meal_cost_min_naira', '300', 'Min meal cost in Naira.'),
  ('meal_cost_max_naira', '800', 'Max meal cost in Naira.'),
  ('weekly_allowance_min_naira', '12000', 'Min weekly allowance in Naira.'),
  ('weekly_allowance_max_naira', '20000', 'Max weekly allowance in Naira.'),
  ('parent_transfer_hustler_min', '50000', 'Monthly parent transfer min for hustler tier.'),
  ('parent_transfer_hustler_max', '70000', 'Monthly parent transfer max for hustler tier.'),
  ('parent_transfer_comfortable_min', '50000', 'Monthly parent transfer min for comfortable tier.'),
  ('parent_transfer_comfortable_max', '150000', 'Monthly parent transfer max for comfortable tier.'),
  ('parent_transfer_blessed_min', '200000', 'Monthly parent transfer min for blessed tier.'),
  ('parent_transfer_blessed_max', '400000', 'Monthly parent transfer max for blessed tier.'),
  ('background_hustler_weight', '0.40', 'Probability of rolling hustler background.'),
  ('background_comfortable_weight', '0.45', 'Probability of rolling comfortable background.'),
  ('background_blessed_weight', '0.15', 'Probability of rolling blessed background.')
on conflict (key) do nothing;
