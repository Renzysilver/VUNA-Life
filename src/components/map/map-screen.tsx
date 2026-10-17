/**
 * MapScreen — PixiJS isometric campus map (Phase 8 visual overhaul)
 * Replaces the flat SVG map with a real game canvas:
 * - PixiJS isometric buildings with depth and shadows
 * - Draggable by touch/mouse
 * - Building labels as floating dark pills
 * - Map HUD: time + day mode (top left), ₦ balance (top right), avatar circle (bottom left)
 * - Tapping a building → ActivitiesSheet
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { GameCanvas } from '@/components/game/GameCanvas';
import { ActivitiesSheet } from '@/components/social/activities-sheet';
import { ProfileAvatar } from '@/components/avatar/profile-avatar';

type BuildingInfo = {
  id: string | number;
  name: string | null;
  category: string;
  status: string;
  gender_attr: string | null;
};

export function MapScreen() {
  const [selected, setSelected] = useState<BuildingInfo | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 10000);
    // Fetch wallet balance for the HUD
    fetch('/api/wallet', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setBalance(d.wallet.balance); })
      .catch(() => {});
    return () => clearInterval(id);
  }, []);

  const handleBuildingTap = (buildingId: string) => {
    // Map PixiJS building IDs to building info. For now, use a simple lookup.
    // In production, this would fetch from /api/buildings and match by pin.
    setSelected({
      id: buildingId,
      name: buildingId.charAt(0).toUpperCase() + buildingId.slice(1).replace(/_/g, ' '),
      category: 'academic',
      status: 'USER_CONFIRMED',
      gender_attr: null,
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a1628' }}>
      {/* PixiJS game canvas */}
      <GameCanvas
        userId=""
        avatarConfig={{}}
        onBuildingTap={handleBuildingTap}
      />

      {/* Map HUD */}
      <div className="map-hud">
        <div className="hud-left">
          <div className="hud-time">{currentTime}</div>
          <div className="hud-day-mode">☀️ Day mode</div>
        </div>
        <div className="hud-right">
          <span className="hud-balance">₦{balance.toLocaleString('en-NG')}</span>
          <button className="hud-add-btn" onClick={() => {}}>+</button>
        </div>
      </div>

      {/* Avatar circle */}
      <div className="map-avatar-hud">
        <div className="avatar-hud-circle">
          <ProfileAvatar size="tiny" />
        </div>
      </div>

      {/* Building bottom sheet */}
      {selected && (
        <ActivitiesSheet
          building={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
