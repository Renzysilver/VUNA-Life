/**
 * AppShell — the fixed chrome that wraps every screen.
 *
 * Structure:
 *   - A fixed bottom nav bar with 5 tabs: Map · Home · Wallet · People · Profile
 *   - A top status bar row (server time + presence dot + CC balance)
 *   - The active screen scrolls in the space between
 *
 * Designed for mobile-first (max-w-[480px] on body). Desktop just centres it.
 *
 * Usage:
 *   <AppShell activeTab={tab} onTabChange={setTab} wallet={walletData} user={user}>
 *     {children}
 *   </AppShell>
 */

'use client';

import { useEffect, useState } from 'react';
import {
  Map, Home, Wallet, Users, User,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AppTab = 'map' | 'home' | 'wallet' | 'people' | 'profile';

type Props = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  /** Live wallet balance — shown in status bar. null while loading. */
  balance: number | null;
  /** Whether the user is online / present on campus */
  online?: boolean;
  children: React.ReactNode;
};

const NAV_ITEMS: { id: AppTab; label: string; Icon: React.ElementType }[] = [
  { id: 'map',     label: 'Campus',  Icon: Map     },
  { id: 'home',    label: 'Home',    Icon: Home    },
  { id: 'wallet',  label: 'Wallet',  Icon: Wallet  },
  { id: 'people',  label: 'People',  Icon: Users   },
  { id: 'profile', label: 'Profile', Icon: User    },
];

export function AppShell({ activeTab, onTabChange, balance, online = false, children }: Props) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      setClock(`${h}:${m}`);
    };
    tick();
    const id = setInterval(tick, 10_000); // update every 10s — no need for per-second
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">

      {/* ── Status bar ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        {/* Left: campus name */}
        <span
          className="text-[11px] font-semibold tracking-widest uppercase text-primary"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          VUNA Life
        </span>

        {/* Centre: time */}
        <span className="font-mono text-sm tabular-nums text-foreground/70">{clock}</span>

        {/* Right: online dot + CC balance */}
        <div className="flex items-center gap-2">
          {online && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
              <Circle className="h-2 w-2 fill-current" />
              On campus
            </span>
          )}
          {balance !== null && (
            <span className="cc-amount text-sm">{balance.toLocaleString()} CC</span>
          )}
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <nav
        className={cn(
          'bottom-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px]',
          'bg-card/95 backdrop-blur-md border-t border-border',
          'grid grid-cols-5 z-50',
        )}
        style={{ height: 'var(--nav-height)' }}
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                'tap-target flex flex-col items-center justify-center gap-0.5 transition-colors duration-150',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
                {/* Active pill indicator */}
                {active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                )}
              </div>
              <span className={cn('text-[10px] font-medium', active ? 'text-primary' : '')}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
