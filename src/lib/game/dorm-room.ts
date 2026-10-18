/**
 * Dorm Room — isometric interior scene
 * 3 bunk beds (6 spots), tiled floor, walls, avatar
 * Lagos Life-style warm interior lighting
 */
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

// Tile dimensions for the interior (wider tiles feel more room-like)
const TW = 80;
const TH = 40;

function ix(col: number, row: number) { return (col - row) * (TW / 2); }
function iy(col: number, row: number) { return (col + row) * (TH / 2); }

const C = {
  floor:      0x8b6914,  // warm wooden tile
  floorAlt:   0x7a5c10,  // checkerboard alt
  wallLeft:   0x3a2a1a,  // dark brown wall
  wallRight:  0x4a3522,
  wallTop:    0x5a4530,
  ceiling:    0x1a0f05,
  bedFrame:   0x5c3d1e,  // dark wood
  bedSide:    0x3d2810,
  mattress:   0xc8b89a,  // cream
  mattressAlt:0x9b8870,
  pillow:     0xeeeae0,
  blanketB:   0x3a5c8a,  // blue blanket
  blanketG:   0x2d6a4f,  // green blanket
  blanketR:   0x7a2020,  // red blanket
  ladder:     0x6b4c22,
  floor_edge: 0x2a1a08,
  light:      0xfff5c0,
  skin:       0xc68642,
  shirt:      0x2451a0,
  trousers:   0x1a1a2e,
};

// Room grid: 8 wide × 6 deep
const ROOM_W = 8;
const ROOM_D = 6;
const WALL_H  = 110; // px height of walls

