/**
 * HellosScreen — incoming + outgoing hellos with accept/decline/block buttons.
 * Replaces the People tab's "Phase 5" placeholder (alongside ChatsScreen).
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
import { Check, X, Ban, Users } from 'lucide-react';

type Hello = {
  id: string;
  fromUserId: string;
  toUserId: string;
  buildingId: string | null;
  message: string | null;
  status: string;
  createdAt: string;
  respondedAt: string | null;
  fromUser: { username: string | null; displayName: string | null; department: { code: string; name: string } | null };
  toUser: { username: string | null; displayName: string | null; department: { code: string; name: string } | null };
};

export function HellosScreen() {
  const { toast } = useToast();
  const [incoming, setIncoming] = useState<Hello[] | null>(null);
  const [outgoing, setOutgoing] = useState<Hello[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/hellos', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled && d.ok) return;
        if (d.ok) {
          setIncoming(d.incoming);
          setOutgoing(d.outgoing);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reload(); }, [reload]);

  const respond = async (helloId: string, action: 'accept' | 'decline' | 'block') => {
    setBusyId(helloId + action);
    try {
      const res = await fetch(`/api/hellos/${helloId}/${action}`, { method: 'POST' });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not respond', description: d.message, variant: 'destructive' });
        return;
      }
      toast({
        title: action === 'accept' ? '✓ Connected' : action === 'decline' ? 'Declined' : 'Blocked',
        description: action === 'accept' ? 'You can now chat with them.' : action === 'block' ? 'They won\'t see you anymore.' : undefined,
      });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  if (!incoming || !outgoing) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="p-4 space-y-4">
      {/* Incoming */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> People saying hello to you
          </CardTitle>
          <CardDescription className="text-xs">
            Tap accept to connect, decline to dismiss, or block to make them vanish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incoming.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2 text-center">No hellos yet.</div>
          ) : (
            <ul className="space-y-2">
              {incoming.map((h) => (
                <li
                  key={h.id}
                  className={cn(
                    'flex items-center justify-between gap-2 p-3 rounded-lg border',
                    h.status === 'pending' ? 'border-primary/30 bg-primary/5' : 'border-border bg-card opacity-60',
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {h.fromUser.displayName ?? h.fromUser.username
                        ?? (h.fromUser.department ? `Someone from ${h.fromUser.department.code}` : 'Someone')}
                    </div>
                    {h.fromUser.department && (
                      <div className="text-[10px] text-muted-foreground">{h.fromUser.department.name}</div>
                    )}
                    {h.message && (
                      <div className="text-xs text-muted-foreground italic mt-1 truncate">"{h.message}"</div>
                    )}
                  </div>
                  {h.status === 'pending' ? (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="default" className="h-7 text-xs" disabled={!!busyId}
                        onClick={() => respond(h.id, 'accept')}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busyId}
                        onClick={() => respond(h.id, 'decline')}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={!!busyId}
                        onClick={() => respond(h.id, 'block')}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-[10px] capitalize">{h.status}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Outgoing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Your hellos out</CardTitle>
          <CardDescription className="text-xs">
            Max 3 outgoing at a time. 24h cooldown after a decline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outgoing.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2 text-center">
              None. Tap a presence dot on the map to send one.
            </div>
          ) : (
            <ul className="space-y-2">
              {outgoing.map((h) => (
                <li
                  key={h.id}
                  className={cn(
                    'flex items-center justify-between gap-2 p-3 rounded-lg border',
                    h.status === 'pending' ? 'border-border bg-card' : 'border-border bg-card opacity-60',
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {h.toUser.displayName ?? h.toUser.username
                        ?? (h.toUser.department ? `Someone from ${h.toUser.department.code}` : 'Someone')}
                    </div>
                    {h.toUser.department && (
                      <div className="text-[10px] text-muted-foreground">{h.toUser.department.name}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{h.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
