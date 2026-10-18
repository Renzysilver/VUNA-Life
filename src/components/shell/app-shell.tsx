/**
 * AppShell — Lagos Life-style layout
 * - Full screen, no phone bezel
 * - 4-tab bottom nav: Home · Buy · Map · Phone
 * - HUD floats on top of the game canvas
 * - Phone launcher slides up as 70% overlay
 */

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type AppTab = 'home' | 'buy' | 'map' | 'phone';

type Props = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  balance: number | null;
  username?: string | null;
  children: React.ReactNode;
  phoneContent?: React.ReactNode; // the slide-up phone launcher
  onAvatarPress?: () => void;
};

export function AppShell({ activeTab, onTabChange, balance, username, children, phoneContent, onAvatarPress }: Props) {
  const [clock, setClock] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);

  // Keep clock ticking
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  // When phone tab pressed, toggle phone overlay instead of switching content
  const handleTabPress = (tab: AppTab) => {
    if (tab === 'phone') {
      setPhoneOpen(p => !p);
      return;
    }
    setPhoneOpen(false);
    onTabChange(tab);
  };

  const NAV = [
    { id: 'home' as AppTab,  label: 'Home',  icon: '🏠' },
    { id: 'buy'  as AppTab,  label: 'Buy',   icon: '🛒' },
    { id: 'map'  as AppTab,  label: 'Map',   icon: '🗺️' },
    { id: 'phone'as AppTab,  label: 'Phone', icon: '📱' },
  ];

  return (
    <div className="game-shell">

      {/* ── Game canvas layer (fills entire screen) ── */}
      <div className="game-canvas-layer">
        {children}
      </div>

      {/* ── HUD overlay ── */}
      <div className="hud-top">
        {/* Left: avatar + time */}
        <div className="hud-left" onClick={onAvatarPress}>
          <div className="hud-avatar-dot" />
          <div className="hud-time-block">
            <span className="hud-clock">{clock}</span>
          </div>
        </div>

        {/* Right: balance */}
        <div className="hud-right">
          <div className="hud-balance-pill">
            <span className="hud-balance-amount">
              ₦{(balance ?? 0).toLocaleString('en-NG')}
            </span>
            <button className="hud-add-btn">+</button>
          </div>
        </div>
      </div>

      {/* ── Phone slide-up overlay ── */}
      {phoneContent && (
        <div className={cn('phone-launcher', phoneOpen && 'phone-launcher--open')}>
          <div className="phone-launcher-handle" onClick={() => setPhoneOpen(false)} />
          <div className="phone-launcher-header">
            <span className="phone-launcher-time">{clock}</span>
            <span className="phone-launcher-close" onClick={() => setPhoneOpen(false)}>✕ Close</span>
          </div>
          <div className="phone-launcher-body">
            {phoneContent}
          </div>
        </div>
      )}

      {/* ── Scrim behind phone overlay ── */}
      {phoneOpen && (
        <div className="phone-scrim" onClick={() => setPhoneOpen(false)} />
      )}

      {/* ── Bottom nav ── */}
      <nav className="game-nav">
        {NAV.map(({ id, label, icon }) => {
          const active = id === 'phone' ? phoneOpen : (activeTab === id && !phoneOpen);
          return (
            <button
              key={id}
              className={cn('game-nav-btn', active && 'game-nav-btn--active')}
              onClick={() => handleTabPress(id)}
              aria-label={label}
            >
              <span className="game-nav-icon">{icon}</span>
              <span className="game-nav-label">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