export async function mountDormRoom(app: Application) {
  const stage = app.stage;
  stage.removeChildren();

  const W = app.screen.width;
  const H = app.screen.height;

  // Centre the iso origin so room fits nicely
  const originX = W / 2;
  const originY = H * 0.28;

  const root = new Container();
  root.x = originX;
  root.y = originY;
  stage.addChild(root);

  // ── 1. Back walls ──────────────────────────────────────────────────────
  const walls = new Graphics();

  // Left wall (back-left face)
  {
    const x0 = ix(0, 0), y0 = iy(0, 0);
    const x1 = ix(ROOM_W, 0), y1 = iy(ROOM_W, 0);
    const x2 = ix(0, ROOM_D), y2 = iy(0, ROOM_D);
    // Back-left wall
    walls.poly([
      x0, y0,
      x0, y0 - WALL_H,
      x2, y2 - WALL_H,
      x2, y2,
    ]).fill({ color: C.wallLeft });
    // Back-right wall
    walls.poly([
      x0, y0,
      x0, y0 - WALL_H,
      x1, y1 - WALL_H,
      x1, y1,
    ]).fill({ color: C.wallRight });
    // Ceiling strip
    walls.poly([
      x0, y0 - WALL_H,
      x1, y1 - WALL_H,
      ix(ROOM_W, ROOM_D), iy(ROOM_W, ROOM_D) - WALL_H,
      x2, y2 - WALL_H,
    ]).fill({ color: C.ceiling });

    // Wall edge lines
    walls.moveTo(x0, y0 - WALL_H).lineTo(x0, y0).stroke({ color: C.floor_edge, width: 1.5, alpha: 0.5 });
    walls.moveTo(x1, y1 - WALL_H).lineTo(x1, y1).stroke({ color: C.floor_edge, width: 1.5, alpha: 0.5 });
    walls.moveTo(x2, y2 - WALL_H).lineTo(x2, y2).stroke({ color: C.floor_edge, width: 1.5, alpha: 0.5 });
  }

  // Ceiling light glow
  const lightX = ix(ROOM_W / 2, ROOM_D / 2);
  const lightY = iy(ROOM_W / 2, ROOM_D / 2) - WALL_H + 10;
  walls.ellipse(lightX, lightY, 60, 20).fill({ color: C.light, alpha: 0.12 });

  root.addChild(walls);

  // ── 2. Floor tiles ─────────────────────────────────────────────────────
  const floor = new Graphics();
  for (let c = 0; c < ROOM_W; c++) {
    for (let r = 0; r < ROOM_D; r++) {
      const alt = (c + r) % 2 === 0;
      const sx = ix(c, r), sy = iy(c, r);
      floor.poly([
        sx,          sy,
        sx + TW/2,   sy - TH/2,
        sx + TW,     sy,
        sx + TW/2,   sy + TH/2,
      ]).fill({ color: alt ? C.floor : C.floorAlt });
    }
  }
  // Floor edge shadow
  for (let c = 0; c < ROOM_W; c++) {
    const sx = ix(c, ROOM_D), sy = iy(c, ROOM_D);
    floor.moveTo(sx, sy).lineTo(sx + TW/2, sy + TH/2).stroke({ color: C.floor_edge, width: 2, alpha: 0.7 });
  }
  for (let r = 0; r < ROOM_D; r++) {
    const sx = ix(ROOM_W, r), sy = iy(ROOM_W, r);
    floor.moveTo(sx, sy).lineTo(sx + TW/2, sy + TH/2).stroke({ color: C.floor_edge, width: 2, alpha: 0.7 });
  }
  root.addChild(floor);

  // ── 3. Bunk beds ───────────────────────────────────────────────────────
  // 3 bunk beds arranged along the left and right walls
  const BUNKS = [
    { col: 0.3, row: 0.3, blanket: C.blanketB, blanket2: C.blanketG },  // left wall top
    { col: 0.3, row: 2.0, blanket: C.blanketR, blanket2: C.blanketB },  // left wall mid
    { col: 0.3, row: 3.7, blanket: C.blanketG, blanket2: C.blanketR },  // left wall bot
  ];

  const beds = new Graphics();
  for (const b of BUNKS) {
    drawBunk(beds, ix(b.col, b.row), iy(b.col, b.row), b.blanket, b.blanket2);
  }
  root.addChild(beds);

  // ── 4. Avatar (player) ─────────────────────────────────────────────────
  const avatar = new Graphics();
  const ax = ix(4.5, 3.5), ay = iy(4.5, 3.5);
  drawAvatar(avatar, ax, ay);
  root.addChild(avatar);

  // ── 5. Room label ─────────────────────────────────────────────────────
  const label = new Text({
    text: 'Your Dorm Room',
    style: new TextStyle({
      fill: 0xfff5c0,
      fontSize: 13,
      fontFamily: 'Space Grotesk, sans-serif',
      fontWeight: '600',
      alpha: 0.7,
    }),
  });
  label.x = -label.width / 2;
  label.y = -WALL_H - 20;
  root.addChild(label);

  // Ambient light pulse (subtle)
  let t = 0;
  app.ticker.add(() => {
    t += 0.02;
    const alpha = 0.06 + Math.sin(t) * 0.02;
    walls.alpha = 1; // walls solid
    // Subtle avatar breathing
    avatar.scale.set(1 + Math.sin(t * 0.5) * 0.005);
  });
}

