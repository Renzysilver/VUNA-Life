'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, Clock, GraduationCap, CalendarDays } from 'lucide-react';
import type { SessionInfo } from '@/app/page';

export type DashboardData = {
  department: { code: string; name: string; faculty: string | null } | null;
  mondayTimetable: Array<{
    id: string;
    courseCode: string;
    courseTitle: string;
    weekday: number;
    startTime: string;
    endTime: string;
    venue: { pin: string; name: string | null; status: string } | null;
    lecturer: { username: string } | null;
  }>;
};

export function StudentDashboard({
  user,
  initialData,
}: {
  user: SessionInfo;
  initialData: DashboardData | null;
}) {
  // The dashboard renders directly from the data the verify-otp response
  // already returned (department + Monday timetable). No follow-up fetch —
  // that was racing the new session cookie through the preview gateway and
  // returning 401, leaving the user stuck on "Could not load your dashboard".
  // If initialData is null (e.g. page was reloaded and /api/student/me
  // failed), we show a graceful empty state with a reload hint.
  const s = {
    email: user.email,
    emailDomain: user.emailDomain,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    level: user.level,
    isVerifiedStudent: user.isVerifiedStudent,
    department: initialData?.department ?? null,
  };
  const mondayTimetable = initialData?.mondayTimetable ?? [];

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
          {mondayTimetable && mondayTimetable.length > 0 ? (
            <ul className="space-y-3">
              {mondayTimetable.map((e) => (
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
