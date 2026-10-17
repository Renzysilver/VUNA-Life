// ==========================================================================
// VUNA Life — evening hustle
//
// Available 18:00–22:00 WAT only (server time, never client clock).
// Student picks a vendor item from a consignment list, sets a selling
// price ±20% of the suggested price, and the system simulates the sale.
//
// Money flow:
//   1. Debit the purchase cost from the student's wallet (via ledger)
//   2. Simulate the sale (higher price → lower sell probability)
//   3. If sold, credit the revenue to the student's wallet (via ledger,
//      subject to the daily earning cap + anomaly detection)
//
// HARD RULES:
//   - Revenue goes through the append-only ledger with the same cap +
//     anomaly detection as every other earning.
//   - Server time only for the 18:00–22:00 window.
//   - Max 3 attempts per evening window (config).
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';
import { getConfig } from '@/lib/db/buildings';

// Seeded consignment items (from the design doc's reference prices).
// Each has a purchase cost (what the vendor charges) and a suggested
// selling price.
const CONSIGNMENT_ITEMS = [
  { code: 'puff_puff', name: 'Puff Puff', purchaseCost: 20, suggestedPrice: 35 },
  { code: 'chin_chin', name: 'Chin Chin', purchaseCost: 30, suggestedPrice: 55 },
  { code: 'gala', name: 'Gala', purchaseCost: 25, suggestedPrice: 40 },
] as const;

export function getConsignmentItems() {
  return CONSIGNMENT_ITEMS;
}

function parseTimeToMinutes(timeStr: string): number {
  const clean = timeStr.replace(/^"|"$/g, '');
  const [h, m] = clean.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Check if the hustle window is currently open (18:00–22:00 server time).
 * Never trusts the client clock — uses Date.now() (server time).
 */
export async function isHustleWindowOpen(): Promise<{
  open: boolean;
  opensAt: string;
  closesAt: string;
  minutesUntilOpen: number | null;
  minutesUntilClose: number | null;
}> {
  const startRaw = await getConfig('hustle_window_start');
  const endRaw = await getConfig('hustle_window_end');
  const startStr = typeof startRaw === 'string' ? startRaw.replace(/^"|"$/g, '') : '18:00';
  const endStr = typeof endRaw === 'string' ? endRaw.replace(/^"|"$/g, '') : '22:00';
  const startMin = parseTimeToMinutes(startStr);
  const endMin = parseTimeToMinutes(endStr);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const open = nowMin >= startMin && nowMin < endMin;
  return {
    open,
    opensAt: startStr,
    closesAt: endStr,
    minutesUntilOpen: nowMin < startMin ? startMin - nowMin : null,
    minutesUntilClose: open ? endMin - nowMin : null,
  };
}

/**
 * Get the user's hustle status: how many attempts they've used tonight,
 * how many remain.
 */
export async function getHustleStatus(userId: string) {
  const windowInfo = await isHustleWindowOpen();
  const maxAttemptsRaw = await getConfig('hustle_max_attempts_per_evening');
  const maxAttempts = typeof maxAttemptsRaw === 'number' ? maxAttemptsRaw : parseInt(String(maxAttemptsRaw ?? '3'), 10) || 3;

  // Count today's attempts.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const attempts = await db.hustleAttempt.count({
    where: { userId, attemptDate: { gte: todayStart } },
  });

  return {
    ...windowInfo,
    attemptsToday: attempts,
    maxAttempts,
    remaining: Math.max(0, maxAttempts - attempts),
  };
}

export type HustleResult =
  | { ok: true; sold: boolean; revenue: number; netProfit: number; newBalance: number }
  | { ok: false; reason: 'window_closed' | 'max_attempts' | 'insufficient_balance' | 'account_frozen' | 'invalid_price' | 'invalid_item' | 'unknown'; message: string };

/**
 * Start a hustle attempt.
 *
 * 1. Verify the window is open + user has remaining attempts.
 * 2. Debit the purchase cost from the student's wallet.
 * 3. Simulate the sale: higher price → lower sell probability.
 * 4. If sold, credit the revenue via the ledger (cap + anomaly detection).
 *
 * Returns the outcome: sold + revenue + net profit + new balance.
 */
