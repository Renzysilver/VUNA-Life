'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { SignInForm } from '@/components/auth/sign-in-form';
import { OtpConfirmForm, type VerifyResponse } from '@/components/auth/otp-confirm-form';
import { StudentDashboard, type DashboardData } from '@/components/student/student-dashboard';
import { AdminShell } from '@/components/admin/admin-shell';
import { Building, ShieldAlert, LogOut, MapPin } from 'lucide-react';

export type SessionInfo = {
  id: string;
  email: string;
  emailDomain: string;
  role: string; // 'student' | 'lecturer' | 'admin' | 'moderator'
  username: string | null;
  displayName: string | null;
  departmentId: string | null;
  level: number | null;
  isVerifiedStudent: boolean;
};

type PageState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'requesting-otp'; email: string; demoOtp?: string; expiresInSec: number; message?: string }
  | { kind: 'signed-in'; user: SessionInfo; dashboard: DashboardData | null };

export default function Page() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [demoBannerVisible, setDemoBannerVisible] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    let cancelled = false;
    fetch('/api/student/me', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) setState({ kind: 'signed-out' });
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) {
          setState({ kind: 'signed-out' });
          return;
        }
        setState({
          kind: 'signed-in',
          user: {
            id: data.student.id,
            email: data.student.email,
            emailDomain: data.student.emailDomain,
            role: data.student.role,
            username: data.student.username,
            displayName: data.student.displayName,
            departmentId: data.student.departmentId,
            level: data.student.level,
            isVerifiedStudent: data.student.isVerifiedStudent,
          },
          dashboard: {
            department: data.student.department,
            mondayTimetable: data.mondayTimetable ?? [],
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'signed-out' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setDemoBannerVisible(d.isDemoMode === true))
      .catch(() => setDemoBannerVisible(null));
  }, []);

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setState({ kind: 'signed-out' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">
              V
            </div>
            <div>
              <div className="font-semibold text-sm sm:text-base leading-tight">VUNA Life</div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                Veritas University Abuja &middot; Phase 1: foundation &amp; real data
              </div>
            </div>
          </div>
          {state.kind === 'signed-in' && (
            <div className="flex items-center gap-2">
              <Badge variant={state.user.role === 'admin' ? 'default' : 'secondary'}>
                {state.user.role}
              </Badge>
              <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[200px]">
                {state.user.email}
              </span>
              <Button size="sm" variant="outline" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-1" /> Sign out
              </Button>
            </div>
          )}
        </div>
      </header>

      {demoBannerVisible && (
        <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-950/40 dark:border-amber-900">
          <div className="container mx-auto px-4 py-2 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong className="font-semibold">DEMO MODE.</strong> Live Supabase credentials are
              not configured, so the app is running on local SQLite with seeded campus data.
              OTPs are visible on-screen (demo OTP is{' '}
              <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">123456</code>).
              Verification is also{' '}
              <strong className="font-semibold">closed</strong> unless an admin populates{' '}
              <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">
                allowed_email_domains
              </code>{' '}
              in config — but in DEMO MODE any email passes the check so you can see the flow.
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto px-4 py-6">
        {state.kind === 'loading' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {state.kind === 'signed-out' && (
          <div className="max-w-md mx-auto py-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" /> Sign in to VUNA Life
                </CardTitle>
                <CardDescription>
                  Sign in with your school email. A one-time code will be sent to it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SignInForm
                  onRequestSent={(r) =>
                    setState({
                      kind: 'requesting-otp',
                      email: r.email,
                      demoOtp: r.demoOtp,
                      expiresInSec: r.expiresInSec,
                      message: r.message,
                    })
                  }
                />
              </CardContent>
            </Card>
          </div>
        )}

        {state.kind === 'requesting-otp' && (
          <div className="max-w-md mx-auto py-8">
            <Card>
              <CardHeader>
                <CardTitle>Enter the code</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to <strong>{state.email}</strong>.{' '}
                  {state.message && <span className="block mt-1 text-xs">{state.message}</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OtpConfirmForm
                  email={state.email}
                  demoOtp={state.demoOtp}
                  expiresInSec={state.expiresInSec}
                  onVerified={(response: VerifyResponse) => {
                    // Transition to signed-in IMMEDIATELY from the verify-otp
                    // response — no second fetch needed. The response includes
                    // the department + Monday timetable so the dashboard can
                    // render with zero follow-up calls. This sidesteps the
                    // cookie race entirely (especially through the preview
                    // gateway, where the new cookie wasn't being seen by the
                    // follow-up /api/student/me call).
                    setState({
                      kind: 'signed-in',
                      user: {
                        id: response.user.id,
                        email: response.user.email,
                        emailDomain: response.user.emailDomain,
                        role: response.user.role,
                        username: response.user.username,
                        displayName: response.user.displayName,
                        departmentId: response.user.departmentId,
                        level: response.user.level,
                        isVerifiedStudent: response.user.isVerifiedStudent,
                      },
                      dashboard: {
                        department: response.department,
                        mondayTimetable: response.mondayTimetable,
                      },
                    });
                  }}
                  onBack={() => setState({ kind: 'signed-out' })}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {state.kind === 'signed-in' && (
          <SignedInView
            user={state.user}
            dashboard={state.dashboard}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      <footer className="mt-auto border-t bg-card/30">
        <div className="container mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>
            VUNA Life &middot; Phase 1 &middot;{' '}
            <a
              href="https://veritas.edu.ng"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Veritas University Abuja
            </a>
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Map v1 approximate, traced from old satellite
          </span>
        </div>
      </footer>
    </div>
  );
}

function SignedInView({
  user,
  dashboard,
  onSignOut,
}: {
  user: SessionInfo;
  dashboard: DashboardData | null;
  onSignOut: () => void;
}) {
  if (user.role === 'admin') {
    return (
      <Tabs defaultValue="student">
        <TabsList className="mb-4 flex flex-wrap h-auto">
          <TabsTrigger value="student">Student view</TabsTrigger>
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="import">Import (CSV)</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="student">
          <StudentDashboard user={user} initialData={dashboard} />
        </TabsContent>
        <TabsContent value="buildings">
          <AdminShell section="buildings" />
        </TabsContent>
        <TabsContent value="import">
          <AdminShell section="import" />
        </TabsContent>
        <TabsContent value="config">
          <AdminShell section="config" />
        </TabsContent>
        <TabsContent value="audit">
          <AdminShell section="audit" />
        </TabsContent>
      </Tabs>
    );
  }
  return <StudentDashboard user={user} initialData={dashboard} />;
}
