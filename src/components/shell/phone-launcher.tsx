/**
 * PhoneLauncher — the app grid that slides up when you tap the Phone nav button.
 * Lagos Life-style: gradient background, 4-column icon grid, scrollable.
 */

'use client';

const APPS = [
  { id: 'wallet',    label: 'Wallet',      bg: 'linear-gradient(135deg,#2d6a4f,#52b788)', emoji: '💰' },
  { id: 'messages',  label: 'Messages',    bg: 'linear-gradient(135deg,#6b3fa0,#9b59b6)', emoji: '💬', badge: 3 },
  { id: 'timetable', label: 'Timetable',   bg: 'linear-gradient(135deg,#1a3a6b,#2980b9)', emoji: '📅' },
  { id: 'chapel',    label: 'Mass',        bg: 'linear-gradient(135deg,#8a1c1c,#c0392b)', emoji: '⛪', badge: 1 },
  { id: 'hustle',    label: 'Side Hustle', bg: 'linear-gradient(135deg,#b8860b,#f39c12)', emoji: '⚡' },
  { id: 'profile',   label: 'Profile',     bg: 'linear-gradient(135deg,#e07b39,#e67e22)', emoji: '👤' },
  { id: 'wardrobe',  label: 'Wardrobe',    bg: 'linear-gradient(135deg,#b0416a,#e91e8c)', emoji: '👗' },
  { id: 'people',    label: 'People',      bg: 'linear-gradient(135deg,#0f3460,#16213e)', emoji: '👥' },
  { id: 'canteen',   label: 'Canteen',     bg: 'linear-gradient(135deg,#a05520,#e07b39)', emoji: '🍽️' },
  { id: 'goals',     label: 'Goals',       bg: 'linear-gradient(135deg,#1a6b3a,#27ae60)', emoji: '🎯' },
  { id: 'feedback',  label: 'Feedback',    bg: 'linear-gradient(135deg,#2c3e50,#4a6fa5)', emoji: '📣' },
  { id: 'settings',  label: 'Settings',    bg: 'linear-gradient(135deg,#2c3e50,#34495e)', emoji: '⚙️' },
];

type Props = {
  onOpen: (appId: string) => void;
};

export function PhoneLauncher({ onOpen }: Props) {
  return (
    <div className="launcher-grid">
      {APPS.map(app => (
        <button
          key={app.id}
          className="launcher-app"
          onClick={() => onOpen(app.id)}
        >
          {app.badge != null && app.badge > 0 && (
            <span className="launcher-badge">{app.badge}</span>
          )}
          <div className="launcher-icon" style={{ background: app.bg }}>
            <span className="launcher-emoji">{app.emoji}</span>
          </div>
          <span className="launcher-label">{app.label}</span>
        </button>
      ))}
    </div>
  );
}
