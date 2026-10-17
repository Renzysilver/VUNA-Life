import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';

const COLOURS = {
  ground: 0x1a2e1a, road: 0x2d3436,
  academic: 0x1a3a6b, academicRoof: 0x2451a0,
  chapel: 0xc9a227, chapelRoof: 0xe8c547,
  canteen: 0xe07b39, canteenRoof: 0xf09855,
  hostelMale: 0x2d6a4f, hostelMaleRoof: 0x3d8a65,
  hostelFemale: 0x6b3fa0, hostelFemaleRoof: 0x8a55c0,
  admin: 0x3d5a80, adminRoof: 0x4e72a0,
  sports: 0x52b788,
  gatePillar: 0xd4a853,
  tree: 0x2d6a4f, treeDark: 0x1e4d38,
};

const TILE_W = 64;
const TILE_H = 32;
const MAP_COLS = 16;
const MAP_ROWS = 16;

function isoX(col: number, row: number): number { return (col - row) * (TILE_W / 2); }
function isoY(col: number, row: number): number { return (col + row) * (TILE_H / 2); }

const BUILDINGS = [
  { id: 'gate', label: 'Main Gate', col: 6, row: 14, w: 4, d: 1, h: 80, face: COLOURS.gatePillar, roof: COLOURS.gatePillar, side: 0xa07830 },
  { id: 'admin', label: 'Admin Block', col: 4, row: 12, w: 3, d: 2, h: 55, face: COLOURS.admin, roof: COLOURS.adminRoof, side: 0x2d4060 },
  { id: 'chapel', label: 'Chapel', col: 6, row: 7, w: 4, d: 3, h: 90, face: COLOURS.chapel, roof: COLOURS.chapelRoof, side: 0x8a6e1a },
  { id: 'sci_block', label: 'Science Block', col: 3, row: 5, w: 4, d: 3, h: 60, face: COLOURS.academic, roof: COLOURS.academicRoof, side: 0x102850 },
  { id: 'arts_block', label: 'Arts Block', col: 9, row: 5, w: 4, d: 3, h: 60, face: COLOURS.academic, roof: COLOURS.academicRoof, side: 0x102850 },
  { id: 'law_block', label: 'Law Faculty', col: 3, row: 9, w: 3, d: 2, h: 55, face: COLOURS.academic, roof: COLOURS.academicRoof, side: 0x102850 },
  { id: 'library', label: 'Library', col: 6, row: 4, w: 3, d: 3, h: 65, face: 0x2c5f8a, roof: 0x3a7aaa, side: 0x1a3d5c },
  { id: 'canteen', label: 'Canteen', col: 6, row: 10, w: 3, d: 2, h: 40, face: COLOURS.canteen, roof: COLOURS.canteenRoof, side: 0xa05520 },
  { id: 'hostel_m1', label: 'Marist Hostel', col: 11, row: 6, w: 2, d: 4, h: 70, face: COLOURS.hostelMale, roof: COLOURS.hostelMaleRoof, side: 0x1e4d38 },
  { id: 'hostel_m2', label: 'St. Joseph', col: 11, row: 2, w: 2, d: 4, h: 70, face: COLOURS.hostelMale, roof: COLOURS.hostelMaleRoof, side: 0x1e4d38 },
  { id: 'hostel_f1', label: 'Assumpta Hostel', col: 1, row: 6, w: 2, d: 4, h: 70, face: COLOURS.hostelFemale, roof: COLOURS.hostelFemaleRoof, side: 0x4a2870 },
  { id: 'hostel_f2', label: 'Veritas Hostel', col: 1, row: 2, w: 2, d: 4, h: 70, face: COLOURS.hostelFemale, roof: COLOURS.hostelFemaleRoof, side: 0x4a2870 },
  { id: 'sports', label: 'Sports Complex', col: 4, row: 1, w: 5, d: 2, h: 20, face: COLOURS.sports, roof: COLOURS.sports, side: 0x38845e },
];

function drawIsometricBuilding(g: Graphics, sx: number, sy: number, w: number, d: number, h: number, face: number, roof: number, side: number) {
  const hw = (TILE_W * w) / 2;
  const hh = (TILE_H * d) / 2;
  // Left face
  g.poly([sx - hw, sy, sx, sy - hh, sx, sy - hh - h, sx - hw, sy - h]).fill({ color: side });
  // Right face
  g.poly([sx, sy - hh, sx + hw, sy, sx + hw, sy - h, sx, sy - hh - h]).fill({ color: face });
  // Roof
  g.poly([sx - hw, sy - h, sx, sy - hh - h, sx + hw, sy - h, sx, sy + hh - h]).fill({ color: roof });
  // Roof highlight
  g.poly([sx - hw, sy - h, sx, sy - hh - h, sx + hw, sy - h]).stroke({ color: 0xffffff, alpha: 0.15, width: 1 });
}

function drawGround(g: Graphics) {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const sx = isoX(col, row); const sy = isoY(col, row);
      g.poly([sx, sy, sx + TILE_W/2, sy + TILE_H/2, sx, sy + TILE_H, sx - TILE_W/2, sy + TILE_H/2])
        .fill({ color: (col + row) % 2 === 0 ? 0x1e3620 : 0x1a2e1a });
    }
  }
}

