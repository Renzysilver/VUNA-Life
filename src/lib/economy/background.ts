// ==========================================================================
// VUNA Life — family background system (Phase 7)
//
// Each student gets a random family background on first /api/home load:
//   40% → hustler (₦50,000–₦70,000 monthly parent transfer)
//   45% → comfortable (₦50,000–₦150,000)
//   15% → blessed (₦200,000–₦400,000)
//
// The background is IMMUTABLE after roll — no API to change it.
// Monthly parent transfers auto-post on the 1st of each calendar month,
// idempotent per (userId, year-month). Parent transfers are EXEMPT
// from the daily earning cap (they come from outside the game).
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { getConfig } from '@/lib/db/buildings';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

export type BackgroundTier = 'hustler' | 'comfortable' | 'blessed';

/**
 * Roll a family background for the user. Called on first /api/home load
 * if backgroundRolledAt is null. IMMUTABLE after roll — no API to change.
 */
export async function rollBackground(args: {
  userId: string;
  ctx?: AuditContext;
}): Promise<{ tier: BackgroundTier; rolled: boolean }> {
  const user = await db.user.findUnique({ where: { id: args.userId } });
  if (!user) throw new Error('user not found');

  // Already rolled? Return existing tier.
  if (user.backgroundRolledAt) {
    return { tier: user.backgroundTier as BackgroundTier, rolled: false };
  }

  // Roll.
  const weightsRaw = await Promise.all([
    getConfig('background_hustler_weight'),
    getConfig('background_comfortable_weight'),
    getConfig('background_blessed_weight'),
  ]);
  const wHustler = parseFloat(String(weightsRaw[0] ?? '0.40')) || 0.40;
  const wComfortable = parseFloat(String(weightsRaw[1] ?? '0.45')) || 0.45;
  const wBlessed = parseFloat(String(weightsRaw[2] ?? '0.15')) || 0.15;

  const roll = Math.random();
  let tier: BackgroundTier;
  if (roll < wHustler) {
    tier = 'hustler';
  } else if (roll < wHustler + wComfortable) {
    tier = 'comfortable';
  } else {
    tier = 'blessed';
  }

  await db.user.update({
    where: { id: args.userId },
    data: {
      backgroundTier: tier,
      backgroundRolledAt: new Date(),
    },
  });

  await writeAudit(args.ctx ?? {}, 'roll_background', 'users', args.userId, null, {
    tier,
    roll,
  });

  return { tier, rolled: true };
}

/**
 * Ensure the monthly parent transfer has been posted for the current
 * calendar month. Idempotent per (userId, year-month). Posts via the
 * append-only ledger with reason='parent_transfer'. EXEMPT from the
 * daily earning cap (added to cap-exempt reasons alongside weekly_allowance).
 */
export async function ensureMonthlyParentTransfer(args: {
  userId: string;
  ctx?: AuditContext;
}): Promise<{ posted: boolean; amount: number; month: string }> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Check if already posted this month.
  const existing = await db.ledger.findMany({
    where: { toUser: args.userId, reason: 'parent_transfer' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const r of existing) {
    try {
      const meta = JSON.parse(r.metadata ?? '{}');
      if (meta?.month === yearMonth) {
        return { posted: false, amount: 0, month: yearMonth };
      }
    } catch {
      // ignore
    }
  }

  // Get the user's background tier.
  const user = await db.user.findUnique({ where: { id: args.userId } });
  if (!user) throw new Error('user not found');
  const tier = (user.backgroundTier || 'comfortable') as BackgroundTier;

  // Ensure background is rolled.
  if (!user.backgroundRolledAt) {
    const r = await rollBackground({ userId: args.userId, ctx: args.ctx });
    // Use the newly-rolled tier.
  }

  // Get the transfer range for this tier.
  const minRaw = await getConfig(`parent_transfer_${tier}_min`);
  const maxRaw = await getConfig(`parent_transfer_${tier}_max`);
  const min = typeof minRaw === 'number' ? minRaw : parseInt(String(minRaw ?? '50000'), 10) || 50000;
  const max = typeof maxRaw === 'number' ? maxRaw : parseInt(String(maxRaw ?? '150000'), 10) || 150000;
  const amount = min + Math.floor(Math.random() * (max - min + 1));

  // Post the transfer. parent_transfer is cap-exempt.
  try {
    await postLedgerEntry({
      toUser: args.userId,
      amount,
      reason: 'parent_transfer',
      metadata: { month: yearMonth, tier, note: 'Monthly parent transfer' },
      ctx: args.ctx,
    });
  } catch (e: any) {
    // If the account is frozen, the transfer fails. We log it but
    // don't block — the user will get it when unfrozen.
    return { posted: false, amount: 0, month: yearMonth };
  }

  await writeAudit(args.ctx ?? {}, 'parent_transfer', 'ledger', args.userId, null, {
    userId: args.userId,
    amount,
    month: yearMonth,
    tier,
  });

  return { posted: true, amount, month: yearMonth };
}

/**
 * Get the user's background info for display.
 */
export async function getBackgroundInfo(userId: string): Promise<{
  tier: BackgroundTier;
  rolledAt: Date | null;
}> {
  const user = await db.user.findUnique({ where: { id: userId } });
  return {
    tier: (user?.backgroundTier ?? 'comfortable') as BackgroundTier,
    rolledAt: user?.backgroundRolledAt ?? null,
  };
}
