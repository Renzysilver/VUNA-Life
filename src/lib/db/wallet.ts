// ==========================================================================
// VUNA Life — wallet adapter
// HARD RULE: balance is recomputed from the append-only ledger. The client
// can never set a balance directly. In SQLite (DEMO_MODE) there's no DB
// trigger to do this on insert, so the adapter recomputes on read. In
// production (Supabase) the `recompute_wallet()` trigger handles it.
//
// PHASE 4 ADDITIONS:
//   - Frozen accounts: if wallet.frozen === true, postLedgerEntry rejects
//     ALL money movement (debits AND credits) with `account_frozen`.
//     Set by anomaly detection (cap breach, impossible gain) or admin.
//   - Anomaly detection: detectCapBreach + detectImpossibleGain freeze
//     the account + audit. Runs after every earning entry.
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
  frozen: boolean;
  frozenReason: string | null;
  frozenAt: Date | null;
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
    frozen: row?.frozen ?? false,
    frozenReason: row?.frozenReason ?? null,
    frozenAt: row?.frozenAt ?? null,
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
 *
 * Phase 4: also rejects if either the payer or payee wallet is frozen.
 * After a successful earning entry, runs anomaly detection and may freeze
 * the account if it detects a cap breach or impossible gain.
 */
export async function postLedgerEntry(args: {
  fromUser?: string | null;
  toUser?: string | null;
  amount: number;
  reason: string;
  metadata?: any;
  ctx?: AuditContext;
}): Promise<{ balance: number; earnedToday: number; capped: boolean; frozen?: boolean }> {
  if (args.amount <= 0) throw new Error('amount must be > 0');
  if (!args.fromUser && !args.toUser) throw new Error('need at least one of fromUser/toUser');

  // ── Pre-flight breach check: if EITHER the payer or payee wallet has
  // earnedToday above cap × multiplier, freeze the account immediately.
  // This catches the case where the ledger has been corrupted (direct
  // DB inserts bypassing the cap) — we freeze on the NEXT money movement,
  // whether it's a debit (canteen purchase) or a credit (goal reward).
  const breachMultRaw = await getConfig('anomaly_cap_breach_multiplier');
  const breachMult = typeof breachMultRaw === 'number'
    ? breachMultRaw
    : parseFloat(String(breachMultRaw ?? '1.5')) || 1.5;
  for (const uid of [args.fromUser, args.toUser]) {
    if (!uid) continue;
    const w = await getWallet(uid);
    if (w.earnedToday > w.dailyEarningCap * breachMult) {
      await freezeAccount({
        userId: uid,
        reason: `cap_breach: earned_today ${w.earnedToday} > cap×${breachMult} (${w.dailyEarningCap * breachMult})`,
        ctx: args.ctx,
      });
      throw Object.assign(new Error('account_frozen'), {
        code: 'account_frozen',
        userId: uid,
        reason: 'cap_breach',
      });
    }
  }

  // ── Frozen-account check: reject all money movement on frozen accounts.
  if (args.fromUser) {
    const fromWallet = await getWallet(args.fromUser);
    if (fromWallet.frozen) {
      throw Object.assign(new Error('account_frozen'), {
        code: 'account_frozen',
        userId: args.fromUser,
        reason: fromWallet.frozenReason,
      });
    }
  }
  if (args.toUser) {
    const toWallet = await getWallet(args.toUser);
    if (toWallet.frozen) {
      throw Object.assign(new Error('account_frozen'), {
        code: 'account_frozen',
        userId: args.toUser,
        reason: toWallet.frozenReason,
      });
    }
  }

  // ── Impossible-gain check: if this is an earning entry, verify the
  // amount is below the per-reason max. Anything larger means a client
  // tried to post a fabricated amount — freeze the account immediately.
  const maxForReason = await getMaxAmountForReason(args.reason);
  if (maxForReason !== null && args.toUser && args.amount > maxForReason) {
    await freezeAccount({
      userId: args.toUser,
      reason: `impossible_gain: ${args.reason} entry ${args.amount} exceeds max ${maxForReason}`,
      ctx: args.ctx,
    });
    throw Object.assign(new Error('impossible_gain_detected'), {
      code: 'impossible_gain',
      userId: args.toUser,
      attempted: args.amount,
      max: maxForReason,
    });
  }

  // ── Daily earning cap: clip earnings at the cap (don't refuse —
  // the user just gets less than requested).
  let capped = false;
  // Earning reasons subject to the daily cap. parent_transfer and
  // weekly_allowance are EXEMPT — they come from outside the game
  // (parents / allowance) and should not be blocked by the cap.
  const earningReasons = ['earning', 'goal_reward', 'hustle_sale', 'campus_job', 'mass_attendance'];
  if (args.toUser && earningReasons.includes(args.reason)) {
    const wallet = await getWallet(args.toUser);
    const cap = wallet.dailyEarningCap;

    // ── Cap-breach check: if earnedToday is ALREADY above cap × multiplier,
    // freeze the account immediately. This catches the case where the
    // ledger has been corrupted (direct DB inserts, replayed inserts from
    // a buggy client, etc.) — the user can't earn their way to safety.
    const breachMultRaw = await getConfig('anomaly_cap_breach_multiplier');
    const breachMult = typeof breachMultRaw === 'number'
      ? breachMultRaw
      : parseFloat(String(breachMultRaw ?? '1.5')) || 1.5;
    if (wallet.earnedToday > cap * breachMult) {
      await freezeAccount({
        userId: args.toUser,
        reason: `cap_breach: earned_today ${wallet.earnedToday} > cap×${breachMult} (${cap * breachMult})`,
        ctx: args.ctx,
      });
      return { balance: wallet.balance, earnedToday: wallet.earnedToday, capped: true, frozen: true };
    }

    if (wallet.earnedToday + args.amount > cap) {
      capped = true;
      const remaining = Math.max(0, cap - wallet.earnedToday);
      if (remaining === 0) {
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

  // ── Insufficient-balance check (for debits).
  if (args.fromUser) {
    const fromWallet = await getWallet(args.fromUser);
    if (fromWallet.balance < args.amount) {
      throw new Error(`insufficient_balance: user ${args.fromUser} has ${fromWallet.balance}, needs ${args.amount}`);
    }
  }

  // ── Insert the ledger row.
  await db.ledger.create({
    data: {
      fromUser: args.fromUser ?? null,
      toUser: args.toUser ?? null,
      amount: args.amount,
      reason: args.reason,
      metadata: JSON.stringify(args.metadata ?? {}),
    },
  });

  // Recompute both wallets.
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
    return { balance: w.balance, earnedToday: w.earnedToday, capped, frozen: w.frozen };
  }
  // If there's no recipient (e.g. a canteen purchase — money goes to
  // a sink), return the payer's new balance so the caller can show it.
  if (args.fromUser) {
    const w = await getWallet(args.fromUser);
    return { balance: w.balance, earnedToday: w.earnedToday, capped, frozen: w.frozen };
  }
  return { balance: 0, earnedToday: 0, capped };
}

/**
 * Freeze a wallet. Sets frozen=true, frozen_reason, frozen_at. Audits
 * the freeze action. The wallet adapter now rejects all money movement
 * on frozen accounts (debits AND credits).
 *
 * Uses upsert so the freeze works even if no wallet row exists yet
 * (the row gets created on-the-fly with frozen=true).
 */
export async function freezeAccount(args: {
  userId: string;
  reason: string;
  ctx?: AuditContext;
}): Promise<void> {
  // Recompute first so the row exists with the correct balance.
  await recomputeWallet(args.userId);
  await db.wallet.update({
    where: { userId: args.userId },
    data: {
      frozen: true,
      frozenReason: args.reason,
      frozenAt: new Date(),
    },
  });
  await writeAudit(args.ctx ?? {}, 'freeze', 'wallets', args.userId, null, {
    userId: args.userId,
    reason: args.reason,
  });
}

/**
 * Unfreeze a wallet. Admin-only operation (the route handler enforces role).
 */
export async function unfreezeAccount(args: {
  userId: string;
  ctx?: AuditContext;
}): Promise<void> {
  // Recompute first so the row exists.
  await recomputeWallet(args.userId);
  await db.wallet.update({
    where: { userId: args.userId },
    data: {
      frozen: false,
      frozenReason: null,
      frozenAt: null,
    },
  });
  await writeAudit(args.ctx ?? {}, 'unfreeze', 'wallets', args.userId, null, {
    userId: args.userId,
  });
}

/**
 * Per-reason max amounts for impossible-gain detection. If a ledger entry
 * with one of these reasons has an amount exceeding the configured max,
 * the account is frozen immediately. The thresholds are conservative —
 * they catch obvious fabrication without false-positiving real gameplay.
 *
 * Returns null for reasons not in the table (no max enforced).
 */
async function getMaxAmountForReason(reason: string): Promise<number | null> {
  const key = `anomaly_max_${reason}`;
  const v = await getConfig(key);
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

export async function listLedger(userId: string, limit = 50) {
  return db.ledger.findMany({
    where: { OR: [{ fromUser: userId }, { toUser: userId }] },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
