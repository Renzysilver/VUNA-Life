/**
 * ActivitiesSheet + WhoIsHereSheet — replaces the placeholder bottom
 * sheet in map-screen.tsx with real activity actions + a "who is here"
 * list (privacy-filtered).
 *
 * Layout:
 *   - Building name + status chips (top)
 *   - "Who is here" section: N people / list of silhouettes
 *   - "Activities" section: action buttons per building type
 */

'use client';

import { useEffect, useState } from 'react';
import { X, MapPin, Users, BookOpen, UtensilsCrossed, Church, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

type BuildingInfo = {
  id: string | number;
  name: string | null;
  category: string;
  status: string;
  gender_attr: string | null;
};

type PresenceRow = {
  userId: string;
  username: string | null;
  displayName: string | null;
  department: { code: string; name: string } | null;
  isFriend: boolean;
  state: string;
  since: string;
};

type Activity = {
  type: 'study' | 'eat' | 'checkin';
  label: string;
  description: string;
  rewardCC: number;
  xpPath: string;
  xpAmount: number;
};

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  study: <BookOpen className="h-4 w-4" />,
  eat: <UtensilsCrossed className="h-4 w-4" />,
  checkin: <Church className="h-4 w-4" />,
};

// Mirror of the server-side activitiesForBuilding function — used to
// render the buttons client-side without an extra round-trip. The
// server-side function is the source of truth.
function activitiesForBuilding(b: BuildingInfo): Activity[] {
  const out: Activity[] = [];
  const nameLower = (b.name ?? '').toLowerCase();
  if (b.id === '8' || b.id === 8 || nameLower.includes('library')) {
    out.push({
      type: 'study',
      label: 'Study for 30 minutes',
      description: '+25 CC, +10 Scholar XP',
      rewardCC: 25,
      xpPath: 'Scholar',
      xpAmount: 10,
    });
  }
  if (b.id === '6' || b.id === 6 || nameLower.includes('canteen') || nameLower.includes('hall')) {
    out.push({
      type: 'eat',
      label: 'Eat at the canteen',
      description: '+15 CC, +10 Social XP',
      rewardCC: 15,
      xpPath: 'Social',
      xpAmount: 10,
    });
  }
  if (b.id === 'chapel' || nameLower.includes('chapel') || nameLower.includes('chaplaincy')) {
    out.push({
      type: 'checkin',
      label: 'Check in at mass',
      description: '+50 CC, +10 Faith XP',
      rewardCC: 50,
      xpPath: 'Faith',
      xpAmount: 10,
    });
  }
  if (b.category === 'academic' && out.length === 0) {
    out.push({
      type: 'checkin',
      label: 'Mark yourself as studying here',
      description: 'Just updates your presence — no reward',
      rewardCC: 0,
      xpPath: 'Scholar',
      xpAmount: 0,
    });
  }
  if (b.category === 'sports') {
    out.push({
      type: 'checkin',
      label: 'Train for 30 minutes',
      description: '+20 CC, +10 Athlete XP',
      rewardCC: 20,
      xpPath: 'Athlete',
      xpAmount: 10,
    });
  }
  return out;
}

export function ActivitiesSheet({
  building,
  onClose,
  onHelloSent,
}: {
  building: BuildingInfo;
  onClose: () => void;
  onHelloSent?: (targetUserId: string) => void;
}) {
  const { toast } = useToast();
  const [presence, setPresence] = useState<PresenceRow[] | null>(null);
  const [busyActivity, setBusyActivity] = useState<string | null>(null);
  const [helloingId, setHelloingId] = useState<string | null>(null);

  // Poll presence every 5 seconds (DEMO_MODE fallback for Supabase Realtime).
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/presence?buildingId=${encodeURIComponent(String(building.id))}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.ok) setPresence(d.presence);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [building.id]);

  const activities = activitiesForBuilding(building);
  const displayName = building.name ?? 'Unnamed building';
  const isUnnamed = !building.name;

  const handleActivity = async (a: Activity) => {
    setBusyActivity(a.type);
    try {
      const res = await fetch(`/api/activities/${encodeURIComponent(String(building.id))}/do`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activityType: a.type }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not do activity', description: d.message, variant: 'destructive' });
        return;
      }
      toast({
        title: '✓ Done',
        description: a.rewardCC > 0
          ? `+${d.rewardCC} CC · +${d.xpAmount} ${d.xpPath} XP · ${d.newBalance} CC left`
          : `Presence updated · ${d.newBalance} CC`,
      });
    } finally {
      setBusyActivity(null);
    }
  };

  const handleHello = async (targetUserId: string) => {
    setHelloingId(targetUserId);
    try {
      const res = await fetch('/api/hellos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toUserId: targetUserId, buildingId: String(building.id) }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not send hello', description: d.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Hello sent', description: 'You can send 3 at a time. Wait for a response.' });
      onHelloSent?.(targetUserId);
    } finally {
      setHelloingId(null);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 hud-card rounded-t-3xl p-5 max-h-[80vh] flex flex-col">
      <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-1 min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {displayName}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full capitalize">
              {building.category}
            </span>
            {building.gender_attr && (
              <span className="text-[11px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full capitalize">
                {building.gender_attr}
              </span>
            )}
            {building.status !== 'USER_CONFIRMED' && (
              <span className="text-[11px] bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full">
                {building.status.replace(/_/g, ' ').toLowerCase()}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="tap-target p-1.5 rounded-full bg-white/10 text-white/70" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-2">
          {/* ── Who is here ──────────────────────────────── */}
          <div className="space-y-2">
            <div className="text-[11px] text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Who is here
            </div>
            {!presence ? (
              <div className="text-xs text-white/40">Loading…</div>
            ) : presence.length === 0 ? (
              <div className="text-xs text-white/40 italic">No one here right now.</div>
            ) : (
              <ul className="space-y-1">
                {presence.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Avatar silhouette */}
                      <div className="h-7 w-7 rounded-full bg-white/20 grid place-items-center text-[10px] font-bold text-white/70">
                        ?
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">
                          {p.isFriend
                            ? (p.displayName ?? p.username ?? 'Friend')
                            : (p.department ? `Someone from ${p.department.code}` : 'Someone')
                          }
                        </div>
                        {p.isFriend && p.department && (
                          <div className="text-[10px] text-white/40">{p.department.name}</div>
                        )}
                      </div>
                    </div>
                    {!p.isFriend && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 border-white/20 bg-white/5 text-white"
                        disabled={helloingId === p.userId}
                        onClick={() => handleHello(p.userId)}
                      >
                        {helloingId === p.userId ? '…' : 'Hello'}
                      </Button>
                    )}
                    {p.isFriend && (
                      <Badge variant="outline" className="text-[9px] border-emerald-400/40 text-emerald-300 bg-emerald-400/10">
                        Connected
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Activities ──────────────────────────────── */}
          <div className="space-y-2">
            <div className="text-[11px] text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Activities
            </div>
            {isUnnamed ? (
              <div className="text-xs text-white/40 italic">
                This building hasn't been named yet. Activities unlock once it's confirmed.
              </div>
            ) : activities.length === 0 ? (
              <div className="text-xs text-white/40 italic">
                No activities available at this building.
              </div>
            ) : (
              <ul className="space-y-1">
                {activities.map((a) => (
                  <li
                    key={a.type}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-white/70">{ACTIVITY_ICON[a.type]}</span>
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{a.label}</div>
                        <div className="text-[10px] text-white/40">{a.description}</div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={busyActivity === a.type}
                      onClick={() => handleActivity(a)}
                    >
                      {busyActivity === a.type ? '…' : 'Do'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
