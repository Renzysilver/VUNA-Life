import { Application } from 'pixi.js';

let app: Application | null = null;
let currentCanvas: HTMLCanvasElement | null = null;

export async function createPixiApp(canvas: HTMLCanvasElement): Promise<Application> {
  // Re-use existing app if same canvas
  if (app && currentCanvas === canvas) return app;
  // Destroy old one if switching canvas
  if (app) { app.destroy(false, { children: true, texture: true }); app = null; }

  const parent = canvas.parentElement;
  const w = parent ? (parent.clientWidth  || 390) : 390;
  const h = parent ? (parent.clientHeight || 700) : 700;

  app = new Application();
  await app.init({
    canvas,
    width: w,
    height: h,
    backgroundColor: 0x050d1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    resizeTo: parent ?? undefined,
  });
  currentCanvas = canvas;
  return app;
}

export function getPixiApp(): Application | null { return app; }

export function destroyPixiApp(): void {
  if (app) {
    app.destroy(false, { children: true, texture: true });
    app = null;
    currentCanvas = null;
  }
}
