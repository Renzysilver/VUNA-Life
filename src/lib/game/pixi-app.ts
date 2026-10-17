import { Application } from 'pixi.js';

let app: Application | null = null;

export async function createPixiApp(canvas: HTMLCanvasElement): Promise<Application> {
  if (app) return app;
  app = new Application();
  await app.init({
    canvas,
    width: 390,
    height: 780,
    backgroundColor: 0x0a1628,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  return app;
}

export function getPixiApp(): Application | null { return app; }

export function destroyPixiApp(): void {
  if (app) { app.destroy(false, { children: true, texture: true }); app = null; }
}
