/**
 * HomeScreen — shows the player's current location as an isometric scene.
 * Default: dorm room interior with 3 bunk beds + avatar.
 * Uses PixiJS via GameCanvas but mounts the dorm-room scene instead of campus map.
 */

'use client';

import { useEffect, useRef } from 'react';
import { createPixiApp, destroyPixiApp } from '@/lib/game/pixi-app';
import { mountDormRoom } from '@/lib/game/dorm-room';

export function HomeScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let mounted = true;

    const init = async () => {
      await new Promise<void>((res) => requestAnimationFrame(() => res()));
      if (!mounted || !canvasRef.current) return;
      // Destroy any existing pixi instance (e.g. map was open before)
      destroyPixiApp();
      const app = await createPixiApp(canvasRef.current);
      if (!mounted) return;
      await mountDormRoom(app);
    };

    init();
    return () => {
      mounted = false;
      destroyPixiApp();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, background: '#0d0805' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
