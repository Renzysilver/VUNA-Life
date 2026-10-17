import { Application } from 'pixi.js';

let app: Application | null = null;

export async function createPixiApp(canvas: HTMLCanvasElement): Promise<Application> {
  if (app) return app;
  app = new Application();
  // Read actual container dimensions so the canvas fills whatever space it's given
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth || 390 : 390;
  const h = parent ? parent.clientHeight || 640 : 640;

  await app.init({
    canvas,
    width: w,
    height: h,
    backgroundColor: 0x0a1628,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    resizeTo: parent ?? undefined,
  });
  return app;
}

export function getPixiApp(): Application | null { return app; }

export function destroyPixiApp(): void {
  if (app) { app.destroy(false, { children: true, texture: true }); app = null; }
}
