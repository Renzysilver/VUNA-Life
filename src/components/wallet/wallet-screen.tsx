/**
 * WalletScreen — the real Wallet tab content (replaces the Phase 4 placeholder).
 *
 * Layout:
 *   1. Big balance display (gold, mono) + frozen banner if frozen
 *   2. Daily earning cap progress bar
 *   3. Recent ledger entries (last 30) — each row shows direction
 *      (in/out) + amount + reason + time
 *   4. Quick actions: "Buy food" → switches to the CanteenScreen
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Snowflake, ArrowDownLeft, ArrowUpRight, RefreshCw, ShoppingCart, Store } from 'lucide-react';

type WalletView = {
  userId: string;
  balance: number;
  earnedToday: number;
  dailyEarningCap: number;
  frozen: boolean;
  frozenReason: string | null;
  frozenAt: string | null;
};

type LedgerRow = {
  id: number;
  fromUser: string | null;
  toUser: string | null;
  amount: number;
  reason: string;
  metadata: any;
  createdAt: string;
};

type WalletResponse = {
  ok: boolean;
  wallet: WalletView;
  ledger: LedgerRow[];
};

export function WalletScreen({ onGoToCanteen, onGoToHustle }: { onGoToCanteen?: () => void; onGoToHustle?: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<WalletResponse | null>(null);
  const [hustleOpen, setHustleOpen] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/wallet', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: WalletResponse) => { if (!cancelled && d.ok) setData(d); })
      .catch(() => {});
    // Also check if the hustle window is open (18:00–22:00 server time).
    fetch('/api/hustle/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok && d.status?.open) setHustleOpen(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reload(); }, [reload]);

  if (!data) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const w = data.wallet;
  const earnedPct = w.dailyEarningCap > 0
    ? Math.min(100, Math.round((w.earnedToday / w.dailyEarningCap) * 100))
    : 0;

  return (
    <div className="p-4 space-y-4">
      {/* Balance + frozen */}
      <Card className={cn('border', w.frozen ? 'border-destructive/40 bg-destructive/5' : 'border-primary/20')}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Balance</div>
              <div className="cc-amount text-4xl tabular-nums">{w.balance.toLocaleString()}<span className="text-base ml-1">₦</span></div>
            </div>
            {w.frozen && (
              <Badge variant="destructive" className="text-[10px]">
                <Snowflake className="h-3 w-3 mr-1" /> Frozen
              </Badge>
            )}
          </div>

          {w.frozen && w.frozenReason && (
            <div className="text-xs text-destructive">{w.frozenReason}</div>
          )}

          {/* Daily earning cap progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Earned today</span>
              <span className="font-mono tabular-nums">{w.earnedToday}/{w.dailyEarningCap} ₦</span>
            </div>
            <div className="w-full h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--cc-gold)] transition-all duration-500"
                style={{ width: `${earnedPct}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {w.earnedToday >= w.dailyEarningCap
                ? 'Cap reached — try again tomorrow.'
                : `${w.dailyEarningCap - w.earnedToday} ₦ left to earn today.`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button variant="default" size="sm" className="flex-1" onClick={onGoToCanteen}>
          <ShoppingCart className="h-4 w-4 mr-1.5" /> Buy food
        </Button>
        {hustleOpen && (
          <Button variant="default" size="sm" className="flex-1 bg-accent text-accent-foreground" onClick={onGoToHustle}>
            <Store className="h-4 w-4 mr-1.5" /> Evening hustle
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => reload()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Recent ledger */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recent transactions</CardTitle>
          <CardDescription className="text-xs">
            Append-only ledger. Each row is server-side posted; the client can never set a balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.ledger.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No transactions yet.
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <ul className="space-y-1 pr-2">
                {data.ledger.map((r) => {
                  const isIn = r.toUser === w.userId;
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 p-2 rounded-md border border-border bg-card text-xs"
                    >
                      <span className={cn('shrink-0', isIn ? 'text-emerald-600' : 'text-destructive')}>
                        {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.reason.replace(/_/g, ' ')}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <span className={cn('font-mono tabular-nums', isIn ? 'text-emerald-600' : 'text-destructive')}>
                        {isIn ? '+' : '−'}{r.amount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
