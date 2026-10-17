// ==========================================================================
// VUNA Life — DB adapter layer for buildings, config, audit_log
// In DEMO_MODE (current), uses Prisma + SQLite (seeded from the JSON).
// In production (Supabase env vars set), the same function signatures would
// route through @supabase/supabase-js. For Phase 1, only DEMO_MODE is wired;
// the Supabase adapter lives in src/lib/supabase.ts and is one import away.
// ==========================================================================
import { db } from '@/lib/db';
import { writeAudit, getAuditLog, type AuditContext } from './audit-log';
import type { Building, Prisma } from '@prisma/client';

// ---------- buildings ----------
export type BuildingRow = {
  id: string;
  pin: string;
  name: string | null;
  category: string;
  genderAttr: string | null;
  status: string;
  positionStatus: string;
  facing: string | null;
  footprints: any[];
  courtyardPx: any[] | null;
  sourceNote: string | null;
  centreLat: number | null;
  centreLng: number | null;
  entranceLat: number | null;
  entranceLng: number | null;
  accuracyM: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRow(b: Building): BuildingRow {
  let footprints: any[] = [];
  try {
    footprints = b.footprints ? JSON.parse(b.footprints) : [];
  } catch {
    footprints = [];
  }
  let courtyardPx: any[] | null = null;
  if (b.courtyardPx) {
    try {
      courtyardPx = JSON.parse(b.courtyardPx);
    } catch {
      courtyardPx = null;
    }
  }
  return {
    id: b.id,
    pin: b.pin,
    name: b.name,
    category: b.category,
    genderAttr: b.genderAttr,
    status: b.status,
    positionStatus: b.positionStatus,
    facing: b.facing,
    footprints,
    courtyardPx,
    sourceNote: b.sourceNote,
    centreLat: b.centreLat,
    centreLng: b.centreLng,
    entranceLat: b.entranceLat,
    entranceLng: b.entranceLng,
    accuracyM: b.accuracyM,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export async function listBuildings(): Promise<BuildingRow[]> {
  const rows = await db.building.findMany({ orderBy: [{ pin: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(toRow);
}

export async function getBuildingByPin(pin: string): Promise<BuildingRow | null> {
  const b = await db.building.findUnique({ where: { pin } });
  return b ? toRow(b) : null;
}

export type BuildingPatch = {
  name?: string | null;
  category?: string;
  genderAttr?: string | null;
  status?: string;
  positionStatus?: string;
  facing?: string | null;
  footprints?: any[];
  courtyardPx?: any[] | null;
  sourceNote?: string | null;
  centreLat?: number | null;
  centreLng?: number | null;
  entranceLat?: number | null;
  entranceLng?: number | null;
  accuracyM?: number | null;
};

export async function updateBuilding(
  pin: string,
  patch: BuildingPatch,
  ctx: AuditContext,
): Promise<BuildingRow> {
  const before = await db.building.findUnique({ where: { pin } });
  if (!before) throw new Error(`Building not found: pin=${pin}`);

  const data: Prisma.BuildingUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.genderAttr !== undefined) data.genderAttr = patch.genderAttr;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.positionStatus !== undefined) data.positionStatus = patch.positionStatus;
  if (patch.facing !== undefined) data.facing = patch.facing;
  if (patch.footprints !== undefined) data.footprints = JSON.stringify(patch.footprints);
  if (patch.courtyardPx !== undefined)
    data.courtyardPx = patch.courtyardPx == null ? null : JSON.stringify(patch.courtyardPx);
  if (patch.sourceNote !== undefined) data.sourceNote = patch.sourceNote;
  if (patch.centreLat !== undefined) data.centreLat = patch.centreLat;
  if (patch.centreLng !== undefined) data.centreLng = patch.centreLng;
  if (patch.entranceLat !== undefined) data.entranceLat = patch.entranceLat;
  if (patch.entranceLng !== undefined) data.entranceLng = patch.entranceLng;
  if (patch.accuracyM !== undefined) data.accuracyM = patch.accuracyM;

  const after = await db.building.update({ where: { pin }, data });

  await writeAudit(ctx, 'update', 'buildings', pin, before, after);

  return toRow(after);
}

export type NewBuilding = {
  pin: string;
  name?: string | null;
  category?: string;
  genderAttr?: string | null;
  status?: string;
  positionStatus?: string;
  facing?: string | null;
  footprints?: any[];
  courtyardPx?: any[] | null;
  sourceNote?: string | null;
};

export async function createBuilding(input: NewBuilding, ctx: AuditContext): Promise<BuildingRow> {
  // HARD RULE: new buildings always start at TO_VERIFY unless the operator
  // explicitly sets a confirmed status. We refuse MISSING_FROM_OLD_IMAGE here
  // (that's a derived status for traced buildings, not for hand-added ones).
  const status = input.status ?? 'TO_VERIFY';
  if (status === 'MISSING_FROM_OLD_IMAGE') {
    throw new Error('MISSING_FROM_OLD_IMAGE is a derived status; cannot be set manually.');
  }

  const created = await db.building.create({
    data: {
      pin: input.pin,
      name: input.name ?? null,
      category: input.category ?? 'other',
      genderAttr: input.genderAttr ?? null,
      status,
      positionStatus: input.positionStatus ?? 'TO_VERIFY',
      facing: input.facing ?? null,
      footprints: JSON.stringify(input.footprints ?? []),
      courtyardPx: input.courtyardPx == null ? null : JSON.stringify(input.courtyardPx),
      sourceNote: input.sourceNote ?? 'Hand-added by admin',
    },
  });

  await writeAudit(ctx, 'insert', 'buildings', input.pin, null, created);

  return toRow(created);
}

export async function deleteBuilding(pin: string, ctx: AuditContext): Promise<void> {
  const before = await db.building.findUnique({ where: { pin } });
  if (!before) throw new Error(`Building not found: pin=${pin}`);
  await db.building.delete({ where: { pin } });
  await writeAudit(ctx, 'delete', 'buildings', pin, before, null);
}

// ---------- map geometry ----------
export async function listRoads() {
  const rows = await db.mapRoad.findMany({ orderBy: { roadId: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    roadId: r.roadId,
    kind: r.kind,
    widthPx: r.widthPx,
    polylinePx: JSON.parse(r.polylinePx),
    polylineM: JSON.parse(r.polylineM),
  }));
}

export async function listTracks() {
  const rows = await db.mapTrack.findMany();
  return rows.map((t) => ({ id: t.id, polylinePx: JSON.parse(t.polylinePx) }));
}

export async function listFields() {
  const rows = await db.mapField.findMany({ orderBy: { fieldId: 'asc' } });
  return rows.map((f) => ({
    id: f.id,
    fieldId: f.fieldId,
    name: f.name,
    polygonPx: JSON.parse(f.polygonPx),
    polygonM: JSON.parse(f.polygonM),
  }));
}

export async function listCourts() {
  const rows = await db.mapCourt.findMany();
  return rows.map((c) => ({ id: c.id, rects: JSON.parse(c.rects) }));
}

// ---------- config ----------
export async function getConfig(key: string): Promise<any | null> {
  const row = await db.config.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export async function setConfig(key: string, value: any, description?: string): Promise<void> {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  await db.config.upsert({
    where: { key },
    update: { value: valueStr, description: description ?? undefined, updatedAt: new Date() },
    create: { key, value: valueStr, description },
  });
}

export async function listConfig(): Promise<Array<{ key: string; value: any; description: string | null }>> {
  const rows = await db.config.findMany({ orderBy: { key: 'asc' } });
  return rows.map((r) => {
    let parsed: any = r.value;
    try {
      parsed = JSON.parse(r.value);
    } catch {
      parsed = r.value;
    }
    return { key: r.key, value: parsed, description: r.description };
  });
}

// ---------- audit_log ----------
export { writeAudit, getAuditLog };
export type { AuditContext };
