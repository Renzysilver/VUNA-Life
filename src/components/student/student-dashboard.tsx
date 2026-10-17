'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Building2, Clock, GraduationCap, CalendarDays } from 'lucide-react';
import type { SessionInfo } from '@/app/page';

type MeResponse = {
  ok: boolean;
  student?: {
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
  mondayTimetable?: Array<{
    id: string;
    courseCode: string;
    courseTitle: string;
    weekday: number;
    startTime: string;
    endTime: string;
    venue: { pin: string; name: string | null; status: string } | null;
    lecturer: { username: string } | null;
  }>;
  message?: string;
};

export function StudentDashboard({ user }: { user: SessionInfo }) {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // The dashboard mounts right after the verify-otp response. Through the
    // preview gateway, the new session cookie may not have settled in the
    // browser's cookie jar by the time this fetch fires — that returns a 401
    // even though the user IS logged in. So we retry once after a brief
    // delay if the first fetch fails with 401.
    fetch('/api/student/me', { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return null;
        if (r.status === 401 && retryTick === 0) {
          // Schedule a single retry after 500ms — enough time for the
          // just-set cookie to be committed by the browser.
          setTimeout(() => {
            if (!cancelled) setRetryTick(1);
          }, 500);
          return null;
        }
        return (await r.json()) as MeResponse;
      })
      .then((d) => {
        if (cancelled || !d) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  if (loading || !data) {
    return <DashboardSkeleton />;
  }
  if (!data.ok || !data.student) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load your dashboard</CardTitle>
          <CardDescription>
            {data.message ?? 'Unknown error.'}{' '}
            <span className="text-xs">
              You are signed in as <code>{user.email}</code>. Try reloading the page.
            </span>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const s = data.student;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <GraduationCap className="h-5 w-5" />
            {s.displayName ?? s.username ?? s.email}
          </CardTitle>
          <CardDescription>
            {s.department ? (
              <>
                {s.department.name} ({s.department.code})
                {s.department.faculty ? ` — ${s.department.faculty}` : ''}
              </>
            ) : (
              'No department assigned yet. An admin will assign one when the school record is imported.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Email" value={s.email} mono />
            <Stat label="Domain" value={s.emailDomain || '—'} mono />
            <Stat label="Level" value={s.level ? `${s.level} level` : '—'} />
            <Stat label="Verified" value={s.isVerifiedStudent ? 'Yes' : 'Pending'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarDays className="h-5 w-5" /> Monday timetable
          </CardTitle>
          <CardDescription>
            Phase 1 exit test: a real student who verifies should see their real
            Monday schedule here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.mondayTimetable && data.mondayTimetable.length > 0 ? (
            <ul className="space-y-3">
              {data.mondayTimetable.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-md border bg-card/50"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm tabular-nums">
                      {e.startTime}–{e.endTime}
                    </span>
                  </div>
                  <Separator orientation="vertical" className="hidden sm:block h-6" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {e.courseCode} — {e.courseTitle}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Building2 className="h-3 w-3" />
                      {e.venue ? (
                        <>
                          {e.venue.name ?? `Building ${e.venue.pin}`}
                          <Badge variant="outline" className="text-[10px]">
                            pin {e.venue.pin}
                          </Badge>
                          {e.venue.status !== 'USER_CONFIRMED' && (
                            <Badge variant="secondary" className="text-[10px]">
                              {e.venue.status}
                            </Badge>
                          )}
                        </>
                      ) : (
                        'Venue not assigned'
                      )}
                    </div>
                  </div>
                  {e.lecturer && (
                    <Badge variant="outline" className="text-xs">
                      {e.lecturer.username ?? 'Lecturer'}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                No Monday classes found for your department/level yet. An admin
                needs to import the timetable CSV for your department before it
                shows up here.
              </p>
              <p className="text-xs">
                In DEMO MODE, a sample student (<code>student.demo@vuna-life.local</code>,
                Computer Science, 200 level) has a Monday timetable seeded into
                the local SQLite DB. Sign in with that email to see it.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-sm truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