function drawBunk(g: Graphics, sx: number, sy: number, topBlanket: number, botBlanket: number) {
  const BW = TW * 1.5; // bed width in iso
  const BD = TH * 1.2; // bed depth
  const FRAME_H = 22;   // lower bunk height
  const TOP_H   = 48;   // upper bunk height from ground

  // ── Lower bunk ──
  // Frame left face
  g.poly([sx, sy, sx, sy - FRAME_H, sx - BW/2, sy - BD/2 - FRAME_H, sx - BW/2, sy - BD/2]).fill({ color: C.bedSide });
  // Frame right face
  g.poly([sx, sy, sx, sy - FRAME_H, sx + BW/2, sy - BD/2 - FRAME_H, sx + BW/2, sy - BD/2]).fill({ color: C.bedFrame });
  // Mattress top
  g.poly([
    sx - BW/2,   sy - BD/2 - FRAME_H,
    sx,          sy - FRAME_H,
    sx + BW/2,   sy - BD/2 - FRAME_H,
    sx,          sy - BD - FRAME_H,
  ]).fill({ color: C.mattress });
  // Blanket patch
  g.poly([
    sx - BW/3,   sy - BD/2 - FRAME_H + 2,
    sx,          sy - FRAME_H + 2,
    sx + BW/3,   sy - BD/2 - FRAME_H + 2,
    sx,          sy - BD/2*1.3 - FRAME_H + 2,
  ]).fill({ color: botBlanket, alpha: 0.85 });
  // Pillow
  g.poly([
    sx - BW/4,   sy - BD - FRAME_H + 3,
    sx,          sy - BD/2*1.5 - FRAME_H + 3,
    sx + BW/4,   sy - BD - FRAME_H + 3,
    sx,          sy - BD*1.15 - FRAME_H + 3,
  ]).fill({ color: C.pillow });

  // ── Upper bunk ──
  const uy = sy - TOP_H;
  // Frame left
  g.poly([sx, uy, sx, uy - FRAME_H, sx - BW/2, uy - BD/2 - FRAME_H, sx - BW/2, uy - BD/2]).fill({ color: C.bedSide });
  // Frame right
  g.poly([sx, uy, sx, uy - FRAME_H, sx + BW/2, uy - BD/2 - FRAME_H, sx + BW/2, uy - BD/2]).fill({ color: C.bedFrame });
  // Mattress
  g.poly([
    sx - BW/2,   uy - BD/2 - FRAME_H,
    sx,          uy - FRAME_H,
    sx + BW/2,   uy - BD/2 - FRAME_H,
    sx,          uy - BD - FRAME_H,
  ]).fill({ color: C.mattressAlt });
  // Blanket
  g.poly([
    sx - BW/3,   uy - BD/2 - FRAME_H + 2,
    sx,          uy - FRAME_H + 2,
    sx + BW/3,   uy - BD/2 - FRAME_H + 2,
    sx,          uy - BD/2*1.3 - FRAME_H + 2,
  ]).fill({ color: topBlanket, alpha: 0.85 });
  // Pillow
  g.poly([
    sx - BW/4,   uy - BD - FRAME_H + 3,
    sx,          uy - BD/2*1.5 - FRAME_H + 3,
    sx + BW/4,   uy - BD - FRAME_H + 3,
    sx,          uy - BD*1.15 - FRAME_H + 3,
  ]).fill({ color: C.pillow });

  // ── Ladder (right side) ──
  const lx = sx + BW/2 - 4;
  for (let i = 0; i < 3; i++) {
    const ly = sy - 8 - i * 13;
    g.moveTo(lx, ly).lineTo(lx, ly - 10).stroke({ color: C.ladder, width: 3 });
  }
  g.moveTo(lx - 8, sy - 5).lineTo(lx + 4, sy - 5).stroke({ color: C.ladder, width: 2 });
  g.moveTo(lx - 8, sy - 18).lineTo(lx + 4, sy - 18).stroke({ color: C.ladder, width: 2 });
  g.moveTo(lx - 8, sy - 31).lineTo(lx + 4, sy - 31).stroke({ color: C.ladder, width: 2 });
}

function drawAvatar(g: Graphics, sx: number, sy: number) {
  // Shadow
  g.ellipse(sx, sy + 2, 12, 5).fill({ color: 0x000000, alpha: 0.35 });
  // Legs / trousers
  g.rect(sx - 5, sy - 22, 4, 14).fill({ color: C.trousers });
  g.rect(sx + 1, sy - 22, 4, 14).fill({ color: C.trousers });
  // Shoes
  g.rect(sx - 6, sy - 9, 5, 4).fill({ color: 0x111111 });
  g.rect(sx + 1, sy - 9, 5, 4).fill({ color: 0x111111 });
  // Body / shirt
  g.rect(sx - 6, sy - 40, 12, 19).fill({ color: C.shirt });
  // Arms
  g.rect(sx - 10, sy - 39, 4, 12).fill({ color: C.shirt });
  g.rect(sx + 6,  sy - 39, 4, 12).fill({ color: C.shirt });
  // Hands
  g.circle(sx - 8, sy - 28, 3).fill({ color: C.skin });
  g.circle(sx + 8, sy - 28, 3).fill({ color: C.skin });
  // Neck
  g.rect(sx - 3, sy - 44, 6, 5).fill({ color: C.skin });
  // Head
  g.roundRect(sx - 7, sy - 58, 14, 15, 4).fill({ color: C.skin });
  // Eyes
  g.circle(sx - 3, sy - 52, 1.5).fill({ color: 0x222222 });
  g.circle(sx + 3, sy - 52, 1.5).fill({ color: 0x222222 });
  // Hair
  g.roundRect(sx - 7, sy - 58, 14, 7, 4).fill({ color: 0x1a0a00 });
}
