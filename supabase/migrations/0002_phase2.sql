-- ==========================================================================
-- VUNA Life — Supabase migration 0002_phase2
-- Adds: announcements (admin/school-posted), day_summaries is already in 0001
-- Adds: hair_state audit trigger so changes are auditable
-- Adds: ledger_to_wallets trigger is already in 0001 (recompute_wallet)
-- ==========================================================================

-- ---------- announcements ----------
-- School-posted announcements shown on the Home screen strip. Authors are
-- admins (role='admin' on users) or system-generated rows in DEMO_MODE.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  category text not null default 'general' check (category in ('general','academic','spiritual','social','safety','admin')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_pinned boolean not null default false,
  author_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists announcements_active_idx
  on public.announcements(starts_at, ends_at)
  where ends_at is null or ends_at > now();

alter table public.announcements enable row level security;
create policy "announcements_auth_read" on public.announcements
  for select to authenticated using (true);

-- Audit trigger for announcements (admin mutations)
create or replace function public.audit_announcement_change()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (action, table_name, row_id, before, after)
  values (
    case when tg_op = 'INSERT' then 'insert'
         when tg_op = 'UPDATE' then 'update'
         when tg_op = 'DELETE' then 'delete' end,
    'announcements',
    coalesce(new.id::text, old.id::text),
    case when tg_op = 'INSERT' then null else row_to_json(old) end,
    case when tg_op = 'DELETE' then null else row_to_json(new) end
  );
  return coalesce(new, old);
end;
$$;
drop trigger if exists announcements_audit on public.announcements;
create trigger announcements_audit
after insert or update or delete on public.announcements
for each row execute function public.audit_announcement_change();

-- Add a config row for the goals-engine templates pointer (real templates
-- live in the goals table itself; this is just a count + cadence hint).
insert into public.config (key, value, description) values
  ('home_daily_goal_count', '3', 'How many daily goals to assign to each student per day.'),
  ('home_class_alert_minutes', '15', 'Show a class alert banner when the next class is within N minutes.')
on conflict (key) do nothing;
