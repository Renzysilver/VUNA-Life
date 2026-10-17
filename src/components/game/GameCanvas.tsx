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

  useEffect(() => {
    if (!canvasRef.current) return;
    let mounted = true;
    (async () => {
      const app = await createPixiApp(canvasRef.current!);
      if (!mounted) return;
      await mountCampusMap(app, { avatarConfig, onBuildingTap });
    })();
    return () => { mounted = false; destroyPixiApp(); };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
