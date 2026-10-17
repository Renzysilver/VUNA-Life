// ==========================================================================
// VUNA Life — mass sessions
// Faculty mass runs Monday to Friday at 12:10–13:00, one faculty per day,
// compulsory. Missing it carries a 500 CC fine + a warning meter.
//
// ensureTodayMassSession(): called on /api/home load. If no mass session
//   exists for today (a weekday), create one. Idempotent.
//
// checkAndApplyMissedMassFines(userId): called on /api/home load. If today's
//   mass session has CLOSED and the user has no attendance row for it,
//   apply the 500 CC fine via the ledger + record a 'Warning' discipline
//   row + bump the missed_mass_warnings counter.
//
// HARD RULE: the fine comes out of the wallet via the append-only ledger
// (server-side, never set a balance directly). The warning meter is a
// discipline record — private to the player, never public. Real attendance
// records in the `attendance` table are NEVER mutated by game logic.
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';
import { getConfig } from '@/lib/db/buildings';
import { createSession } from './sessions';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTimeToToday(timeStr: string): { opensAt: Date; closesAt: Date } {
  // timeStr format: "12:10" or "12:10:00"
  const [hStr, mStr, sStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const s = sStr ? parseInt(sStr, 10) : 0;
  const today = new Date();
  today.setHours(h, m, s, 0);
  const opensAt = new Date(today);

  // For closesAt, we need the end time. We compute it from the start time
  // + a duration (default 50 minutes per the design doc: 12:10–13:00).
  const closesAt = new Date(today);
  closesAt.setMinutes(closesAt.getMinutes() + 50);
  return { opensAt, closesAt };
}

/**
 * Find the building id for the chapel/chaplaincy. In the seed we have
 * pin='chapel' for the Chaplaincy building (status SECONDARY_SOURCE).
 */
async function getChapelBuildingId(): Promise<string | null> {
  const b = await db.building.findUnique({ where: { pin: 'chapel' } });
  return b?.id ?? null;
}

/**
 * Ensure today's mass session exists. Skips on weekends (mass is Mon–Fri).
 * Returns the session row, plus whether it was created this call.
 */
export async function ensureTodayMassSession(): Promise<{
  session: { id: string; opensAt: Date; closesAt: Date; type: string } | null;
  created: boolean;
  skippedWeekend: boolean;
}> {
  const now = new Date();
  const weekday = now.getDay(); // 0=Sun..6=Sat
  if (weekday === 0 || weekday === 6) {
    return { session: null, created: false, skippedWeekend: true };
  }

  const startRaw = await getConfig('mass_start_time');
  const startStr = typeof startRaw === 'string' ? startRaw.replace(/^"|"$/g, '') : '12:10';
  const { opensAt, closesAt } = parseTimeToToday(startStr);

  // Check if a mass session already exists for today (same opensAt day).
  const dayStart = new Date(opensAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(opensAt);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await db.session.findFirst({
    where: {
      type: 'mass',
      opensAt: { gte: dayStart, lte: dayEnd },
    },
  });
  if (existing) {
    return {
      session: { id: existing.id, opensAt: existing.opensAt, closesAt: existing.closesAt, type: existing.type },
      created: false,
      skippedWeekend: false,
    };
  }

  // Create one. We assign no course (mass is not a course); we do assign
  // the chapel venue if it exists. No lecturer (the chaplaincy is a
  // system actor in Phase 1; later phases can wire a real chaplaincy
  // account).
  const chapelId = await getChapelBuildingId();
  const s = await createSession({
    type: 'mass',
    venueId: chapelId ?? undefined,
    lecturerId: null,
    opensAt,
    closesAt,
  });

  return {
    session: { id: s.id, opensAt: s.opensAt, closesAt: s.closesAt, type: s.type },
    created: true,
    skippedWeekend: false,
  };
}

/**
 * Check whether the user has already been fined for missing today's mass.
 * We store this as a ledger entry with reason='missed_mass_fine' and
 * metadata.sessionId. Idempotent: don't fine twice for the same session.
 */
export async function hasUserBeenFinedForMass(userId: string, sessionId: string): Promise<boolean> {
  // Look for a ledger entry from this user with reason='missed_mass_fine'
  // and metadata.sessionId === sessionId.
  const rows = await db.ledger.findMany({
    where: { fromUser: userId, reason: 'missed_mass_fine' },
  });
  for (const r of rows) {
    try {
      const meta = JSON.parse(r.metadata);
      if (meta?.sessionId === sessionId) return true;
    } catch {
      // ignore malformed metadata
    }
  }
  return false;
}

/**
 * Check if the user has an attendance row for the given session.
 */
export async function hasUserCheckedInToSession(userId: string, sessionId: string): Promise<boolean> {
  const row = await db.attendance.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });
  return !!row;
}

