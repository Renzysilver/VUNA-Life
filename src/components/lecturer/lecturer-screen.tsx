/**
 * LecturerScreen — lecturer's tool for opening a session and reviewing flags.
 *
 * Layout:
 *   1. Open-session form (course code, venue pin, duration minutes)
 *   2. Today's sessions list (click to open active view)
 *   3. For the selected session: rotating QR + seconds until rotation
 *      + attendance list with flagged rows highlighted
 *   4. Flag review: approve / reject each flagged row
 *
 * Visible only to role='lecturer' or 'admin' (gate is in page.tsx).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Plus, RefreshCw, QrCode, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';

type SessionListItem = {
  id: string;
  type: string;
  opensAt: string;
  closesAt: string;
  venue: { pin: string; name: string | null; status: string } | null;
  course: { code: string; title: string } | null;
  attendanceCount: number;
};

type QrState = {
  ok: boolean;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
  secondsUntilOpen: number | null;
  secondsUntilClose: number | null;
  token: string | null;
  qrSvg: string | null;
  slotIndex: number | null;
  secondsUntilRotation: number | null;
};

type AttendanceRow = {
  id: string;
  userId: string;
  checkedInAt: string;
  status: string;
  flag: string | null;
  username: string | null;
  displayName: string | null;
  email: string;
  department: { code: string; name: string } | null;
  level: number | null;
};

export function LecturerScreen() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qrState, setQrState] = useState<QrState | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [creating, setCreating] = useState(false);

  // Open-session form state
  const [type, setType] = useState<'class' | 'mass' | 'event' | 'exam'>('class');
  const [courseCode, setCourseCode] = useState('');
  const [venuePin, setVenuePin] = useState('2');
  const [durationMinutes, setDurationMinutes] = useState('50');

  const reloadSessions = useCallback(() => {
    let cancelled = false;
    fetch('/api/sessions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.ok) setSessions(d.sessions);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reloadSessions(); }, [reloadSessions]);

  // Poll the selected session's QR state every 2 seconds.
  useEffect(() => {
    if (!selectedId) { setQrState(null); setAttendance([]); return; }
    let cancelled = false;

    const pollQr = () => {
      fetch(`/api/sessions/${selectedId}/qr`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setQrState(d); })
        .catch(() => {});
      fetch(`/api/sessions/${selectedId}/attendance`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.ok) setAttendance(d.attendance); })
        .catch(() => {});
    };
    pollQr();
    const id = setInterval(pollQr, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          courseCode: courseCode.trim() || undefined,
          venuePin: venuePin.trim() || undefined,
          durationMinutes: parseInt(durationMinutes, 10) || 50,
        }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not open session', description: d.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Session opened', description: `id ${d.session.id.slice(0, 8)}… — show the QR to students` });
      reloadSessions();
      setSelectedId(d.session.id);
    } finally {
      setCreating(false);
    }
  };

  const resolveFlag = async (attendanceId: string, decision: 'approve' | 'reject') => {
    if (!selectedId) return;
    const res = await fetch(`/api/sessions/${selectedId}/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attendanceId, decision }),
    });
    const d = await res.json();
    if (!d.ok) {
      toast({ title: 'Could not resolve flag', description: d.message, variant: 'destructive' });
      return;
    }
    toast({ title: decision === 'approve' ? 'Approved' : 'Marked absent' });
    // Refresh attendance list
    const ar = await fetch(`/api/sessions/${selectedId}/attendance`, { cache: 'no-store' });
    const ad = await ar.json();
    if (ad.ok) setAttendance(ad.attendance);
  };

  return (
    <div className="space-y-4">
      {/* ── Open-session form ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" /> Open a session
          </CardTitle>
          <CardDescription className="text-xs">
            Create a class/event/exam session. The QR rotates every 10 seconds — students must scan the current code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">Class</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="mass">Mass (manual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Course code</Label>
              <Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="CSC201" className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Venue pin</Label>
              <Input value={venuePin} onChange={(e) => setVenuePin(e.target.value)} placeholder="2 (Block A)" className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Minutes</Label>
              <Input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} type="number" min="5" max="240" className="h-9 text-xs" />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating} size="sm" className="w-full">
            {creating ? 'Opening…' : 'Open session'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Today's sessions ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Today's sessions</CardTitle>
            <Button size="sm" variant="ghost" onClick={reloadSessions}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!sessions ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">No sessions today.</div>
          ) : (
            <ul className="space-y-1">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition flex items-center gap-3',
                      selectedId === s.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/40',
                    )}
                  >
                    <Badge variant="outline" className="text-[10px] capitalize">{s.type}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.course ? `${s.course.code} — ${s.course.title}` : (s.venue?.name ?? 'No venue')}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(s.opensAt).toLocaleTimeString()} — {new Date(s.closesAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {s.attendanceCount} in
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Selected session: QR + attendance ────────────────── */}
      {selectedId && qrState && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4" /> Live QR
            </CardTitle>
            <CardDescription className="text-xs">
              The code rotates every 10 seconds. Students must scan the current code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!qrState.isOpen ? (
              <div className="text-sm text-muted-foreground py-3 text-center">
                {qrState.secondsUntilOpen && qrState.secondsUntilOpen > 0
                  ? `Opens in ${qrState.secondsUntilOpen}s`
                  : 'Session closed.'}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* QR rendering */}
                <div className="flex flex-col items-center gap-2">
                  {qrState.qrSvg ? (
                    <div
                      className="bg-white p-3 rounded-xl"
                      dangerouslySetInnerHTML={{ __html: qrState.qrSvg }}
                    />
                  ) : (
                    <div className="bg-white p-3 rounded-xl w-32 h-32 grid place-items-center">
                      <QrCode className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">
                      <Clock className="inline h-3 w-3 mr-1" />
                      rotates in <span className="font-mono tabular-nums">{qrState.secondsUntilRotation}s</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-1 break-all max-w-[200px]">
                      {qrState.token}
                    </div>
                  </div>
                </div>

                {/* Session state */}
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" className="text-[10px]">LIVE</Badge>
                    <span className="text-xs text-muted-foreground">
                      closes in {Math.ceil((qrState.secondsUntilClose ?? 0) / 60)} min
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {attendance.length} checked in ·{' '}
                    {attendance.filter((a) => a.flag).length} flagged
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Attendance list with flag review ─────────────────── */}
      {selectedId && attendance.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Attendance ({attendance.length})</CardTitle>
            <CardDescription className="text-xs">
              Flagged rows are highlighted. Review and approve/reject each.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-96">
              <ul className="space-y-1 pr-2">
                {attendance.map((a) => {
                  const flagged = !!a.flag;
                  const isAbsent = a.status === 'absent';
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-md border text-xs',
                        isAbsent
                          ? 'border-destructive/30 bg-destructive/5 opacity-60'
                          : flagged
                            ? 'border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-border bg-card',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {a.displayName ?? a.username ?? a.email}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {a.department ? `${a.department.code} · ${a.level}` : 'No dept'} ·{' '}
                          {new Date(a.checkedInAt).toLocaleTimeString()}
                        </div>
                        {a.flag && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {a.flag}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={a.status === 'present' ? 'default' : a.status === 'late' ? 'secondary' : 'destructive'}
                        className="text-[9px]"
                      >
                        {a.status}
                      </Badge>
                      {flagged && !isAbsent && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-emerald-600"
                            onClick={() => resolveFlag(a.id, 'approve')}
                            title="Approve"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive"
                            onClick={() => resolveFlag(a.id, 'reject')}
                            title="Reject (mark absent)"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
