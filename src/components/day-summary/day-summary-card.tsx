/**
 * DaySummaryCard — the shareable end-of-day card.
 *
 * Generates today's summary on demand (POST /api/day-summary/today) and
 * shows the share token + a visual card with:
 *   - Date + display name + department
 *   - ₦ earned + ₦ spent + end-of-day balance
 *   - Classes attended, mass attended, goals completed
 *   - Hair stage + discipline tier + missed-mass warnings
 *   - Share URL (copyable)
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CalendarDays, Share2, CheckCircle2, Church, Target, Scissors, Shield, Copy } from 'lucide-react';

type DayPayload = {
  date: string;
  displayName: string | null;
  username: string | null;
  department: { code: string; name: string } | null;
  level: number | null;
  ccEarnedToday: number;
  ccSpentToday: number;
  balanceEndOfDay: number;
  topEarnReason: string | null;
  topSpendReason: string | null;
  classesCheckedIn: number;
  massCheckedIn: boolean;
  goalsCompleted: number;
  goalsTotal: number;
  hairStage: string | null;
  disciplineTier: string | null;
  missedMassWarnings: number;
};

export function DaySummaryCard() {
  const { toast } = useToast();
  const [payload, setPayload] = useState<DayPayload | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/day-summary/today', { method: 'POST' });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not generate', description: d.message, variant: 'destructive' });
        return;
      }
      setPayload(d.payload);
      setShareToken(d.shareToken);
      toast({ title: 'Day summary ready', description: 'Share the link with your friends' });
    } finally {
      setBusy(false);
    }
  };

  const copyShareUrl = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/api/day-summary/${shareToken}`;
    navigator.clipboard?.writeText(url);
    toast({ title: 'Copied share URL' });
  };

  if (!payload) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-sm text-muted-foreground">
            Wrap up your day with a shareable summary card.
          </div>
          <Button size="sm" disabled={busy} onClick={generate} className="w-full">
            <CalendarDays className="h-4 w-4 mr-1.5" />
            {busy ? 'Generating…' : 'Generate today\'s card'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-accent/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Day summary · {payload.date}
          </span>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={copyShareUrl}>
            <Share2 className="h-3 w-3 mr-1" /> Share
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Identity row */}
        <div>
          <div className="font-bold">{payload.displayName ?? payload.username ?? 'Student'}</div>
          {payload.department && (
            <div className="text-xs text-muted-foreground">
              {payload.department.name} ({payload.department.code}) · {payload.level ?? '—'} level
            </div>
          )}
        </div>

        {/* Money row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Earned</div>
            <div className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">+{payload.ccEarnedToday}</div>
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Spent</div>
            <div className="font-mono text-destructive font-bold">−{payload.ccSpentToday}</div>
          </div>
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Balance</div>
            <div className="cc-amount font-bold">{payload.balanceEndOfDay}</div>
          </div>
        </div>

        {/* Activity row */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-card">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-bold">{payload.classesCheckedIn}</span>
            <span className="text-[10px] text-muted-foreground">classes</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-card">
            <Church className={cn('h-4 w-4', payload.massCheckedIn ? 'text-primary' : 'text-muted-foreground/50')} />
            <span className="font-bold">{payload.massCheckedIn ? 'Yes' : 'No'}</span>
            <span className="text-[10px] text-muted-foreground">mass</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-card">
            <Target className="h-4 w-4 text-primary" />
            <span className="font-bold">{payload.goalsCompleted}/{payload.goalsTotal}</span>
            <span className="text-[10px] text-muted-foreground">goals</span>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Scissors className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Hair:</span>
            <Badge variant="outline" className="text-[10px]">{payload.hairStage ?? '—'}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Discipline:</span>
            {payload.disciplineTier ? (
              <Badge variant="secondary" className="text-[10px]">{payload.disciplineTier}</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-primary">Clean</Badge>
            )}
            {payload.missedMassWarnings > 0 && (
              <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300">
                {payload.missedMassWarnings} mass warnings
              </Badge>
            )}
          </div>
        </div>

        {/* Share link */}
        {shareToken && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <code className="text-[10px] font-mono text-muted-foreground truncate flex-1">
              {typeof window !== 'undefined' ? `${window.location.origin}/api/day-summary/${shareToken}` : `/api/day-summary/${shareToken}`}
            </code>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={copyShareUrl}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
