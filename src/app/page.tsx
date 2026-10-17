/**
 * page.tsx v2 — replaces the old tab-based layout entirely.
 *
 * Uses AppShell (fixed bottom nav) + per-tab screens.
 * The map is a real first-class tab, not a future phase.
 * Auth flow stays: sign-in → OTP → then AppShell.
 *
 * Adapted from the redesign pack's page-v2.tsx to match the existing
 * SignInForm (onRequestSent prop) and OtpConfirmForm (no message prop,
 * response.user not response.student) signatures — those auth component
 * files must NOT change per the redesign prompt.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell, type AppTab } from '@/components/shell/app-shell';
import { HomeScreenV2 } from '@/components/home/home-screen-v2';
import { MapScreen } from '@/components/map/map-screen';
import { WalletScreen } from '@/components/wallet/wallet-screen';
import { CanteenScreen } from '@/components/canteen/canteen-screen';
import { HustleScreen } from '@/components/hustle/hustle-screen';
import { HellosScreen } from '@/components/social/hellos-screen';
import { ChatsScreen } from '@/components/social/chats-screen';
import { FeedbackButton } from '@/components/social/feedback-button';
import { AdminShell } from '@/components/admin/admin-shell';
import { LecturerScreen } from '@/components/lecturer/lecturer-screen';
import { GateArrivalScene } from '@/components/gate/gate-arrival-scene';
import { SignInForm } from '@/components/auth/sign-in-form';
import { OtpConfirmForm, type VerifyResponse } from '@/components/auth/otp-confirm-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ── Auth state types ──────────────────────────────────────────────────────
export type SessionInfo = {
  id: string;
  email: string;
  emailDomain: string;
  role: string;
  username: string | null;
  displayName: string | null;
  departmentId: string | null;
  level: number | null;
  isVerifiedStudent: boolean;
  isBeta: boolean;
  avatarPath: string | null;
};

type PageState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'requesting-otp'; email: string; demoOtp?: string; expiresInSec: number; message?: string }
  | { kind: 'signed-in'; user: SessionInfo };

// ── Page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [walletSubView, setWalletSubView] = useState<'wallet' | 'canteen' | 'hustle'>('wallet');
  const [peopleSubView, setPeopleSubView] = useState<'hellos' | 'chats'>('hellos');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showGate, setShowGate] = useState(false);

  // Check session on mount
  const refresh = useCallback(() => {
    let cancelled = false;
    fetch('/api/student/me', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) { if (!cancelled) setState({ kind: 'signed-out' }); return; }
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) { setState({ kind: 'signed-out' }); return; }
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
            isBeta: data.student.isBeta ?? false,
            avatarPath: data.student.avatarPath ?? null,
          },
        });
        // Check if the user needs to arrive at the gate today.
        // Only for students (not admins/lecturers in admin mode).
        if (data.student.role === 'student' || data.student.role === 'admin') {
          fetch('/api/gate/arrive', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'compute' }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.ok && !d.alreadyArrived) {
                setShowGate(true);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setState({ kind: 'signed-out' }); });
    return () => { cancelled = true; };
  }, []);

  // Run on mount — useEffect, not useState(() => refresh()), so React 19's
  // linter doesn't flag the setState-during-render pattern.
  useEffect(() => {
    return refresh();
  }, []);

  // ── Auth screens (outside AppShell) ───────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center gap-4">
        <p className="text-primary-foreground font-bold text-xl"
           style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          VUNA Life
        </p>
        <Skeleton className="h-2 w-24 rounded-full bg-white/20" />
      </div>
    );
  }

  if (state.kind === 'signed-out') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Brand header */}
        <div className="bg-primary px-6 pt-16 pb-10">
          <h1
            className="text-3xl font-bold text-white"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            VUNA Life
          </h1>
          <p className="text-white/60 text-sm mt-1">Veritas University Abuja</p>
        </div>
        <div className="flex-1 p-6">
          <SignInForm
            // Adapted: existing SignInForm uses `onRequestSent` (single
            // object arg). The redesign pack's page-v2.tsx used a different
            // `onOtpRequested` signature; we use the existing component's
            // signature here since auth files must not change.
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
        </div>
      </div>
    );
  }

  if (state.kind === 'requesting-otp') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-primary px-6 pt-16 pb-10">
          <h1
            className="text-3xl font-bold text-white"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Check your email
          </h1>
          <p className="text-white/60 text-sm mt-1">{state.email}</p>
          {state.message && (
            <p className="text-white/50 text-xs mt-2 italic">{state.message}</p>
          )}
        </div>
        <div className="flex-1 p-6">
          <OtpConfirmForm
            email={state.email}
            demoOtp={state.demoOtp}
            expiresInSec={state.expiresInSec}
            // Adapted: existing OtpConfirmForm response uses `r.user`
            // (not `r.student`). The redesign pack's page-v2.tsx used
            // `r.student` — we use the existing component's response shape.
            onVerified={(r: VerifyResponse) => {
              setState({
                kind: 'signed-in',
                user: {
                  id: r.user.id,
                  email: r.user.email,
                  emailDomain: r.user.emailDomain,
                  role: r.user.role,
                  username: r.user.username,
                  displayName: r.user.displayName,
                  departmentId: r.user.departmentId,
                  level: r.user.level,
                  isVerifiedStudent: r.user.isVerifiedStudent,
                  isBeta: (r as any).user.isBeta ?? false,
                  avatarPath: (r as any).user.avatarPath ?? null,
                },
              });
              // Check gate arrival for the newly-signed-in user.
              fetch('/api/gate/arrive', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'compute' }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (d.ok && !d.alreadyArrived) {
                    setShowGate(true);
                  }
                })
                .catch(() => {});
            }}
            onBack={() => setState({ kind: 'signed-out' })}
          />
        </div>
      </div>
    );
  }

  // ── Gate arrival scene (Phase 6) ────────────────────────────────────────
  if (showGate) {
    return <GateArrivalScene onDone={() => setShowGate(false)} />;
  }

  // ── Main app (inside AppShell) ─────────────────────────────────────────
  const { user } = state;

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    setState({ kind: 'signed-out' });
    setWalletBalance(null);
  };

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab);
        // Reset wallet sub-view when leaving the wallet tab
        if (tab !== 'wallet') setWalletSubView('wallet');
        // Reset people sub-view when leaving the people tab
        if (tab !== 'people') setPeopleSubView('hellos');
      }}
      balance={walletBalance}
      online={user.isVerifiedStudent}
    >
      {activeTab === 'map' && (
        <MapScreen />
      )}

      {activeTab === 'home' && (
        <div className="px-0">
          <HomeScreenV2 onBalanceChange={setWalletBalance} />
        </div>
      )}

      {activeTab === 'wallet' && (
        walletSubView === 'canteen' ? (
          <CanteenScreen />
        ) : walletSubView === 'hustle' ? (
          <HustleScreen onBalanceChange={setWalletBalance} />
        ) : (
          <WalletScreen
            onGoToCanteen={() => setWalletSubView('canteen')}
            onGoToHustle={() => setWalletSubView('hustle')}
          />
        )
      )}

      {activeTab === 'people' && (
        peopleSubView === 'chats' ? (
          <ChatsScreen />
        ) : (
          <div className="space-y-0">
            <HellosScreen />
            <div className="px-4 pb-2">
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => setPeopleSubView('chats')}
              >
                View chats →
              </Button>
            </div>
          </div>
        )
      )}

      {activeTab === 'profile' && (
        <div className="p-4 space-y-4">
          {/* Mini profile */}
          <div className="pt-8 text-center space-y-1">
            <div
              className="text-2xl font-bold"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {user.displayName ?? user.username ?? user.email}
            </div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
              {user.isVerifiedStudent && (
                <span className="inline-block text-[11px] bg-primary/10 text-primary px-3 py-0.5 rounded-full font-medium">
                  Verified student
                </span>
              )}
              {user.isBeta && (
                <span className="inline-block text-[11px] bg-accent/15 text-accent-foreground border border-accent/30 px-3 py-0.5 rounded-full font-medium">
                  ⭐ Beta
                </span>
              )}
            </div>
          </div>

          {/* Feedback button — always visible */}
          <div className="border-t pt-4">
            <FeedbackButton />
          </div>

          {(user.role === 'lecturer' || user.role === 'admin') && (
            <div className="border-t pt-4">
              <h2
                className="text-sm font-bold mb-3"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Lecturer tools
              </h2>
              <LecturerScreen />
            </div>
          )}

          {user.role === 'admin' && (
            <div className="border-t pt-4">
              <h2
                className="text-sm font-bold mb-3"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Admin tools
              </h2>
              <Tabs defaultValue="buildings">
                <TabsList className="mb-3 flex flex-wrap h-auto">
                  <TabsTrigger value="buildings">Buildings</TabsTrigger>
                  <TabsTrigger value="import">Import (CSV)</TabsTrigger>
                  <TabsTrigger value="config">Config</TabsTrigger>
                  <TabsTrigger value="audit">Audit log</TabsTrigger>
                </TabsList>
                <TabsContent value="buildings"><AdminShell section="buildings" /></TabsContent>
                <TabsContent value="import"><AdminShell section="import" /></TabsContent>
                <TabsContent value="config"><AdminShell section="config" /></TabsContent>
                <TabsContent value="audit"><AdminShell section="audit" /></TabsContent>
              </Tabs>
            </div>
          )}

          <div className="border-t pt-4">
            <button
              onClick={handleSignOut}
              className="tap-target w-full text-center text-sm text-muted-foreground py-2"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
