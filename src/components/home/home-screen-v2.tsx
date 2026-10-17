/**
 * HomeScreenV2 — phone app grid (Phase 8 visual overhaul)
 * Replaces the old game-HUD layout with a mobile home screen:
 * 8 app icons in a 4-column grid, ticker, balance pill, today strip.
 */

'use client';
import { useState, useEffect } from 'react';

const APP_ICONS = [
  { id: 'map',       label: 'Campus Map',  emoji: '🗺️',  colour: '#1a3a6b', badge: 0,  route: 'map'      },
  { id: 'wallet',    label: 'Wallet',      emoji: '💰',  colour: '#2d6a4f', badge: 0,  route: 'wallet'   },
  { id: 'messages',  label: 'Messages',    emoji: '💬',  colour: '#6b3fa0', badge: 3,  route: 'people'   },
  { id: 'timetable', label: 'Timetable',   emoji: '📅',  colour: '#3d5a80', badge: 0,  route: 'timetable' },
  { id: 'hustle',    label: 'Side Hustle', emoji: '⚡',  colour: '#c9a227', badge: 0,  route: 'hustle'   },
  { id: 'profile',   label: 'Profile',     emoji: '👤',  colour: '#e07b39', badge: 0,  route: 'profile'  },
  { id: 'chapel',    label: 'Mass',        emoji: '⛪',  colour: '#8a1c1c', badge: 1,  route: 'chapel'   },
  { id: 'wardrobe',  label: 'Wardrobe',    emoji: '👗',  colour: '#b0416a', badge: 0,  route: 'wardrobe' },
];

const TICKERS = [
  '📣 Chapel mass today at 7:00 AM — don\'t miss it',
  '💸 Monthly allowance dropped — check your wallet',
  '📚 Assignment due Friday — check timetable',
  '🌟 Welcome to Veritas University Abuja',
];

export function HomeScreenV2({ user, onNavigate, balanceNaira }: { user: any; onNavigate: (r: string) => void; balanceNaira: number }) {
  const [ticker, setTicker] = useState(0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    const t = setInterval(() => setTicker(p => (p + 1) % TICKERS.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="home-phone-screen">
      <div className="home-wallpaper" />

      <div className="home-ticker">
        <span className="ticker-dot" />
        <span>{TICKERS[ticker]}</span>
      </div>

      <div className="home-greeting">
        <div className="home-greeting-name">{greeting}, {user?.username || user?.displayName || 'student'} 👋</div>
        <div className="home-balance-pill">
          <span className="balance-label">Balance</span>
          <span className="balance-amount">₦{balanceNaira.toLocaleString('en-NG')}</span>
        </div>
      </div>

      <div className="home-app-grid">
        {APP_ICONS.map(app => (
          <button key={app.id} className="home-app-icon" onClick={() => onNavigate(app.route)} style={{ '--icon-colour': app.colour } as React.CSSProperties}>
            {app.badge > 0 && <span className="app-badge">{app.badge}</span>}
            <div className="icon-face"><span className="icon-emoji">{app.emoji}</span></div>
            <span className="icon-label">{app.label}</span>
          </button>
        ))}
      </div>

      <div className="home-today-strip">
        <div className="today-strip-title">TODAY</div>
        <div className="today-items">
          <div className="today-item today-item--urgent"><span className="today-icon">⛪</span><span className="today-label">Chapel Mass</span><span className="today-time">7:00 AM</span></div>
          <div className="today-item"><span className="today-icon">📚</span><span className="today-label">BUS 201 Lecture</span><span className="today-time">9:00 AM</span></div>
          <div className="today-item"><span className="today-icon">🍽️</span><span className="today-label">Canteen opens</span><span className="today-time">12:00 PM</span></div>
        </div>
      </div>
    </div>
  );
}
