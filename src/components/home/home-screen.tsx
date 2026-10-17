'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Sun, Moon, Clock, Wallet, Scissors, ShieldAlert, Bell, Target,
  CheckCircle2, Circle, MapPin, Coffee, BookOpen, Church, Store,
  Lock, Zap, AlertTriangle,
} from 'lucide-react';
import type { SessionInfo } from '@/app/page';
import type { DashboardData } from '@/components/student/student-dashboard';

type DailyLoopBlock = {
  time: string;
  label: string;
  kind: 'wake' | 'groom' | 'breakfast' | 'class' | 'mass' | 'lunch' | 'free' | 'hustle' | 'lock' | 'night';
  description: string;
  isCurrent: boolean;
  isPast: boolean;
  minutesUntil: number;
};

type NextObligation = {
  kind: string;
  label: string;
  detail: string;
  cta: string;
  time?: string;
  minutesUntil?: number;
  urgent: boolean;
};

type ClassAlert = {
  minutesUntilStart: number;
  class: {
    courseCode: string;
    courseTitle: string;
    startTime: string;
    endTime: string;
    venue: { pin: string; name: string | null; status: string } | null;
    inProgress: boolean;
    minutesUntilStart: number;
  } | null;
};

type Goal = {
  userGoalId: string;
  goalId: string;
  title: string;
  path: string | null;
  status: string;
  template: any;
};

type Wallet = {
  userId: string;
  balance: number;
  earnedToday: number;
  dailyEarningCap: number;
};

type Hair = {
  stage: 'Fresh' | 'Neat' | 'Growing' | 'Overdue' | 'Violation';
  lastCutAt: string;
  daysSinceCut: number;
  daysUntilNextStage: number;
  nextStage: string | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  isPinned: boolean;
};

type HomeResponse = {
  ok: boolean;
  message?: string;
  now: string;
  weekday: number;
  dayName: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  greeting: string;
  user: {
    id: string;
    email: string;
    emailDomain: string;
    username: string | null;
    displayName: string | null;
    role: string;
    department: { code: string; name: string; faculty: string | null } | null;
    level: number | null;
    isVerifiedStudent: boolean;
  };
  dailyLoop: DailyLoopBlock[];
  nextObligation: NextObligation;
  classAlert: ClassAlert | null;
  nextClass: any;
  goals: Goal[];
  wallet: Wallet;
  hair: Hair;
  discipline: { tier: string | null; count: number };
  announcements: Announcement[];
  todaysTimetable: any[];
};

