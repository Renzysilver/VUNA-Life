// GET /api/admin/config — list config (admin only)
// PATCH /api/admin/config — update a config value (admin only, audited)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { listConfig, setConfig } from '@/lib/db/buildings';
import { writeAudit } from '@/lib/db/audit-log';

async function requireAdmin() {
  const session = await getSessionFromCookie();
  if (!session) return { error: NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 }) };
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'admin') {
    return { error: NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 }) };
  }
  return { session, user };
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const rows = await listConfig();
  return NextResponse.json({ ok: true, rows });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { user } = guard;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const key = typeof body?.key === 'string' ? body.key : null;
  if (!key) {
    return NextResponse.json({ ok: false, message: 'key is required.' }, { status: 400 });
  }

  // Allowlist of keys the admin can edit. allowed_email_domains is the
  // important one for Phase 1 (verification gate).
  const editable = new Set([
    'allowed_email_domains',
    'cc_to_naira_ratio',
    'weekly_allowance_min',
    'weekly_allowance_max',
    'daily_earning_cap',
    'meal_cost_min',
    'meal_cost_max',
    'haircut_cost_min',
    'haircut_cost_max',
    'missed_mass_fine',
    'hostel_lock_time',
    'mass_start_time',
    'mass_end_time',
    'qr_rotation_seconds',
    'hello_cooldown_minutes',
    'max_hellos_per_day',
    'chat_rate_limit_per_min',
  ]);
  if (!editable.has(key)) {
    return NextResponse.json({ ok: false, message: `Key '${key}' is not editable here.` }, { status: 400 });
  }

  const value = body.value;
  await setConfig(key, value, typeof body.description === 'string' ? body.description : undefined);
  await writeAudit(
    { actorId: user.id, ...getRequestContext(req) },
    'update',
    'config',
    key,
    null,
    { key, value },
  );
  return NextResponse.json({ ok: true });
}
