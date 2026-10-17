'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, Clock } from 'lucide-react';

type TimetableEntry = {
  id: string;
  weekday: number;
  courseCode: string;
  courseTitle: string;
  startTime: string;
  endTime: string;
  venue: { pin: string; name: string | null; status: string; category: string } | null;
  lecturer: { username: string } | null;
};

type TimetableResponse = {
  ok: boolean;
  todayWeekday: number;
  entries: TimetableEntry[];
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TimetableView() {
  const [data, setData] = useState<TimetableResponse | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/timetable', { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 401 && retryTick === 0) {
          setTimeout(() => {
            if (!cancelled) setRetryTick(1);
          }, 500);
          return null;
        }
        return (await r.json()) as TimetableResponse;
      })
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading timetable…
        </CardContent>
      </Card>
    );
  }

  if (!data.ok) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Could not load timetable. Try reloading the page.
        </CardContent>
      </Card>
    );
  }

  // Group entries by weekday (0..6)
  const byDay: TimetableEntry[][] = [[], [], [], [], [], [], []];
  for (const e of data.entries) {
    if (byDay[e.weekday]) byDay[e.weekday].push(e);
  }
  // Sort each day's entries by start time
  for (const day of byDay) {
    day.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" /> Week timetable
        </CardTitle>
        <CardDescription>
          Your real classes across Mon–Sun. Today's column is highlighted. Venue badges show building pin + status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.entries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No timetable entries yet. An admin needs to import the timetable CSV for your department.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {DAYS.map((dayShort, idx) => {
              const isToday = data.todayWeekday === idx;
              const entries = byDay[idx] ?? [];
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 space-y-2 ${
                    isToday
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">
                      {dayShort}
                    </div>
                    {isToday && (
                      <Badge variant="default" className="text-[9px] py-0 h-4">TODAY</Badge>
                    )}
                  </div>
                  {entries.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground italic">— free —</div>
                  ) : (
                    <ul className="space-y-2">
                      {entries.map((e) => (
                        <li
                          key={e.id}
                          className="text-xs space-y-1 p-2 rounded border border-border/50 bg-background/50"
                        >
                          <div className="font-mono tabular-nums text-primary">
                            {e.startTime}–{e.endTime}
                          </div>
                          <div className="font-medium">
                            {e.courseCode}
                          </div>
                          <div className="text-[10px] text-muted-foreground line-clamp-2">
                            {e.courseTitle}
                          </div>
                          {e.venue && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Building2 className="h-2.5 w-2.5" />
                              <span>{e.venue.name ?? `pin ${e.venue.pin}`}</span>
                              {e.venue.status !== 'USER_CONFIRMED' && (
                                <Badge variant="outline" className="text-[9px] py-0 h-3.5">
                                  {e.venue.status}
                                </Badge>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
