// GET /api/admin/audit-log — most recent audit entries (admin only)
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie } from '@/lib/auth/session';
import { getAuditLog } from '@/lib/db/audit-log';

export async function GET(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const tableName = url.searchParams.get('table') ?? undefined;
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const rows = await getAuditLog(limit, tableName);
  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      tableName: r.tableName,
      rowId: r.rowId,
      before: r.before ? safeJson(r.before) : null,
      after: r.after ? safeJson(r.after) : null,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
    })),
  });
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return s; }
}
