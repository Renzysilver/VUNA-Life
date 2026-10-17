// ==========================================================================
// VUNA Life — weekly allowance auto-post
// On Mondays (or the first /api/home load of a new ISO week), if the user
// hasn't received an allowance this week, post a random amount in the
// config range [weekly_allowance_min, weekly_allowance_max] via the
// ledger (reason='weekly_allowance'). Idempotent per (userId, ISO week).
//
// HARD RULE: the allowance posts through the same append-only ledger as
// every other money movement. The client can never trigger this directly.
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { getConfig } from '@/lib/db/buildings';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

function isoWeek(d: Date): string {
  // ISO 8601 week: YYYY-Www
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Check if the user has already received a weekly_allowance entry
 * this ISO week. We look for a ledger row with reason='weekly_allowance'
 * and metadata.week === currentWeek.
 */
async function hasAllowanceThisWeek(userId: string, week: string): Promise<boolean> {
  const rows = await db.ledger.findMany({
    where: { toUser: userId, reason: 'weekly_allowance' },
    orderBy: { createdAt: 'desc' },
    take: 5, // recent 5 is enough — they get one per week
  });
  for (const r of rows) {
    try {
      const meta = JSON.parse(r.metadata ?? '{}');
      if (meta?.week === week) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Ensure the user has received this week's allowance. Idempotent.
 * Returns the amount posted (or 0 if already received this week, or if
 * today is not a weekday Monday — we post on Mondays only).
 *
 * Note: we don't strictly require Monday for the auto-post. We post on
 * the first /api/home load of a new ISO week. This is more forgiving for
 * users who don't open the app on Mondays, and the idempotency check
 * ensures they only get one allowance per week.
 */
export async function ensureWeeklyAllowance(
  userId: string,
  ctx?: AuditContext,
): Promise<{ posted: boolean; amount: number; week: string }> {
  const week = isoWeek(new Date());
  if (await hasAllowanceThisWeek(userId, week)) {
    return { posted: false, amount: 0, week };
  }

  const minRaw = await getConfig('weekly_allowance_min');
  const maxRaw = await getConfig('weekly_allowance_max');
  const min = typeof minRaw === 'number' ? minRaw : parseInt(String(minRaw ?? '1200'), 10) || 1200;
  const max = typeof maxRaw === 'number' ? maxRaw : parseInt(String(maxRaw ?? '2000'), 10) || 2000;
  // Random within [min, max] — varies per player per week (per design doc).
  const amount = min + Math.floor(Math.random() * (max - min + 1));

  const r = await postLedgerEntry({
    toUser: userId,
    amount,
    reason: 'weekly_allowance',
    metadata: { week, note: 'Pocket money from home' },
    ctx,
  });

  await writeAudit(ctx ?? {}, 'weekly_allowance', 'ledger', userId, null, {
    userId, week, amount, newBalance: r.balance,
  });

  return { posted: true, amount, week };
}
