// ==========================================================================
// VUNA Life — wardrobe system (Phase 7)
// Purchase + equip clothing items. Server-side only — the client sends
// an item ID, the server validates ownership before updating equippedItems.
//
// HARD RULES:
//   - All purchases go through the append-only ledger (debit via
//     postLedgerEntry with reason='wardrobe_purchase')
//   - Equip validates ownership — equipping an item you don't own is
//     rejected
//   - No real brand logos in SVG (enforced in the renderer, not here)
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from '@/lib/db/wallet';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

export type WardrobeItemRow = {
  id: string;
  name: string;
  category: string;
  variant: string;
  price: number;
  layer: number;
  description: string | null;
  isDesigner: boolean;
};

export async function listWardrobeItems(): Promise<WardrobeItemRow[]> {
  const rows = await db.wardrobeItem.findMany({
    orderBy: [{ category: 'asc' }, { price: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    variant: r.variant,
    price: r.price,
    layer: r.layer,
    description: r.description,
    isDesigner: r.isDesigner,
  }));
}

export type PurchaseResult =
  | { ok: true; itemId: string; price: number; newBalance: number }
  | { ok: false; reason: 'item_not_found' | 'already_owned' | 'insufficient_balance' | 'account_frozen' | 'unknown'; message: string };

export async function purchaseItem(args: {
  userId: string;
  itemId: string;
  ctx?: AuditContext;
}): Promise<PurchaseResult> {
  const item = await db.wardrobeItem.findUnique({ where: { id: args.itemId } });
  if (!item) {
    return { ok: false, reason: 'item_not_found', message: 'Item not found.' };
  }

  // Check if already owned.
  const user = await db.user.findUnique({ where: { id: args.userId } });
  if (!user) {
    return { ok: false, reason: 'unknown', message: 'User not found.' };
  }
  const owned = JSON.parse(user.ownedItems || '[]') as string[];
  if (owned.includes(args.itemId)) {
    return { ok: false, reason: 'already_owned', message: 'You already own this item.' };
  }

  // Post the purchase via the ledger.
  let newBalance = 0;
  if (item.price > 0) {
    try {
      const r = await postLedgerEntry({
        fromUser: args.userId,
        toUser: null,
        amount: item.price,
        reason: 'wardrobe_purchase',
        metadata: { itemId: item.id, itemName: item.name, category: item.category },
        ctx: args.ctx,
      });
      newBalance = r.balance;
    } catch (e: any) {
      if (e.code === 'account_frozen') {
        return { ok: false, reason: 'account_frozen', message: 'Your account is frozen.' };
      }
      if (e.message?.includes('insufficient_balance')) {
        return { ok: false, reason: 'insufficient_balance', message: `Not enough Naira. You need ₦${item.price.toLocaleString()}.` };
      }
      return { ok: false, reason: 'unknown', message: e.message ?? 'Purchase failed.' };
    }
  }

  // Add to owned items.
  owned.push(args.itemId);
  await db.user.update({
    where: { id: args.userId },
    data: { ownedItems: JSON.stringify(owned) },
  });

  await writeAudit(args.ctx ?? {}, 'wardrobe_purchase', 'wardrobe_items', args.itemId, null, {
    userId: args.userId,
    itemId: args.itemId,
    price: item.price,
    newBalance,
  });

  return { ok: true, itemId: args.itemId, price: item.price, newBalance };
}

export type EquipResult =
  | { ok: true; layer: string; itemId: string }
  | { ok: false; reason: 'item_not_found' | 'not_owned' | 'unknown'; message: string };

export async function equipItem(args: {
  userId: string;
  itemId: string;
  ctx?: AuditContext;
}): Promise<EquipResult> {
  const item = await db.wardrobeItem.findUnique({ where: { id: args.itemId } });
  if (!item) {
    return { ok: false, reason: 'item_not_found', message: 'Item not found.' };
  }

  const user = await db.user.findUnique({ where: { id: args.userId } });
  if (!user) {
    return { ok: false, reason: 'unknown', message: 'User not found.' };
  }

  // Validate ownership.
  const owned = JSON.parse(user.ownedItems || '[]') as string[];
  if (!owned.includes(args.itemId)) {
    return { ok: false, reason: 'not_owned', message: 'You do not own this item.' };
  }

  // Update equipped items — set this item as active for its layer (category).
  const equipped = JSON.parse(user.equippedItems || '{}') as Record<string, string>;
  equipped[item.category] = args.itemId;
  await db.user.update({
    where: { id: args.userId },
    data: { equippedItems: JSON.stringify(equipped) },
  });

  await writeAudit(args.ctx ?? {}, 'wardrobe_equip', 'users', args.userId, null, {
    userId: args.userId,
    itemId: args.itemId,
    layer: item.category,
  });

  return { ok: true, layer: item.category, itemId: args.itemId };
}

/**
 * Get the user's equipped items, owned items, and avatar config
 * in one query — used by the Profile + Wardrobe screens.
 */
export async function getUserWardrobeState(userId: string): Promise<{
  equipped: Record<string, string>;
  owned: string[];
  avatarConfig: { bodyType: string; skinTone: string } | null;
}> {
  const user = await db.user.findUnique({ where: { id: userId } });
  return {
    equipped: JSON.parse(user?.equippedItems || '{}'),
    owned: JSON.parse(user?.ownedItems || '[]'),
    avatarConfig: JSON.parse(user?.avatarConfig || '{}'),
  };
}
