/**
 * MapScreen — full-screen campus map.
 *
 * Phase 1 (this file): renders the traced SVG full-bleed with:
 *   - pan and pinch-zoom (via CSS transform)
 *   - tappable building hit areas (transparent polygons over the SVG)
 *   - bottom sheet that slides up on tap: building name, status, and
 *     a placeholder "Activities coming in Phase 5" message
 *
 * Phase 5: replace the SVG background with MapLibre GL and wire up
 *   real activities, check-in, and presence dots.
 *
 * The SVG and JSON are served from /public/campus/.
 * Copy veritas_game_map.svg and veritas_campus_map.json there.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { X, MapPin, Info } from 'lucide-react';
import { ActivitiesSheet } from '@/components/social/activities-sheet';

// ── Types ────────────────────────────────────────────────────────────────
type BuildingRecord = {
  id: string | number;
  name: string | null;
  category: string;
  gender_attr: string | null;
  status: string;
  footprints: Array<{
    polygon_px: [number, number][];
  }>;
};

type CampusData = {
  buildings: BuildingRecord[];
};

type SelectedBuilding = {
  id: string | number;
  name: string | null;
  category: string;
  status: string;
  gender_attr: string | null;
};

// ── Component ────────────────────────────────────────────────────────────
export function MapScreen() {
  const [campusData, setCampusData] = useState<CampusData | null>(null);
  const [selected, setSelected] = useState<SelectedBuilding | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // SVG natural dimensions (from build_map.py viewport)
  const SVG_W = 1080;
  const SVG_H = 1817;

  useEffect(() => {
    fetch('/campus/veritas_campus_map.json')
      .then(r => r.json())
      .then(d => setCampusData(d))
      .catch(() => {});
  }, []);

  const handleBuildingTap = (b: BuildingRecord) => {
    setSelected({
      id: b.id,
      name: b.name,
      category: b.category,
      status: b.status,
      gender_attr: b.gender_attr,
    });
  };

  return (
    <div className="relative w-full h-[calc(100svh-8rem)] overflow-hidden bg-[oklch(0.22_0.04_145)]">

      {/* ── SVG map, full-bleed ─────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* The SVG is embedded via <img> so it renders exactly as exported.
            Hit areas are overlaid via a positioned <svg> on top. */}
        <div
          className="relative"
          style={{
            width:  SVG_W,
            height: SVG_H,
            minWidth:  '100%',
            minHeight: '100%',
          }}
        >
          {/* Base map image */}
          <img
            src="/campus/veritas_game_map.svg"
            alt="Veritas University campus map"
            width={SVG_W}
            height={SVG_H}
            className="absolute inset-0 w-full h-full select-none pointer-events-none"
            draggable={false}
          />

          {/* Hit area overlay */}
          {campusData && (
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{ touchAction: 'none' }}
            >
              {campusData.buildings.map((b) =>
                b.footprints.map((fp, fi) => (
                  <polygon
                    key={`${b.id}-${fi}`}
                    points={fp.polygon_px.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="transparent"
                    stroke={selected?.id === b.id ? 'oklch(0.72 0.16 68)' : 'transparent'}
                    strokeWidth={selected?.id === b.id ? 2 : 0}
                    className="cursor-pointer"
                    onClick={() => handleBuildingTap(b)}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      handleBuildingTap(b);
                    }}
                  />
                ))
              )}
            </svg>
          )}
        </div>
      </div>

      {/* ── Map legend chip ──────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 hud-card px-3 py-2 flex items-center gap-2 text-[11px] pointer-events-none">
        <MapPin className="h-3.5 w-3.5 text-[var(--cc-gold)]" />
        <span>Tap a building</span>
      </div>

      {/* ── Phase label chip ──────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 hud-card px-3 py-2 flex items-center gap-1.5 text-[11px] pointer-events-none">
        <Info className="h-3 w-3 opacity-60" />
        <span className="opacity-60">Phase 1 map</span>
      </div>

      {/* ── Building bottom sheet (Phase 5: real activities + who-is-here) ─ */}
      {selected && (
        <ActivitiesSheet
          building={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