export async function startHustle(args: {
  userId: string;
  itemCode: string;
  salePrice: number;
  ctx?: AuditContext;
}): Promise<HustleResult> {
  // Validate the item.
  const item = CONSIGNMENT_ITEMS.find((i) => i.code === args.itemCode);
  if (!item) {
    return { ok: false, reason: 'invalid_item', message: 'Unknown item.' };
  }

  // Validate the sale price (within ±20% of suggested).
  const variancePctRaw = await getConfig('hustle_price_variance_pct');
  const variancePct = typeof variancePctRaw === 'number' ? variancePctRaw : parseInt(String(variancePctRaw ?? '20'), 10) || 20;
  const minPrice = Math.round(item.suggestedPrice * (1 - variancePct / 100));
  const maxPrice = Math.round(item.suggestedPrice * (1 + variancePct / 100));
  if (args.salePrice < minPrice || args.salePrice > maxPrice) {
    return { ok: false, reason: 'invalid_price', message: `Price must be between ${minPrice} and ${maxPrice} CC.` };
  }

  // Check the window.
  const windowInfo = await isHustleWindowOpen();
  if (!windowInfo.open) {
    return { ok: false, reason: 'window_closed', message: `Hustle window is ${windowInfo.opensAt}–${windowInfo.closesAt}. Come back later.` };
  }

  // Check remaining attempts.
  const status = await getHustleStatus(args.userId);
  if (status.remaining <= 0) {
    return { ok: false, reason: 'max_attempts', message: `Max ${status.maxAttempts} attempts per evening.` };
  }

  // Debit the purchase cost.
  let newBalance = 0;
  try {
    const r = await postLedgerEntry({
      fromUser: args.userId,
      toUser: null,
      amount: item.purchaseCost,
      reason: 'hustle_purchase',
      metadata: { itemCode: item.code, itemName: item.name },
      ctx: args.ctx,
    });
    newBalance = r.balance;
  } catch (e: any) {
    if (e.code === 'account_frozen') {
      return { ok: false, reason: 'account_frozen', message: 'Your account is frozen.' };
    }
    if (e.message?.includes('insufficient_balance')) {
      return { ok: false, reason: 'insufficient_balance', message: `You need ${item.purchaseCost} CC for stock. You have less.` };
    }
    return { ok: false, reason: 'unknown', message: e.message ?? 'Hustle failed.' };
  }

  // Simulate the sale. Higher price → lower sell probability.
  // Base sell probability = 0.7 (70% chance at suggested price).
  // For every 1% above suggested, sell probability drops by 2%.
  // For every 1% below suggested, sell probability rises by 1% (max 90%).
  const priceDiff = (args.salePrice - item.suggestedPrice) / item.suggestedPrice;
  let sellProb = 0.7 - (priceDiff > 0 ? priceDiff * 2 : priceDiff * 1);
  sellProb = Math.max(0.1, Math.min(0.9, sellProb));
  const roll = Math.random();
  const sold = roll < sellProb;

  let revenue = 0;
  if (sold) {
    // Credit the revenue via the ledger (subject to cap + anomaly).
    try {
      const r = await postLedgerEntry({
        toUser: args.userId,
        amount: args.salePrice,
        reason: 'hustle_sale',
        metadata: { itemCode: item.code, itemName: item.name, salePrice: args.salePrice },
        ctx: args.ctx,
      });
      revenue = args.salePrice;
      newBalance = r.balance;
    } catch (e: any) {
      // If the credit fails (e.g., cap reached), the sale still "sold"
      // but the student doesn't get the CC (cap-blocked).
      // The purchase cost was already debited — the student loses stock.
      revenue = 0;
    }
  }

  const netProfit = revenue - item.purchaseCost;

  // Record the attempt.
  await db.hustleAttempt.create({
    data: {
      userId: args.userId,
      itemCode: item.code,
      itemName: item.name,
      purchaseCost: item.purchaseCost,
      salePrice: args.salePrice,
      sold,
      revenue,
    },
  });

  await writeAudit(args.ctx ?? {}, 'hustle', 'hustle_attempts', null, null, {
    userId: args.userId,
    item: item.code,
    purchaseCost: item.purchaseCost,
    salePrice: args.salePrice,
    sold,
    revenue,
    netProfit,
    newBalance,
  });

  return {
    ok: true,
    sold,
    revenue,
    netProfit,
    newBalance,
  };
}