function drawRoads(g: Graphics) {
  for (let row = 0; row < MAP_ROWS; row++) {
    const sx = isoX(7, row); const sy = isoY(7, row);
    g.poly([sx, sy, sx + TILE_W/2, sy + TILE_H/2, sx, sy + TILE_H, sx - TILE_W/2, sy + TILE_H/2]).fill({ color: COLOURS.road });
  }
  for (let col = 0; col < MAP_COLS; col++) {
    const sx = isoX(col, 8); const sy = isoY(col, 8);
    g.poly([sx, sy, sx + TILE_W/2, sy + TILE_H/2, sx, sy + TILE_H, sx - TILE_W/2, sy + TILE_H/2]).fill({ color: COLOURS.road });
  }
}

function drawTree(g: Graphics, sx: number, sy: number) {
  g.rect(sx - 3, sy - 8, 6, 10).fill({ color: 0x6b4226 });
  g.circle(sx, sy - 16, 10).fill({ color: COLOURS.treeDark });
  g.circle(sx - 4, sy - 20, 8).fill({ color: COLOURS.tree });
  g.circle(sx + 4, sy - 20, 8).fill({ color: COLOURS.tree });
  g.circle(sx, sy - 24, 9).fill({ color: COLOURS.tree });
}

function buildingLabel(container: Container, text: string, sx: number, sy: number, h: number) {
  const pill = new Container();
  const bg = new Graphics();
  const style = new TextStyle({ fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, fill: 0xffffff, fontWeight: '600' });
  const label = new Text({ text, style }); label.resolution = 2;
  const pad = 8;
  bg.roundRect(-label.width/2 - pad, -label.height/2 - 4, label.width + pad*2, label.height + 8, 20)
    .fill({ color: 0x111827, alpha: 0.85 });
  bg.roundRect(-label.width/2 - pad, -label.height/2 - 4, label.width + pad*2, label.height + 8, 20)
    .stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
  label.anchor.set(0.5, 0.5);
  pill.addChild(bg, label);
  pill.x = sx; pill.y = sy - h - 20;
  container.addChild(pill);
}

export async function mountCampusMap(app: Application, opts: { avatarConfig: any; onBuildingTap: (id: string) => void }) {
  const stage = app.stage;
  stage.removeChildren();
  const mapContainer = new Container();
  mapContainer.x = app.screen.width / 2;
  mapContainer.y = 120;
  stage.addChild(mapContainer);

  const groundG = new Graphics();
  drawGround(groundG);
  mapContainer.addChild(groundG);

  const roadG = new Graphics();
  drawRoads(roadG);
  mapContainer.addChild(roadG);

  const sorted = [...BUILDINGS].sort((a, b) => (a.col + a.row) - (b.col + b.row));
  const labelsContainer = new Container();

  for (const b of sorted) {
    const sx = isoX(b.col + b.w/2, b.row + b.d/2);
    const sy = isoY(b.col + b.w/2, b.row + b.d/2);
    const g = new Container();
    const bg = new Graphics();
    drawIsometricBuilding(bg, sx, sy, b.w, b.d, b.h, b.face, b.roof, b.side);
    g.addChild(bg);
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointertap', () => opts.onBuildingTap(b.id));
    mapContainer.addChild(g);
    buildingLabel(labelsContainer, b.label, sx, sy, b.h);
  }

  const treeG = new Graphics();
  ([[2,4],[2,10],[13,4],[13,10],[5,0],[9,0],[5,15],[9,15]] as [number, number][]).forEach(([col, row]) => {
    drawTree(treeG, isoX(col, row), isoY(col, row));
  });
  mapContainer.addChild(treeG);
  mapContainer.addChild(labelsContainer);

  // Avatar on map
  const avatar = new Container();
  const ag = new Graphics();
  const skin = opts.avatarConfig?.skinTone ?? 0xd4956a;
  ag.ellipse(0, 18, 10, 4).fill({ color: 0x000000, alpha: 0.3 });
  ag.roundRect(-8, 0, 16, 20, 3).fill({ color: opts.avatarConfig?.outfitColour ?? 0x1a3a6b });
  ag.circle(0, -10, 10).fill({ color: skin });
  ag.circle(-3, -11, 2).fill({ color: 0x111111 });
  ag.circle(3, -11, 2).fill({ color: 0x111111 });
  ag.roundRect(-7, 20, 6, 12, 2).fill({ color: opts.avatarConfig?.pantsColour ?? 0x2c3e50 });
  ag.roundRect(1, 20, 6, 12, 2).fill({ color: opts.avatarConfig?.pantsColour ?? 0x2c3e50 });
  ag.circle(0, -16, 8).fill({ color: opts.avatarConfig?.hairColour ?? 0x1a0a00 });
  avatar.addChild(ag);
  avatar.x = isoX(6.5, 10.5);
  avatar.y = isoY(6.5, 10.5);
  mapContainer.addChild(avatar);

  // Drag
  let dragging = false; let lastX = 0; let lastY = 0;
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => { dragging = true; lastX = e.globalX; lastY = e.globalY; });
  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    if (!dragging) return;
    mapContainer.x += e.globalX - lastX;
    mapContainer.y += e.globalY - lastY;
    lastX = e.globalX; lastY = e.globalY;
  });
  app.stage.on('pointerup', () => { dragging = false; });
  app.stage.on('pointerupoutside', () => { dragging = false; });
}
