/**
 * HomeScreen v2 — game HUD layout, not a dashboard.
 *
 * Layout (top to bottom, single scroll column):
 *
 *  1. Hero band        — greeting + day/time + presence state
 *  2. Next Up strip    — ONE obligation, colour-coded urgency
 *  3. Stats row        — Wallet · Hair · Discipline (three pills)
 *  4. Goals band       — three goal cards, horizontal scroll on mobile
 *  5. Today's loop     — compact timeline, current block highlighted
 *  6. Announcements    — card list, pinned first
 *
 * Key visual rules:
 *  - No "Card" wrapper titles ("Wallet", "Status"). The data speaks.
 *  - Bold numbers, small labels underneath.
 *  - Colour carries meaning: green = good, gold = earning, red = urgent.
 *  - "Wetin you go do?" energy throughout.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sun, Moon, Scissors, Church, BookOpen, Coffee,
  Store, Lock, Target, Bell, AlertTriangle,
  CheckCircle2, Circle, Clock, Zap, MapPin,
} from 'lucide-react';

// ── Types (matching /api/home response) ─────────────────────────────────
type Hair = { stage: 'Fresh' | 'Neat' | 'Growing' | 'Overdue' | 'Violation'; daysSinceCut: number; daysUntilNextStage: number };
type Goal = { userGoalId: string; title: string; path: string | null; status: string; template: { reward: number } | null };
type LoopBlock = { time: string; label: string; kind: string; description: string; isCurrent: boolean; isPast: boolean; minutesUntil: number };
type NextObligation = { kind: string; label: string; detail: string; cta: string; time?: string; minutesUntil?: number; urgent: boolean };
type Wallet = { balance: number; earnedToday: number; dailyEarningCap: number };
type Announcement = { id: string; title: string; body: string | null; category: string; isPinned: boolean };

type HomeResponse = {
  ok: boolean;
  message?: string;
  greeting: string;
  dayName: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  user: { displayName: string | null; username: string | null; department: { name: string } | null; level: number | null };
  nextObligation: NextObligation;
  classAlert: { minutesUntilStart: number; class: { courseCode: string; startTime: string; venue: { name: string | null } | null } | null } | null;
  goals: Goal[];
  wallet: Wallet;
  hair: Hair;
  discipline: { tier: string | null; count: number };
  dailyLoop: LoopBlock[];
  announcements: Announcement[];
};

type Props = {
  /** Called whenever the wallet balance changes — lets AppShell update its status bar */
  onBalanceChange?: (balance: number) => void;
};

