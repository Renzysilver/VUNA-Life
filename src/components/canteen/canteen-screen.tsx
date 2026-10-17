/**
 * CanteenScreen — buy food from the AC Canteen.
 *
 * Layout:
 *   1. Wallet banner: balance + frozen state (if frozen, all buy buttons
 *      are disabled with a "frozen" hint)
 *   2. Catalog grid: items grouped by category (meal / small / snack / drink)
 *      with name + price (gold CC) + Buy button
 *   3. Toast on purchase: "+1 Nutri Milk added · 1,145 ₦ left" or
 *      "Not enough ₦ — you need 80" if insufficient
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ShoppingCart, Snowflake, Coffee, UtensilsCrossed, Cookie, GlassWater } from 'lucide-react';

type CanteenItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  basePrice: number;
  metadata: any;
};

type Wallet = { balance: number; frozen: boolean; frozenReason: string | null };

type PurchaseResponse = {
  ok: boolean;
  message?: string;
  reason?: string;
  itemId?: string;
  price?: number;
  newBalance?: number;
  inventoryQuantity?: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  meal: 'Meals',
  small: 'Small meals',
  snack: 'Snacks',
  drink: 'Drinks',
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  meal: <UtensilsCrossed className="h-4 w-4" />,
  small: <Coffee className="h-4 w-4" />,
  snack: <Cookie className="h-4 w-4" />,
  drink: <GlassWater className="h-4 w-4" />,
};

export function CanteenScreen() {
  const { toast } = useToast();
  const [items, setItems] = useState<CanteenItem[] | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/canteen/items', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok) {
          setItems(d.items);
          setWallet(d.wallet);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reload(); }, [reload]);

  const buy = async (item: CanteenItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch('/api/canteen/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const d: PurchaseResponse = await res.json();
      if (!d.ok) {
        toast({
          title: 'Cannot buy',
          description: d.message ?? 'Try again',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: '✓ Bought',
        description: `+1 ${item.name} · ${d.newBalance} ₦ left`,
      });
      // Update wallet balance locally (don't full-reload)
      if (wallet && d.newBalance !== undefined) {
        setWallet({ ...wallet, balance: d.newBalance });
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!items || !wallet) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  // Group items by category
  const byCategory = new Map<string, CanteenItem[]>();
  for (const it of items) {
    if (!byCategory.has(it.category)) byCategory.set(it.category, []);
    byCategory.get(it.category)!.push(it);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Wallet banner */}
      <Card className={cn('border', wallet.frozen ? 'border-destructive/40 bg-destructive/5' : 'border-primary/20 bg-primary/5')}>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Balance</div>
            <div className="cc-amount text-2xl">{wallet.balance.toLocaleString()} ₦</div>
          </div>
          {wallet.frozen ? (
            <Badge variant="destructive" className="text-[10px]">
              <Snowflake className="h-3 w-3 mr-1" /> Frozen
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {wallet.frozen && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Your account is frozen. You can't buy or sell anything until an admin reviews it.
            {wallet.frozenReason && (
              <div className="text-xs mt-1 text-muted-foreground">Reason: {wallet.frozenReason}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Catalog */}
      {Array.from(byCategory.entries()).map(([cat, list]) => (
        <div key={cat} className="space-y-2">
          <h2
            className="text-sm font-bold flex items-center gap-2"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {CATEGORY_ICON[cat]}
            {CATEGORY_LABEL[cat] ?? cat}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {list.map((it) => {
              const affordable = wallet.balance >= it.basePrice && !wallet.frozen;
              return (
                <Card
                  key={it.id}
                  className={cn(
                    'p-3 flex flex-col gap-2',
                    !affordable && 'opacity-60',
                  )}
                >
                  <div className="text-sm font-semibold leading-snug flex-1">{it.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {it.metadata?.naira ? `${it.metadata.naira}₦` : it.metadata?.naira_range ? `${it.metadata.naira_range}₦` : ''}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="cc-amount text-sm">{it.basePrice} ₦</span>
                    <Button
                      size="sm"
                      variant={affordable ? 'default' : 'outline'}
                      className="h-7 text-xs px-2"
                      disabled={!affordable || busyId === it.id}
                      onClick={() => buy(it)}
                    >
                      {busyId === it.id ? '…' : 'Buy'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
