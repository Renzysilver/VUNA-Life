'use client';
import { useEffect, useRef } from 'react';
import { createPixiApp, destroyPixiApp } from '@/lib/game/pixi-app';
import { mountCampusMap } from '@/lib/game/campus-map';

interface GameCanvasProps {
  userId: string;
  avatarConfig: any;
  onBuildingTap: (buildingId: string) => void;
}

export function GameCanvas({ userId, avatarConfig, onBuildingTap }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    let mounted = true;

    const init = async () => {
      // Wait one animation frame so the flex container has settled its height
      await new Promise<void>((res) => requestAnimationFrame(() => res()));
      if (!mounted || !canvasRef.current) return;
      const app = await createPixiApp(canvasRef.current);
      if (!mounted) return;
      await mountCampusMap(app, { avatarConfig, onBuildingTap });
    };

    init();

    return () => {
      mounted = false;
      destroyPixiApp();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
