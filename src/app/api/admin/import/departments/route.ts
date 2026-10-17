// POST /api/admin/import/departments — multipart or raw CSV text
// Body: { csv: string } OR multipart/form-data with field 'file'
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { parseDepartmentsCsv } from '@/lib/csv/parse';
import { bulkUpsertDepartments } from '@/lib/db/academic';

export async function POST(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 });
  }

  let csv: string = '';
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (file instanceof File) {
      csv = await file.text();
    } else if (typeof file === 'string') {
      csv = file;
    }
  } else {
    try {
      const body = await req.json();
      csv = typeof body?.csv === 'string' ? body.csv : '';
    } catch {
      // Try plain text body
      csv = await req.text();
    }
  }

  if (csv.trim().length === 0) {
    return NextResponse.json({ ok: false, message: 'CSV body is empty.' }, { status: 400 });
  }

  const result = parseDepartmentsCsv(csv);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
  }

  const stats = await bulkUpsertDepartments(result.rows, {
    actorId: user.id,
    ...getRequestContext(req),
  });

  return NextResponse.json({
    ok: true,
    inserted: stats.inserted,
    updated: stats.updated,
    ignored: result.ignored,
    totalParsed: result.rows.length,
  });
}
