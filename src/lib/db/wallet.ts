// ==========================================================================
// VUNA Life — wallet adapter
// HARD RULE: balance is recomputed from the append-only ledger. The client
// can never set a balance directly. In SQLite (DEMO_MODE) there's no DB
// trigger to do this on insert, so the adapter recomputes on read. In
// production (Supabase) the `recompute_wallet()` trigger handles it.
// ==========================================================================
import { db } from '@/lib/db';
import { writeAudit, type AuditContext } from './audit-log';
import { getConfig } from './buildings';

export type WalletView = {
  userId: string;
  balance: number;
  earnedToday: number;
  earnedTodayDate: Date;
  dailyEarningCap: number;
};

/**
 * Recompute the wallet balance from the ledger: balance = sum(in) - sum(out).
 * Also recomputes earnedToday based on the date.
 */
export async function recomputeWallet(userId: string): Promise<void> {
  const creditsIn = await db.ledger.aggregate({
    where: { toUser: userId },
    _sum: { amount: true },
  });
  const debitsOut = await db.ledger.aggregate({
    where: { fromUser: userId },
    _sum: { amount: true },
  });
  const balance = (creditsIn._sum.amount ?? 0) - (debitsOut._sum.amount ?? 0);

  // earnedToday: sum of amount where to_user=userId AND reason is an earning
  // reason AND created_at is today. We treat any 'earning','goal_reward',
  // 'hustle_sale','campus_job' reason as earned income for the daily cap.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const earnedTodayRows = await db.ledger.findMany({
    where: {
      toUser: userId,
      createdAt: { gte: todayStart },
      reason: { in: ['earning', 'goal_reward', 'hustle_sale', 'campus_job', 'mass_attendance'] },
    },
    select: { amount: true },
  });
  const earnedToday = earnedTodayRows.reduce((s, r) => s + r.amount, 0);

  // Upsert the wallet row.
  await db.wallet.upsert({
    where: { userId },
    update: { balance, earnedToday, earnedTodayDate: new Date(), updatedAt: new Date() },
    create: { userId, balance, earnedToday, earnedTodayDate: new Date() },
  });
}

export async function getWallet(userId: string): Promise<WalletView> {
  await recomputeWallet(userId);
  const row = await db.wallet.findUnique({ where: { userId } });
  const cap = (await getConfig('daily_earning_cap')) ?? 300;
  return {
    userId,
    balance: row?.balance ?? 0,
    earnedToday: row?.earnedToday ?? 0,
    earnedTodayDate: row?.earnedTodayDate ?? new Date(),
    dailyEarningCap: typeof cap === 'number' ? cap : parseInt(String(cap), 10) || 300,
  };
}

/**
 * Server-side only: post a transaction to the ledger. The wallet will be
 * recomputed by the next read. Refuses to push the user below zero debits.
 * Returns the new balance (post-recompute).
 *
 * HARD RULE: this is the ONLY function that should ever write to the ledger
 * from app code. The client can never call it directly; it's invoked by
 * trusted server routes (canteen purchase, mass attendance, hustle sale,
 * goal completion, fine levy).
 */
export async function postLedgerEntry(args: {
  fromUser?: string | null;
  toUser?: string | null;
  amount: number;
  reason: string;
  metadata?: any;
  ctx?: AuditContext;
}): Promise<{ balance: number; earnedToday: number; capped: boolean }> {
  if (args.amount <= 0) throw new Error('amount must be > 0');
  if (!args.fromUser && !args.toUser) throw new Error('need at least one of fromUser/toUser');

  // Enforce the daily earning cap if this is an earning entry.
  let capped = false;
  const earningReasons = ['earning', 'goal_reward', 'hustle_sale', 'campus_job', 'mass_attendance'];
  if (args.toUser && earningReasons.includes(args.reason)) {
    const wallet = await getWallet(args.toUser);
    const cap = wallet.dailyEarningCap;
    if (wallet.earnedToday + args.amount > cap) {
      capped = true;
      // Clip the earning to the remaining cap (don't over-earn).
      const remaining = Math.max(0, cap - wallet.earnedToday);
      if (remaining === 0) {
        // Already at cap; nothing more can be earned today.
        if (args.ctx) {
          await writeAudit(args.ctx, 'cap_block', 'ledger', args.toUser, null, {
            reason: args.reason,
            attempted: args.amount,
            cap,
          });
        }
        return { balance: wallet.balance, earnedToday: wallet.earnedToday, capped: true };
      }
      args.amount = remaining;
    }
  }

  // Check the payer has enough balance (if fromUser is set).
  if (args.fromUser) {
    const fromWallet = await getWallet(args.fromUser);
    if (fromWallet.balance < args.amount) {
      throw new Error(`insufficient_balance: user ${args.fromUser} has ${fromWallet.balance}, needs ${args.amount}`);
    }
  }

  await db.ledger.create({
    data: {
      fromUser: args.fromUser ?? null,
      toUser: args.toUser ?? null,
      amount: args.amount,
      reason: args.reason,
      metadata: JSON.stringify(args.metadata ?? {}),
    },
  });

  // Recompute both wallets (or just the one).
  if (args.toUser) await recomputeWallet(args.toUser);
  if (args.fromUser) await recomputeWallet(args.fromUser);

  if (args.ctx) {
    await writeAudit(args.ctx, 'ledger_entry', 'ledger', args.toUser ?? args.fromUser, null, {
      from: args.fromUser,
      to: args.toUser,
      amount: args.amount,
      reason: args.reason,
      capped,
    });
  }

  // Read final state of the recipient (if any) for return.
  if (args.toUser) {
    const w = await getWallet(args.toUser);
    return { balance: w.balance, earnedToday: w.earnedToday, capped };
  }
  return { balance: 0, earnedToday: 0, capped };
}

export async function listLedger(userId: string, limit = 50) {
  return db.ledger.findMany({
    where: { OR: [{ fromUser: userId }, { toUser: userId }] },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
