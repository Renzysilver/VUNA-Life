/**
 * page.tsx — Phase 9 (Lagos Life architecture)
 * - Full-screen game canvas, no phone bezel around the whole app
 * - 4-tab nav: Home (dorm room) · Buy · Map · Phone (slide-up launcher)
 * - Profile accessible via HUD avatar top-left
 * - Phone launcher opens any app as a full-panel overlay
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell, type AppTab } from '@/components/shell/app-shell';
import { HomeScreen } from '@/components/home/home-screen';
import { MapScreen } from '@/components/map/map-screen';
import { WalletScreen } from '@/components/wallet/wallet-screen';
import { CanteenScreen } from '@/components/canteen/canteen-screen';
import { HustleScreen } from '@/components/hustle/hustle-screen';
import { HellosScreen } from '@/components/social/hellos-screen';
import { ChatsScreen } from '@/components/social/chats-screen';
import { FeedbackButton } from '@/components/social/feedback-button';
import { AdminShell } from '@/components/admin/admin-shell';
import { LecturerScreen } from '@/components/lecturer/lecturer-screen';
import { ProfileAvatar } from '@/components/avatar/profile-avatar';
import { WardrobeScreen } from '@/components/wardrobe/wardrobe-screen';
import { SignInForm } from '@/components/auth/sign-in-form';
import { OtpConfirmForm, type VerifyResponse } from '@/components/auth/otp-confirm-form';
import { PhoneLauncher } from '@/components/shell/phone-launcher';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TimetableView } from '@/components/timetable/timetable-view';

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

// App panel opened from phone launcher
type AppPanel = 'wallet' | 'messages' | 'timetable' | 'chapel' | 'hustle' | 'profile' | 'wardrobe' | 'people' | 'canteen' | null;

export default function Page() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [appPanel, setAppPanel] = useState<AppPanel>(null);

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
      })
      .catch(() => { if (!cancelled) setState({ kind: 'signed-out' }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return refresh();
  }, []);

  // Fetch wallet balance once signed in
  useEffect(() => {
    if (state.kind !== 'signed-in') return;
    fetch('/api/wallet', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.ok) setWalletBalance(d.wallet.balance); })
      .catch(() => {});
  }, [state.kind]);

  // ── Auth screens ──────────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <div style={{ minHeight: '100svh', background: '#050d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 24, color: 'white', letterSpacing: 1 }}>
          VUNA<span style={{ color: '#c9a227' }}>Life</span>
        </p>
        <Skeleton className="h-2 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
      </div>
    );
  }

  if (state.kind === 'signed-out') {
    return (
      <div style={{ minHeight: '100svh', background: '#0a1628', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#2d6a4f', padding: '64px 24px 40px' }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 32, color: 'white', margin: 0 }}>
            VUNA<span style={{ color: '#c9a227' }}>Life</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 }}>Veritas University Abuja</p>
        </div>
        <div style={{ flex: 1, padding: 24 }}>
          <SignInForm
            onRequestSent={(r) => setState({
              kind: 'requesting-otp',
              email: r.email,
              demoOtp: r.demoOtp,
              expiresInSec: r.expiresInSec,
              message: r.message,
            })}
          />
        </div>
      </div>
    );
  }

  if (state.kind === 'requesting-otp') {
    return (
      <div style={{ minHeight: '100svh', background: '#0a1628', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#2d6a4f', padding: '64px 24px 40px' }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 28, color: 'white', margin: 0 }}>Check your email</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 }}>{state.email}</p>
        </div>
        <div style={{ flex: 1, padding: 24 }}>
          <OtpConfirmForm
            email={state.email}
            demoOtp={state.demoOtp}
            expiresInSec={state.expiresInSec}
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
            }}
            onBack={() => setState({ kind: 'signed-out' })}
          />
        </div>
      </div>
    );
  }

  const { user } = state;

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    setState({ kind: 'signed-out' });
    setWalletBalance(null);
  };

  // ── App panel content (opened from phone launcher) ────────────────────
  const renderAppPanel = () => {
    if (!appPanel) return null;
    return (
      <div className="app-panel-overlay" onClick={e => { if (e.target === e.currentTarget) setAppPanel(null); }}>
        <div className="app-panel-sheet">
          <button className="app-panel-close" onClick={() => setAppPanel(null)}>✕</button>
          {appPanel === 'wallet'    && <WalletScreen onGoToCanteen={() => setAppPanel('canteen')} onGoToHustle={() => setAppPanel('hustle')} />}
          {appPanel === 'canteen'   && <CanteenScreen />}
          {appPanel === 'hustle'    && <HustleScreen onBalanceChange={setWalletBalance} />}
          {appPanel === 'messages'  && <ChatsScreen />}
          {appPanel === 'timetable' && <TimetableView />}
          {appPanel === 'people'    && <div className="space-y-0"><HellosScreen /></div>}
          {appPanel === 'wardrobe'  && <WardrobeScreen onClose={() => setAppPanel(null)} onBalanceChange={setWalletBalance} />}
          {appPanel === 'chapel'    && (
            <div style={{ padding: 24, color: 'white' }}>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700 }}>⛪ Chapel Mass</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Mass schedule and check-in coming soon.</p>
            </div>
          )}
          {appPanel === 'profile'   && (
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 24 }}>
                <ProfileAvatar size="large" />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: 'white' }}>
                    {user.displayName ?? user.username ?? user.email}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{user.email}</div>
                </div>
              </div>
              {user.role === 'admin' && (
                <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                  <Tabs defaultValue="buildings">
                    <TabsList className="mb-3">
                      <TabsTrigger value="buildings">Buildings</TabsTrigger>
                      <TabsTrigger value="import">Import</TabsTrigger>
                      <TabsTrigger value="config">Config</TabsTrigger>
                      <TabsTrigger value="audit">Audit</TabsTrigger>
                    </TabsList>
                    <TabsContent value="buildings"><AdminShell section="buildings" /></TabsContent>
                    <TabsContent value="import"><AdminShell section="import" /></TabsContent>
                    <TabsContent value="config"><AdminShell section="config" /></TabsContent>
                    <TabsContent value="audit"><AdminShell section="audit" /></TabsContent>
                  </Tabs>
                </div>
              )}
              {(user.role === 'lecturer' || user.role === 'admin') && (
                <div style={{ marginTop: 16 }}><LecturerScreen /></div>
              )}
              <div style={{ marginTop: 24 }}>
                <FeedbackButton />
              </div>
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                <button onClick={handleSignOut} style={{ width: '100%', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Main game ─────────────────────────────────────────────────────────
  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        balance={walletBalance}
        username={user.username ?? user.displayName}
        onAvatarPress={() => setAppPanel('profile')}
        phoneContent={
          <PhoneLauncher onOpen={(id) => {
            setAppPanel(id as AppPanel);
          }} />
        }
      >
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'map'  && <MapScreen />}
        {activeTab === 'buy'  && (
          <div style={{ height: '100%', background: '#0a1628' }}>
            <CanteenScreen />
          </div>
        )}
      </AppShell>

      {/* App panel overlays (opened from phone launcher) */}
      {renderAppPanel()}
    </>
  );
}
