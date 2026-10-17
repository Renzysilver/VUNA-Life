// ==========================================================================
// VUNA Life — canteen adapter
// Buy items from the food table. Posts a server-side ledger debit; the
// client can never set a balance. If the wallet is frozen, the purchase
// is rejected. The wallet adapter enforces the daily earning cap on the
// earning side — canteen purchases are debits, so the cap doesn't apply,
// but insufficient_balance + account_frozen both reject.
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

export type CanteenItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  basePrice: number;
  metadata: any;
};

export async function listCanteenItems(): Promise<CanteenItem[]> {
  const rows = await db.item.findMany({
    where: { category: { in: ['meal', 'small', 'snack', 'drink'] } },
    orderBy: [{ category: 'asc' }, { basePrice: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    basePrice: r.basePrice,
    metadata: safeJson(r.metadata),
  }));
}

export type PurchaseResult =
  | { ok: true; itemId: string; price: number; newBalance: number; inventoryQuantity: number }
  | { ok: false; reason: 'item_not_found' | 'insufficient_balance' | 'account_frozen' | 'unknown_error'; message: string };

/**
 * Buy an item from the canteen. Posts a ledger debit (from_user=userId,
 * to_user=null, reason='canteen_purchase', metadata={itemId, itemCode}).
 * Adds the item to the user's inventory (or increments quantity).
 *
 * All money movement goes through postLedgerEntry, which enforces:
 *   - Wallet must not be frozen (account_frozen)
 *   - Wallet must have enough balance (insufficient_balance)
 *   - Ledger is append-only (the only INSERT path)
 *
 * Returns the new balance + inventory quantity.
 */
export async function purchaseItem(args: {
  userId: string;
  itemId: string;
  ctx?: AuditContext;
}): Promise<PurchaseResult> {
  const item = await db.item.findUnique({ where: { id: args.itemId } });
  if (!item) {
    return { ok: false, reason: 'item_not_found', message: 'Item not found.' };
  }

  let newBalance = 0;
  try {
    const r = await postLedgerEntry({
      fromUser: args.userId,
      toUser: null,
      amount: item.basePrice,
      reason: 'canteen_purchase',
      metadata: {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        category: item.category,
      },
      ctx: args.ctx,
    });
    newBalance = r.balance;
  } catch (e: any) {
    if (e.code === 'account_frozen') {
      return { ok: false, reason: 'account_frozen', message: 'Your account is frozen. Contact admin.' };
    }
    if (e.message?.includes('insufficient_balance')) {
      return { ok: false, reason: 'insufficient_balance', message: `Not enough CC. You need ${item.basePrice}, have less.` };
    }
    return { ok: false, reason: 'unknown_error', message: e.message ?? 'Purchase failed.' };
  }

  // Add to inventory (or increment quantity if the user already has one).
  const existing = await db.inventory.findUnique({
    where: { userId_itemId: { userId: args.userId, itemId: item.id } },
  });
  let inventoryQuantity: number;
  if (existing) {
    const updated = await db.inventory.update({
      where: { userId_itemId: { userId: args.userId, itemId: item.id } },
      data: { quantity: { increment: 1 } },
    });
    inventoryQuantity = updated.quantity;
  } else {
    const created = await db.inventory.create({
      data: { userId: args.userId, itemId: item.id, quantity: 1 },
    });
    inventoryQuantity = created.quantity;
  }

  await writeAudit(args.ctx ?? {}, 'purchase', 'inventory', item.id, null, {
    userId: args.userId,
    itemId: item.id,
    itemCode: item.code,
    price: item.basePrice,
    newBalance,
  });

  return {
    ok: true,
    itemId: item.id,
    price: item.basePrice,
    newBalance,
    inventoryQuantity,
  };
}

function safeJson(s: string | null): any {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
