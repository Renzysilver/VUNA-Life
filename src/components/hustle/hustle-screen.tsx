/**
 * HustleScreen — evening hustle (vendor consignment + price slider).
 *
 * Available 18:00–22:00 WAT only (server time). Shows the consignment
 * list, lets the student set a selling price ±20% of suggested, and
 * simulates the sale. Max 3 attempts per evening.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Store, Clock, TrendingUp, TrendingDown } from 'lucide-react';

type ConsignmentItem = {
  code: string;
  name: string;
  purchaseCost: number;
  suggestedPrice: number;
};

type HustleStatus = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  minutesUntilOpen: number | null;
  minutesUntilClose: number | null;
  attemptsToday: number;
  maxAttempts: number;
  remaining: number;
};

export function HustleScreen({ onBalanceChange }: { onBalanceChange?: (b: number) => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<HustleStatus | null>(null);
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/hustle/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok) {
          setStatus(d.status);
          setItems(d.items);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reload(); }, [reload]);

  const handleSelect = (item: ConsignmentItem) => {
    setSelectedCode(item.code);
    setSalePrice(item.suggestedPrice);
  };

  const handleHustle = async () => {
    if (!selectedCode) return;
    setBusy(true);
    try {
      const res = await fetch('/api/hustle/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemCode: selectedCode, salePrice }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Hustle failed', description: d.message, variant: 'destructive' });
        return;
      }
      toast({
        title: d.sold ? '✓ Sold!' : '✗ No buyer',
        description: d.sold
          ? `+${d.revenue} CC revenue · ${d.netProfit >= 0 ? '+' : ''}${d.netProfit} CC net · ${d.newBalance} CC left`
          : `Stock wasted — try a lower price next time.`,
      });
      onBalanceChange?.(d.newBalance);
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const selectedItem = items.find((i) => i.code === selectedCode);
  const minPrice = selectedItem ? Math.round(selectedItem.suggestedPrice * 0.8) : 0;
  const maxPrice = selectedItem ? Math.round(selectedItem.suggestedPrice * 1.2) : 0;

  return (
    <div className="p-4 space-y-4">
      {/* ── Window status ──────────────────────────────── */}
      <Card className={cn('border', status.open ? 'border-primary/20 bg-primary/5' : 'border-muted')}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">Evening hustle</div>
              <div className="text-[11px] text-muted-foreground">
                {status.open
                  ? `${status.opensAt}–${status.closesAt} · closes in ${status.minutesUntilClose} min`
                  : `Opens at ${status.opensAt} (in ${status.minutesUntilOpen} min)`}
              </div>
            </div>
          </div>
          <Badge variant={status.open ? 'default' : 'secondary'} className="text-[10px]">
            {status.attemptsToday}/{status.maxAttempts}
          </Badge>
        </CardContent>
      </Card>

      {!status.open ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Hustle window is {status.opensAt}–{status.closesAt} WAT (server time).
            <br />Come back this evening.
          </CardContent>
        </Card>
      ) : status.remaining === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            You've used all {status.maxAttempts} attempts tonight. Try again tomorrow.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Consignment list ───────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Vendor consignment</CardTitle>
              <CardDescription className="text-xs">
                Pick stock on consignment. You pay the cost up front; if you sell, you keep the revenue. If not, stock is wasted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {items.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'text-left p-3 rounded-xl border transition',
                      selectedCode === item.code
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/40',
                    )}
                  >
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Cost: <span className="cc-amount">{item.purchaseCost}</span> · Suggested: <span className="cc-amount">{item.suggestedPrice}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Profit if sold: +{item.suggestedPrice - item.purchaseCost} CC
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Price slider ───────────────────────────── */}
          {selectedItem && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Set your price</span>
                  <span className="cc-amount text-lg">{salePrice} CC</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Higher price → slower sales. Lower price → fast but thin margin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Slider
                  value={[salePrice]}
                  onValueChange={(v: number[]) => setSalePrice(v[0])}
                  min={minPrice}
                  max={maxPrice}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{minPrice} CC (fast)</span>
                  <span>{selectedItem.suggestedPrice} CC (suggested)</span>
                  <span>{maxPrice} CC (slow)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {salePrice > selectedItem.suggestedPrice ? (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  ) : salePrice < selectedItem.suggestedPrice ? (
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                  ) : null}
                  <span className="text-muted-foreground">
                    {salePrice > selectedItem.suggestedPrice
                      ? 'Higher than suggested — slower sales.'
                      : salePrice < selectedItem.suggestedPrice
                        ? 'Lower than suggested — fast sales.'
                        : 'At suggested price.'}
                    {' '}Net if sold: +{salePrice - selectedItem.purchaseCost} CC.
                  </span>
                </div>
                <Button className="w-full" disabled={busy} onClick={handleHustle}>
                  {busy ? 'Selling…' : `Hustle ${selectedItem.name} at ${salePrice} CC`}
                </Button>
                <div className="text-[10px] text-muted-foreground text-center">
                  You pay {selectedItem.purchaseCost} CC for stock. If sold, you get {salePrice} CC back.
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
