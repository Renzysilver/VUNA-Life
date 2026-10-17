/**
 * WardrobeScreen — full-screen overlay for buying + equipping clothes.
 *
 * Two tabs: Owned (equip what you have) + Shop (buy what you don't).
 * Live avatar preview updates as you equip items.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { X, Check, ShoppingBag, Sparkles } from 'lucide-react';
import { AvatarRenderer, type EquippedItems, type AvatarConfig, type HairStage } from '@/components/avatar/avatar-renderer';

type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  variant: string;
  price: number;
  layer: number;
  isDesigner: boolean;
  description: string | null;
};

type Props = {
  onClose: () => void;
  onBalanceChange?: (b: number) => void;
};

const CATEGORY_LABELS: Record<string, string> = {
  outfit_top: 'Shirts',
  outfit_bottom: 'Trousers',
  shoes: 'Shoes',
  accessory_1: 'Chains',
  accessory_2: 'Watches',
  accessory_3: 'Glasses',
};

export function WardrobeScreen({ onClose, onBalanceChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<WardrobeItem | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/wardrobe/items', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.ok) return;
        setItems(d.items);
        setOwned(d.owned);
        setEquipped(d.equipped);
        setAvatarConfig(d.avatarConfig);
      })
      .catch(() => {});
    // Also fetch wallet balance for display
    fetch('/api/wallet', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setBalance(d.wallet.balance); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reload(); }, [reload]);

  const handleEquip = async (itemId: string) => {
    setBusyId(itemId);
    try {
      const res = await fetch('/api/wardrobe/equip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Cannot equip', description: d.message, variant: 'destructive' });
        return;
      }
      // Update local equipped state for live avatar preview
      setEquipped((prev) => ({ ...prev, [d.layer]: itemId }));
      toast({ title: '✓ Equipped' });
    } finally {
      setBusyId(null);
    }
  };

  const handleBuy = async (item: WardrobeItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch('/api/wardrobe/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Cannot buy', description: d.message, variant: 'destructive' });
        return;
      }
      setOwned((prev) => [...prev, item.id]);
      setBalance(d.newBalance);
      onBalanceChange?.(d.newBalance);
      toast({ title: '✓ Bought', description: `${item.name} · ₦${d.price.toLocaleString()} · ₦${d.newBalance.toLocaleString()} left` });
      setConfirmItem(null);
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return <Skeleton className="h-96 w-full" />;

  const ownedItems = items.filter((i) => owned.includes(i.id));
  const shopItems = items;

  // Group by category
  const groupByCategory = (list: WardrobeItem[]) => {
    const map = new Map<string, WardrobeItem[]>();
    for (const it of list) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category)!.push(it);
    }
    return map;
  };

  // Convert equipped item IDs to variant strings for the avatar renderer
  const equippedVariants: EquippedItems = {};
  for (const [layer, itemId] of Object.entries(equipped)) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      (equippedVariants as any)[layer] = item.variant;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* ── Header ──────────────────────────────────── */}
      <div className="bg-primary px-6 pt-8 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            My Wardrobe
          </h1>
          <button onClick={onClose} className="tap-target p-2 rounded-full bg-white/10 text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {balance !== null && (
          <div className="text-sm text-white/60 mt-1">
            Balance: <span className="cc-amount">₦{balance.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* ── Live avatar preview ─────────────────── */}
        <div className="flex justify-center py-2">
          <div className="rounded-2xl bg-card border border-border p-3">
            {avatarConfig ? (
              <AvatarRenderer
                config={avatarConfig}
                equipped={equippedVariants}
                hairStage="Fresh"
                size="small"
              />
            ) : (
              <div className="w-20 h-32 rounded-xl bg-muted grid place-items-center text-[10px] text-muted-foreground">
                Set your look first
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────── */}
        <Tabs defaultValue="owned">
          <TabsList className="w-full">
            <TabsTrigger value="owned" className="flex-1">Owned ({ownedItems.length})</TabsTrigger>
            <TabsTrigger value="shop" className="flex-1">Shop</TabsTrigger>
          </TabsList>

          {/* ── Owned tab ────────────────────────────── */}
          <TabsContent value="owned" className="space-y-3 mt-2">
            {ownedItems.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                You don't own any items yet. Visit the Shop tab to buy some drip.
              </div>
            ) : (
              Array.from(groupByCategory(ownedItems).entries()).map(([cat, list]) => (
                <div key={cat} className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {list.map((item) => {
                      const isEquipped = equipped[item.category] === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleEquip(item.id)}
                          disabled={busyId === item.id}
                          className={cn(
                            'text-left p-3 rounded-xl border transition relative',
                            isEquipped
                              ? 'border-accent ring-2 ring-accent/40 bg-accent/5'
                              : 'border-border bg-card hover:border-primary/40',
                          )}
                        >
                          {isEquipped && (
                            <div className="absolute top-1 right-1">
                              <Check className="h-3 w-3 text-accent" />
                            </div>
                          )}
                          <div className="text-sm font-medium">{item.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {item.isDesigner && <Badge variant="outline" className="text-[9px] mr-1">Designer</Badge>}
                            {isEquipped ? 'Equipped' : 'Tap to equip'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* ── Shop tab ─────────────────────────────── */}
          <TabsContent value="shop" className="space-y-3 mt-2">
            {Array.from(groupByCategory(shopItems).entries()).map(([cat, list]) => (
              <div key={cat} className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {CATEGORY_LABELS[cat] ?? cat}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {list.map((item) => {
                    const isOwned = owned.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'p-3 rounded-xl border',
                          isOwned ? 'border-emerald-400/30 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-border bg-card',
                        )}
                      >
                        <div className="text-sm font-medium">{item.name}</div>
                        {item.isDesigner && (
                          <Badge variant="outline" className="text-[9px] mt-0.5">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Designer
                          </Badge>
                        )}
                        {item.description && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{item.description}</div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          {isOwned ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600">
                              <Check className="h-2.5 w-2.5 mr-0.5" /> Owned
                            </Badge>
                          ) : (
                            <>
                              <span className="cc-amount text-sm">₦{item.price.toLocaleString()}</span>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs"
                                disabled={busyId === item.id}
                                onClick={() => setConfirmItem(item)}
                              >
                                <ShoppingBag className="h-3 w-3 mr-1" /> Buy
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Buy confirm sheet ─────────────────────────── */}
      {confirmItem && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={() => setConfirmItem(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">Buy {confirmItem.name}?</CardTitle>
              <CardDescription className="text-xs">
                {confirmItem.description}
                {confirmItem.isDesigner && ' Designer item.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Price</span>
                <span className="cc-amount text-lg">₦{confirmItem.price.toLocaleString()}</span>
              </div>
              {balance !== null && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>After purchase</span>
                  <span className={balance < confirmItem.price ? 'text-destructive' : ''}>
                    ₦{(balance - confirmItem.price).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmItem(null)}>Cancel</Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  disabled={busyId === confirmItem.id || (balance !== null && balance < confirmItem.price)}
                  onClick={() => handleBuy(confirmItem)}
                >
                  {busyId === confirmItem.id ? 'Buying…' : 'Confirm'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
