-- ==========================================================================
-- VUNA Life — Supabase migration 0003_phase4
-- Adds: wallet.frozen flag for anomaly detection (frozen accounts can't
--       post or receive money), wallet.frozen_reason + frozen_at for
--       audit trail.
-- ==========================================================================

-- Add frozen columns to wallets
alter table public.wallets
  add column if not exists frozen boolean not null default false,
  add column if not exists frozen_reason text,
  add column if not exists frozen_at timestamptz,
  add column if not exists frozen_by uuid references public.users(id);

comment on column public.wallets.frozen is
  'When true, postLedgerEntry rejects all money movement for this user. Set by anomaly detection (cap breach, impossible gains) or by admin moderation. Cleared only by admin.';

-- Config: anomaly detection thresholds
insert into public.config (key, value, description) values
  ('anomaly_cap_breach_multiplier', '1.5', 'If earned_today > cap × this multiplier, freeze the account.'),
  ('anomaly_max_goal_reward', '100', 'No single goal_reward entry may exceed this. Anything larger is an impossible gain.'),
  ('anomaly_max_hustle_sale', '500', 'No single hustle_sale entry may exceed this.'),
  ('weekly_allowance_last_run_week', '""', 'ISO week string of the last allowance run (for idempotency). Replaced each Monday.'),
  ('items_seed_version', '1', 'Bumped when the items seed is updated, so re-runs know to refresh.')
on conflict (key) do nothing;

-- Trigger: log every wallet.freeze / unfreeze to audit_log.
create or replace function public.audit_wallet_freeze()
returns trigger language plpgsql security definer as $$
begin
  if (old.frozen is distinct from new.frozen) then
    insert into public.audit_log (action, table_name, row_id, before, after)
    values (
      case when new.frozen then 'freeze' else 'unfreeze' end,
      'wallets',
      new.user_id::text,
      row_to_json(old),
      row_to_json(new)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists wallets_freeze_audit on public.wallets;
create trigger wallets_freeze_audit
after update of frozen on public.wallets
for each row execute function public.audit_wallet_freeze();