// ── Component ────────────────────────────────────────────────────────────
export function HomeScreenV2({ onBalanceChange }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<HomeResponse | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date());
  const prevBalance = useRef<number | null>(null);

  // Second-by-second clock for the hero
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load home data
  const load = useCallback(() => {
    let cancelled = false;
    fetch('/api/home', { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 401 && retryTick === 0) {
          setTimeout(() => { if (!cancelled) setRetryTick(1); }, 600);
          return null;
        }
        return r.json() as Promise<HomeResponse>;
      })
      .then((d) => {
        if (!d || cancelled) return;
        setData(d);
        if (d.ok && onBalanceChange && d.wallet.balance !== prevBalance.current) {
          prevBalance.current = d.wallet.balance;
          onBalanceChange(d.wallet.balance);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [retryTick, onBalanceChange]);

  useEffect(() => { return load(); }, [load]);

  const completeGoal = async (userGoalId: string) => {
    setCompletingId(userGoalId);
    try {
      const res = await fetch(`/api/goals/${userGoalId}/complete`, { method: 'POST' });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'E no work', description: d.message ?? 'Try again', variant: 'destructive' });
        return;
      }
      toast({
        title: d.capped ? '✓ Done (cap reached)' : '✓ Done!',
        description: d.capped
          ? 'You hit your daily cap. Come back tomorrow.'
          : `+${d.reward} CC  ·  +10 ${d.path ?? 'XP'}`,
      });
      load();
    } finally {
      setCompletingId(null);
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-28 rounded-2xl bg-muted" />
        <div className="h-16 rounded-2xl bg-muted" />
        <div className="h-12 rounded-full bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!data.ok) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {data.message ?? 'Could not load home screen.'}
      </div>
    );
  }

  const name = data.user.displayName ?? data.user.username ?? 'student';
  const timeStr = `${String(clock.getHours()).padStart(2,'0')}:${String(clock.getMinutes()).padStart(2,'0')}:${String(clock.getSeconds()).padStart(2,'0')}`;
  const isNight = data.timeOfDay === 'night';
  const earnedPct = data.wallet.dailyEarningCap > 0
    ? Math.min(100, Math.round(data.wallet.earnedToday / data.wallet.dailyEarningCap * 100))
    : 0;
  const completedGoals = data.goals.filter(g => g.status === 'completed').length;

  return (
    <div className="flex flex-col gap-3 pb-4">

      {/* ══ 1. HERO ════════════════════════════════════════════════════ */}
      <section
        className={cn(
          'relative overflow-hidden px-5 pt-5 pb-6',
          'bg-gradient-to-br',
          isNight
            ? 'from-[oklch(0.18_0.04_230)] to-[oklch(0.13_0.02_230)]'
            : 'from-primary/90 to-[oklch(0.25_0.08_145)]',
        )}
      >
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-4 w-20 h-20 rounded-full bg-white/5 translate-y-1/2 pointer-events-none" />

        <div className="relative flex items-start justify-between gap-2">
          {/* Left: greeting */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-white/60 text-[11px] uppercase tracking-widest">
              {isNight ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              <span>{data.timeOfDay} · {data.dayName}</span>
            </div>
            <h1
              className="text-2xl font-bold text-white leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {data.greeting},<br />{name}.
            </h1>
            <p className="text-white/60 text-xs">
              {data.user.department
                ? `${data.user.department.name} · ${data.user.level ?? '—'} level`
                : 'No department yet'}
            </p>
          </div>

          {/* Right: live clock */}
          <div className="text-right shrink-0">
            <div
              className="font-mono text-3xl font-bold tabular-nums text-white"
            >
              {timeStr}
            </div>
            <div className="text-[10px] text-white/50 mt-0.5">WAT</div>
          </div>
        </div>
      </section>

      {/* ══ 2. CLASS ALERT (urgent, full-width, only when close) ══════ */}
      {data.classAlert?.class && (
        <section className="mx-4">
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-destructive">
                {data.classAlert.class.courseCode} in {data.classAlert.minutesUntilStart} min
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {data.classAlert.class.startTime} · {data.classAlert.class.venue?.name ?? 'TBA'}
              </div>
            </div>
            <Button size="sm" variant="destructive" className="shrink-0">Scan QR</Button>
          </div>
        </section>
      )}

      {/* ══ 3. NEXT UP ═════════════════════════════════════════════════ */}
      <section className="mx-4">
        <ObligationBand obligation={data.nextObligation} />
      </section>

      {/* ══ 4. STATS ROW ══════════════════════════════════════════════ */}
      <section className="mx-4">
        <div className="grid grid-cols-3 gap-2">
          {/* Wallet */}
          <StatPill label="Wallet" urgent={earnedPct >= 100}>
            <span className="cc-amount text-xl">{data.wallet.balance.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {data.wallet.dailyEarningCap - data.wallet.earnedToday > 0
                ? `+${data.wallet.dailyEarningCap - data.wallet.earnedToday} left`
                : 'Cap hit'}
            </span>
            {/* Earning bar */}
            <div className="w-full h-1 rounded-full bg-border mt-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--cc-gold)] transition-all duration-500"
                style={{ width: `${earnedPct}%` }}
              />
            </div>
          </StatPill>

          {/* Hair */}
          <StatPill label="Hair" urgent={data.hair.stage === 'Overdue' || data.hair.stage === 'Violation'}>
            <HairBadge stage={data.hair.stage} />
            <span className="text-[10px] text-muted-foreground mt-1">
              {data.hair.daysSinceCut}d ago
            </span>
          </StatPill>

          {/* Discipline */}
          <StatPill label="Conduct" urgent={!!data.discipline.tier}>
            {data.discipline.tier ? (
              <>
                <span className="text-base font-bold text-destructive">{data.discipline.tier}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {data.discipline.count}× mark
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-[10px] text-primary mt-0.5 font-medium">Clean</span>
              </>
            )}
          </StatPill>
        </div>
      </section>

      {/* ══ 5. GOALS ══════════════════════════════════════════════════ */}
      <section className="mx-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-bold flex items-center gap-1.5"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Target className="h-4 w-4" />
            Wetin you go do today?
          </h2>
          <span className="text-xs text-muted-foreground">{completedGoals}/{data.goals.length}</span>
        </div>

        {/* Horizontal scroll on narrow screens */}
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory -mx-4 px-4">
          {data.goals.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No goals yet — reload to get today's set.</p>
          )}
          {data.goals.map((g) => (
            <GoalCard
              key={g.userGoalId}
              goal={g}
              onComplete={() => completeGoal(g.userGoalId)}
              busy={completingId === g.userGoalId}
            />
          ))}
        </div>
      </section>

      {/* ══ 6. TODAY'S LOOP ══════════════════════════════════════════ */}
      <section className="mx-4 space-y-2">
        <h2
          className="text-sm font-bold flex items-center gap-1.5"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <Clock className="h-4 w-4" />
          Today's loop
        </h2>
        <div
          className="rounded-2xl border border-border bg-card overflow-hidden"
        >
          {data.dailyLoop.map((block, i) => (
            <LoopRow key={i} block={block} isLast={i === data.dailyLoop.length - 1} />
          ))}
        </div>
      </section>

      {/* ══ 7. ANNOUNCEMENTS ══════════════════════════════════════════ */}
      {data.announcements.length > 0 && (
        <section className="mx-4 space-y-2">
          <h2
            className="text-sm font-bold flex items-center gap-1.5"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Bell className="h-4 w-4" />
            Announcements
          </h2>
          <ul className="space-y-2">
            {data.announcements.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'rounded-2xl border p-4 text-sm',
                  a.isPinned
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-border bg-card',
                )}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {a.isPinned && <Badge variant="secondary" className="text-[10px]">Pinned</Badge>}
                  <Badge variant="outline" className="text-[10px] capitalize">{a.category}</Badge>
                </div>
                <div className="font-semibold">{a.title}</div>
                {a.body && <div className="text-xs text-muted-foreground mt-1">{a.body}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function ObligationBand({ obligation }: { obligation: NextObligation }) {
  const urgent = obligation.urgent;
  return (
    <div
      className={cn(
        'rounded-2xl p-4 flex items-center gap-3 border',
        urgent
          ? 'bg-destructive/10 border-destructive/30'
          : 'bg-primary/10 border-primary/20',
      )}
    >
      <span className="shrink-0">{blockIcon(obligation.kind, 'h-6 w-6')}</span>
      <div className="flex-1 min-w-0">
        <div className={cn('font-bold text-base leading-tight', urgent ? 'text-destructive' : 'text-primary')}>
          {obligation.label}
          {urgent && (
            <span className="mass-urgent ml-2 text-[11px] font-black uppercase tracking-wider">
              ● urgent
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{obligation.detail}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {obligation.time && (
          <span className="font-mono text-xs text-muted-foreground">{obligation.time}</span>
        )}
        <Button
          size="sm"
          variant={urgent ? 'destructive' : 'default'}
          className="h-8 text-xs rounded-xl"
        >
          {obligation.cta}
        </Button>
      </div>
    </div>
  );
}

function StatPill({
  label,
  urgent,
  children,
}: {
  label: string;
  urgent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-3 flex flex-col items-center text-center',
        urgent
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-border bg-card',
      )}
    >
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</span>
      {children}
    </div>
  );
}

function HairBadge({ stage }: { stage: Hair['stage'] }) {
  const map: Record<Hair['stage'], string> = {
    Fresh:     'bg-primary text-white',
    Neat:      'bg-primary/80 text-white',
    Growing:   'bg-amber-400 text-black',
    Overdue:   'bg-orange-500 text-white',
    Violation: 'bg-destructive text-white',
  };
  return (
    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', map[stage])}>
      {stage}
    </span>
  );
}

function GoalCard({
  goal,
  onComplete,
  busy,
}: {
  goal: Goal;
  onComplete: () => void;
  busy: boolean;
}) {
  const done = goal.status === 'completed';
  const reward = goal.template?.reward ?? 0;
  const pathVars: Record<string, string> = {
    Scholar:  'var(--chart-scholar)',
    Social:   'var(--chart-social)',
    Faith:    'var(--chart-faith)',
    Athlete:  'var(--chart-athlete)',
    Creative: 'var(--chart-creative)',
    Leader:   'var(--chart-leader)',
  };
  const dotColor = goal.path ? (pathVars[goal.path] ?? 'var(--primary)') : 'var(--primary)';

  return (
    <div
      className={cn(
        'snap-start shrink-0 w-44 rounded-2xl border p-4 flex flex-col gap-2 transition',
        done ? 'opacity-50 bg-muted/30 border-border' : 'bg-card border-border hover:border-primary/40',
      )}
    >
      {/* Path colour strip */}
      <div className="flex items-center justify-between">
        <span
          className="h-2 w-10 rounded-full"
          style={{ background: dotColor }}
        />
        {done
          ? <CheckCircle2 className="h-4 w-4 text-primary" />
          : <Circle className="h-4 w-4 text-muted-foreground" />
        }
      </div>

      <div className="text-sm font-semibold leading-snug flex-1">{goal.title}</div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{goal.path ?? 'General'}</span>
        <span className="cc-amount">+{reward}</span>
      </div>

      <button
        className={cn(
          'tap-target w-full h-8 rounded-xl text-xs font-semibold transition',
          done
            ? 'bg-muted text-muted-foreground cursor-default'
            : 'bg-primary text-primary-foreground active:opacity-80',
        )}
        disabled={done || busy}
        onClick={onComplete}
      >
        {done ? 'Done' : busy ? 'Marking…' : 'Mark done'}
      </button>
    </div>
  );
}

function LoopRow({ block, isLast }: { block: LoopBlock; isLast: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
        block.isCurrent
          ? 'bg-primary/10 border-l-2 border-primary'
          : block.isPast
            ? 'opacity-40'
            : '',
        !isLast && 'border-b border-border/60',
      )}
    >
      <span className="font-mono text-[11px] text-muted-foreground w-10 text-right tabular-nums shrink-0">
        {block.time}
      </span>
      <span className="shrink-0 text-muted-foreground">
        {blockIcon(block.kind, 'h-4 w-4')}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">
          {block.label}
          {block.isCurrent && (
            <span className="ml-2 text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full align-middle font-bold uppercase tracking-wide">
              now
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{block.description}</div>
      </div>
      {!block.isPast && !block.isCurrent && (
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {fmtDuration(block.minutesUntil)}
        </span>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function blockIcon(kind: string, cls = 'h-5 w-5') {
  const map: Record<string, React.ReactNode> = {
    wake:      <Sun className={cls} />,
    groom:     <Scissors className={cls} />,
    breakfast: <Coffee className={cls} />,
    class:     <BookOpen className={cls} />,
    mass:      <Church className={cls} />,
    lunch:     <Coffee className={cls} />,
    free:      <MapPin className={cls} />,
    hustle:    <Store className={cls} />,
    lock:      <Lock className={cls} />,
    night:     <Moon className={cls} />,
  };
  return map[kind] ?? <Zap className={cls} />;
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}