/**
 * Apply the missed-mass fine for a user + a specific mass session.
 * Posts a 500 CC debit via the ledger + records a Warning discipline row
 * + bumps the missed_mass_warnings counter in config.
 *
 * HARD RULE: this is the ONLY function that applies the missed-mass fine.
 * The /api/home endpoint calls it after verifying the session has closed
 * and the user didn't check in.
 */
export async function applyMissedMassFine(args: {
  userId: string;
  sessionId: string;
  ctx?: AuditContext;
}): Promise<{ applied: boolean; amount: number; reason: string }> {
  // Idempotency: check if already fined.
  if (await hasUserBeenFinedForMass(args.userId, args.sessionId)) {
    return { applied: false, amount: 0, reason: 'already_fined' };
  }

  const amountRaw = await getConfig('missed_mass_fine');
  const amount = typeof amountRaw === 'number' ? amountRaw : parseInt(String(amountRaw ?? '500'), 10) || 500;

  // Post the fine as a DEBIT (from_user=userId, to_user=null, but our
  // schema requires at least one of from/to. Use to_user='system' as a
  // sentinel for money sinks. We don't have a system user row — use null
  // for to_user and require from_user only.)
  // Looking at the ledger schema, the constraint is:
  //   check (from_user is not null or to_user is not null)
  // So from_user=userId, to_user=null satisfies it.
  await postLedgerEntry({
    fromUser: args.userId,
    toUser: null, // money sink — fine burned to /dev/null
    amount,
    reason: 'missed_mass_fine',
    metadata: { sessionId: args.sessionId, day: new Date().toISOString().slice(0, 10) },
    ctx: args.ctx,
  });

  // Record a Warning discipline row (private to the player).
  await db.discipline.create({
    data: {
      userId: args.userId,
      tier: 'Warning',
      reason: `Missed mass on ${new Date().toLocaleDateString()}`,
      expiresAt: null, // warnings don't expire; the meter accumulates
      metadata: JSON.stringify({ sessionId: args.sessionId, kind: 'missed_mass' }),
    },
  });

  // Bump the missed_mass_warnings counter.
  const existingCount = await db.discipline.count({
    where: { userId: args.userId, tier: 'Warning', metadata: { contains: 'missed_mass' } },
  });
  await writeAudit(args.ctx ?? {}, 'missed_mass_fine', 'ledger', args.userId, null, {
    userId: args.userId,
    sessionId: args.sessionId,
    amount,
    totalWarnings: existingCount,
  });

  return { applied: true, amount, reason: 'applied' };
}

/**
 * Check + apply missed-mass fines for the user. Called from /api/home.
 * Walks today's mass session; if it's closed and the user didn't check
 * in (and hasn't already been fined), apply the fine.
 */
export async function checkAndApplyMissedMassFines(
  userId: string,
  ctx?: AuditContext,
): Promise<{ session: { id: string; opensAt: Date; closesAt: Date } | null; fineApplied: boolean; amount: number; reason: string }> {
  const todayMass = await ensureTodayMassSession();
  if (!todayMass.session) {
    return { session: null, fineApplied: false, amount: 0, reason: 'no_mass_today' };
  }

  const now = new Date();
  // Only fine if the mass has CLOSED (past 13:00).
  if (now < todayMass.session.closesAt) {
    return { session: todayMass.session, fineApplied: false, amount: 0, reason: 'mass_still_open' };
  }

  // If the user checked in, no fine.
  if (await hasUserCheckedInToSession(userId, todayMass.session.id)) {
    return { session: todayMass.session, fineApplied: false, amount: 0, reason: 'checked_in' };
  }

  // Apply the fine.
  const r = await applyMissedMassFine({
    userId,
    sessionId: todayMass.session.id,
    ctx,
  });
  return {
    session: todayMass.session,
    fineApplied: r.applied,
    amount: r.amount,
    reason: r.reason,
  };
}

/**
 * Get the count of missed-mass warnings on the user's discipline record.
 * Used by the Home screen to show the "warning meter".
 */
export async function getMissedMassWarningsCount(userId: string): Promise<number> {
  const rows = await db.discipline.findMany({
    where: { userId, tier: 'Warning' },
  });
  let count = 0;
  for (const r of rows) {
    try {
      const meta = JSON.parse(r.metadata ?? '{}');
      if (meta?.kind === 'missed_mass') count++;
    } catch {
      // ignore
    }
  }
  return count;
}
