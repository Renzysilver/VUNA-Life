// /api/admin/buildings — admin-only building CRUD with audit_log
import { NextResponse } from 'next/server';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  listBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  type NewBuilding,
  type BuildingPatch,
} from '@/lib/db/buildings';

async function requireAdmin() {
  const session = await getSessionFromCookie();
  if (!session) return { error: NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 }) };
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'admin') {
    return { error: NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 }) };
  }
  return { session, user };
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const buildings = await listBuildings();
  return NextResponse.json({ ok: true, buildings });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { session, user } = guard;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  if (!body?.pin || typeof body.pin !== 'string') {
    return NextResponse.json({ ok: false, message: 'pin is required.' }, { status: 400 });
  }

  const newB: NewBuilding = {
    pin: String(body.pin),
    name: typeof body.name === 'string' ? body.name : null,
    category: typeof body.category === 'string' ? body.category : 'other',
    genderAttr: typeof body.genderAttr === 'string' ? body.genderAttr : null,
    status: typeof body.status === 'string' ? body.status : 'TO_VERIFY',
    positionStatus: typeof body.positionStatus === 'string' ? body.positionStatus : 'TO_VERIFY',
    facing: typeof body.facing === 'string' ? body.facing : null,
    footprints: Array.isArray(body.footprints) ? body.footprints : [],
    courtyardPx: Array.isArray(body.courtyardPx) ? body.courtyardPx : null,
    sourceNote: typeof body.sourceNote === 'string' ? body.sourceNote : null,
  };

  try {
    const created = await createBuilding(newB, {
      actorId: user.id,
      ...getRequestContext(req),
    });
    return NextResponse.json({ ok: true, building: created });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ ok: false, message: `Pin '${newB.pin}' already exists.` }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: e.message ?? 'Failed to create building.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { user } = guard;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON.' }, { status: 400 });
  }
  const pin = typeof body?.pin === 'string' ? body.pin : null;
  if (!pin) {
    return NextResponse.json({ ok: false, message: 'pin is required.' }, { status: 400 });
  }

  const patch: BuildingPatch = {};
  if (body.name !== undefined) patch.name = typeof body.name === 'string' ? body.name : null;
  if (body.category !== undefined) patch.category = String(body.category);
  if (body.genderAttr !== undefined)
    patch.genderAttr = typeof body.genderAttr === 'string' ? body.genderAttr : null;
  if (body.status !== undefined) patch.status = String(body.status);
  if (body.positionStatus !== undefined) patch.positionStatus = String(body.positionStatus);
  if (body.facing !== undefined) patch.facing = typeof body.facing === 'string' ? body.facing : null;
  if (body.footprints !== undefined) patch.footprints = Array.isArray(body.footprints) ? body.footprints : [];
  if (body.courtyardPx !== undefined)
    patch.courtyardPx = Array.isArray(body.courtyardPx) ? body.courtyardPx : null;
  if (body.sourceNote !== undefined) patch.sourceNote = String(body.sourceNote);
  if (body.centreLat !== undefined) patch.centreLat = Number(body.centreLat) || null;
  if (body.centreLng !== undefined) patch.centreLng = Number(body.centreLng) || null;
  if (body.entranceLat !== undefined) patch.entranceLat = Number(body.entranceLat) || null;
  if (body.entranceLng !== undefined) patch.entranceLng = Number(body.entranceLng) || null;
  if (body.accuracyM !== undefined) patch.accuracyM = Number(body.accuracyM) || null;

  try {
    const updated = await updateBuilding(pin, patch, {
      actorId: user.id,
      ...getRequestContext(req),
    });
    return NextResponse.json({ ok: true, building: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message ?? 'Failed to update building.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;
  const { user } = guard;

  const url = new URL(req.url);
  const pin = url.searchParams.get('pin');
  if (!pin) {
    return NextResponse.json({ ok: false, message: 'pin query param is required.' }, { status: 400 });
  }

  try {
    await deleteBuilding(pin, { actorId: user.id, ...getRequestContext(req) });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message ?? 'Failed to delete building.' }, { status: 500 });
  }
}