export function HomeScreen({
  user: _user,
  initialData,
}: {
  user: SessionInfo;
  initialData: DashboardData | null;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<HomeResponse | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [now, setNow] = useState(new Date());
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Live clock — ticks every second so the time pressure feels real.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch home data. Retry once on 401 (cookie race through preview gateway).
  const load = useCallback(() => {
    let cancelled = false;
    fetch('/api/home', { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 401 && retryTick === 0) {
          setTimeout(() => {
            if (!cancelled) setRetryTick(1);
          }, 500);
          return null;
        }
        return (await r.json()) as HomeResponse;
      })
      .then((d) => {
        if (cancelled || !d) return;
        setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const completeGoal = async (userGoalId: string) => {
    setCompletingId(userGoalId);
    try {
      const res = await fetch(`/api/goals/${userGoalId}/complete`, { method: 'POST' });
      const d = await res.json();
      if (!d.ok) {
        toast({
          title: 'Could not complete goal',
          description: d.message ?? 'Try again',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: d.capped ? 'Goal done (cap reached)' : 'Goal done!',
        description: d.capped
          ? `Earned the daily cap. Try again tomorrow.`
          : `+${d.reward} CC, +10 ${d.path ?? 'XP'} XP`,
      });
      // Reload home data to show updated wallet + goal state.
      load();
    } finally {
      setCompletingId(null);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
        <div className="h-24 rounded-xl bg-muted animate-pulse" />
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (!data.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Home unavailable</CardTitle>
          <CardDescription>{data.message ?? 'Could not load home screen.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Greeting + time-of-day icon
  const PhaseIcon = data.timeOfDay === 'morning' ? Sun : data.timeOfDay === 'afternoon' ? Sun : data.timeOfDay === 'evening' ? Sun : Moon;
  const completedGoals = data.goals.filter((g) => g.status === 'completed').length;
  const earnedPct = data.wallet.dailyEarningCap > 0
    ? Math.min(100, Math.round((data.wallet.earnedToday / data.wallet.dailyEarningCap) * 100))
    : 0;

  return (
    <div className="space-y-5">
      {/* ---------- Hero: greeting + clock + day ---------- */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-accent/10">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <PhaseIcon className="h-3.5 w-3.5" />
                <span className="capitalize">{data.timeOfDay}</span>
                <span>·</span>
                <span>{data.dayName}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {data.greeting}, {data.user.displayName ?? data.user.username ?? 'student'}.
              </h1>
              <p className="text-sm text-muted-foreground">
                {data.user.department
                  ? `${data.user.department.name} · ${data.user.level ?? '—'} level`
                  : 'No department assigned yet'}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl sm:text-4xl tabular-nums font-bold text-primary">
                {fmtTime(now)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">server time · WAT</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Class alert banner (urgent, only when class is soon) ---------- */}
      {data.classAlert && data.classAlert.class && (
        <Card className="border-accent bg-accent/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-accent-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {data.classAlert.class.courseCode} starts in {data.classAlert.minutesUntilStart} min
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {data.classAlert.class.startTime} —{' '}
                {data.classAlert.class.venue?.name ?? 'venue TBA'}
              </div>
            </div>
            <Button size="sm" variant="default">Scan QR</Button>
          </CardContent>
        </Card>
      )}

      {/* ---------- Next obligation (hero card) ---------- */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Next up
          </CardTitle>
          <CardDescription className="sr-only">Your next obligation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="text-xl font-semibold flex items-center gap-2">
                {blockIcon(data.nextObligation.kind)}
                {data.nextObligation.label}
              </div>
              <div className="text-sm text-muted-foreground max-w-md">
                {data.nextObligation.detail}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.nextObligation.time && (
                <Badge variant="outline" className="font-mono">
                  <Clock className="h-3 w-3 mr-1" />
                  {data.nextObligation.time}
                </Badge>
              )}
              {data.nextObligation.urgent && (
                <Badge variant="destructive" className="text-[10px] animate-pulse">
                  Urgent
                </Badge>
              )}
              <Button size="sm" variant={data.nextObligation.urgent ? 'default' : 'outline'}>
                {data.nextObligation.cta}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Daily loop timeline ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" /> Today's loop
          </CardTitle>
          <CardDescription className="text-xs">
            Loop A — wake, class, mass rush, hustle, hostel lock. Marker shows where you are now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-64">
            <div className="space-y-1 pr-2">
              {data.dailyLoop.map((block, i) => (
                <DailyLoopRow key={i} block={block} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ---------- Two-column row: wallet + hair/discipline ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Wallet */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Wallet
              </span>
              <span className="text-lg font-bold tabular-nums">{data.wallet.balance} CC</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Earned today</span>
              <span className="font-mono tabular-nums">
                {data.wallet.earnedToday}/{data.wallet.dailyEarningCap} CC
              </span>
            </div>
            <Progress value={earnedPct} className="h-2" />
            <div className="text-[11px] text-muted-foreground">
              {data.wallet.earnedToday >= data.wallet.dailyEarningCap
                ? 'Cap reached for today — try again tomorrow.'
                : `${data.wallet.dailyEarningCap - data.wallet.earnedToday} CC left to earn today.`}
            </div>
          </CardContent>
        </Card>

        {/* Hair + discipline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scissors className="h-4 w-4" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hair</span>
              <div className="flex items-center gap-2">
                <Badge variant={hairVariant(data.hair.stage)} className="text-[10px]">
                  {data.hair.stage}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {data.hair.daysSinceCut}d since cut
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discipline</span>
              {data.discipline.tier ? (
                <Badge variant="secondary" className="text-[10px]">
                  {data.discipline.tier} · {data.discipline.count}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-primary">
                  Clean
                </Badge>
              )}
            </div>
            {(data.hair.stage === 'Overdue' || data.hair.stage === 'Violation') && (
              <div className="text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded p-2 flex items-center gap-1.5">
                <ShieldAlert className="h-3 w-3 text-amber-700 dark:text-amber-300 shrink-0" />
                <span>
                  Inspection risk. Get a haircut at the barber (150–250 CC) before you're stopped.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Goals (three cards) ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4" /> Today's goals
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {completedGoals}/{data.goals.length} done
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Wetin you go do today? Three things, refreshed daily.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.goals.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              No goals assigned. Reload the page to get today's set.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.goals.map((g) => (
                <GoalCard
                  key={g.userGoalId}
                  goal={g}
                  onComplete={() => completeGoal(g.userGoalId)}
                  busy={completingId === g.userGoalId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Announcements strip ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" /> Announcements
          </CardTitle>
          <CardDescription className="text-xs">
            School-posted. Pinned items stay at the top.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-64">
            <ul className="space-y-2 pr-2">
              {data.announcements.map((a) => (
                <li
                  key={a.id}
                  className={`p-3 rounded-md border text-sm ${
                    a.isPinned
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {a.isPinned && (
                      <Badge variant="secondary" className="text-[10px]">Pinned</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] capitalize">{a.category}</Badge>
                  </div>
                  <div className="font-medium text-sm">{a.title}</div>
                  {a.body && (
                    <div className="text-xs text-muted-foreground mt-1">{a.body}</div>
                  )}
                </li>
              ))}
              {data.announcements.length === 0 && (
                <li className="text-sm text-muted-foreground py-2">No active announcements.</li>
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function fmtTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function blockIcon(kind: string) {
  switch (kind) {
    case 'wake': return <Sun className="h-5 w-5 inline mr-2" />;
    case 'groom': return <Scissors className="h-5 w-5 inline mr-2" />;
    case 'breakfast': return <Coffee className="h-5 w-5 inline mr-2" />;
    case 'class': return <BookOpen className="h-5 w-5 inline mr-2" />;
    case 'mass': return <Church className="h-5 w-5 inline mr-2" />;
    case 'lunch': return <Coffee className="h-5 w-5 inline mr-2" />;
    case 'free': return <MapPin className="h-5 w-5 inline mr-2" />;
    case 'hustle': return <Store className="h-5 w-5 inline mr-2" />;
    case 'lock': return <Lock className="h-5 w-5 inline mr-2" />;
    case 'night': return <Moon className="h-5 w-5 inline mr-2" />;
    default: return null;
  }
}

function DailyLoopRow({ block }: { block: DailyLoopBlock }) {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-md text-sm ${
        block.isCurrent
          ? 'bg-primary/10 border border-primary/30'
          : block.isPast
            ? 'opacity-50'
            : ''
      }`}
    >
      <div className="text-xs font-mono tabular-nums w-12 text-right text-muted-foreground">
        {block.time}
      </div>
      <div className="shrink-0">{blockIcon(block.kind)}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">
          {block.label}
          {block.isCurrent && (
            <Badge variant="default" className="ml-2 text-[9px] py-0 h-4 align-middle">
              NOW
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {block.description}
        </div>
      </div>
      {!block.isPast && !block.isCurrent && (
        <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {fmtDuration(block.minutesUntil)}
        </div>
      )}
    </div>
  );
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function hairVariant(stage: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (stage) {
    case 'Fresh': return 'default';
    case 'Neat': return 'default';
    case 'Growing': return 'secondary';
    case 'Overdue': return 'outline';
    case 'Violation': return 'destructive';
    default: return 'secondary';
  }
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
  const isDone = goal.status === 'completed';
  const reward = goal.template?.reward ?? 0;
  const pathColor =
    goal.path === 'Scholar' ? 'bg-chart-1' :
    goal.path === 'Social' ? 'bg-chart-2' :
    goal.path === 'Faith' ? 'bg-chart-3' :
    goal.path === 'Athlete' ? 'bg-chart-4' :
    goal.path === 'Creative' ? 'bg-chart-5' :
    'bg-primary';

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition ${
        isDone ? 'opacity-60 bg-muted/30' : 'hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`h-1.5 w-10 rounded-full ${pathColor}`} />
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </div>
      <div className="text-sm font-medium leading-snug">
        {goal.title}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          {goal.path ? `${goal.path} path` : 'General'}
        </span>
        <Badge variant="outline" className="text-[10px]">+{reward} CC</Badge>
      </div>
      <Button
        size="sm"
        variant={isDone ? 'outline' : 'default'}
        className="w-full text-xs h-8"
        disabled={isDone || busy}
        onClick={onComplete}
      >
        {isDone ? 'Done' : busy ? 'Marking…' : 'Mark done'}
      </Button>
    </div>
  );
}
