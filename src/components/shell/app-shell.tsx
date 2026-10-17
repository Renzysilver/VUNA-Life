/**
 * AppShell — phone-frame chrome (Phase 8 visual overhaul)
 * Bottom nav with emoji icons + green active pill.
 */

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type AppTab = 'map' | 'home' | 'wallet' | 'people' | 'profile';

type Props = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  balance: number | null;
  online?: boolean;
  children: React.ReactNode;
};

const NAV_ITEMS: { id: AppTab; label: string; emoji: string }[] = [
  { id: 'map',     label: 'Campus',  emoji: '🗺️' },
  { id: 'home',    label: 'Home',    emoji: '🏠' },
  { id: 'wallet',  label: 'Wallet',  emoji: '💰' },
  { id: 'people',  label: 'People',  emoji: '👥' },
  { id: 'profile', label: 'Profile', emoji: '👤' },
];

export function AppShell({ activeTab, onTabChange, balance, online = false, children }: Props) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a1628]" style={{ height: '100%' }}>
      {/* Main content — fills phone frame, scrolls within */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ minHeight: 0 }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {NAV_ITEMS.map(({ id, label, emoji }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn('nav-item', active && 'nav-item--active')}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="nav-item-icon">{emoji}</span>
              <span className="nav-item-label">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
