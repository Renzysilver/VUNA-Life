// ==========================================================================
// VUNA Life — audit_log helper
// HARD RULE: every admin/lecturer data view or mutation writes to audit_log.
// This is the single entry point for that.
// ==========================================================================
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type AuditContext = {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(
  ctx: AuditContext,
  action: string,
  tableName: string,
  rowId: string | null | undefined,
  before?: Prisma.JsonValue | null,
  after?: Prisma.JsonValue | null,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: ctx.actorId ?? null,
        action,
        tableName,
        rowId: rowId ?? null,
        before: before == null ? null : JSON.stringify(before),
        after: after == null ? null : JSON.stringify(after),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  } catch (e) {
    // Audit write failure must NOT silently pass; we log but do not throw.
    // Throwing here would block the user's mutation, which is worse than a
    // missing audit row. The DB trigger on `buildings` is the belt-and-braces
    // backup; for tables without a trigger, this is the only path.
    console.error('[audit] FAILED to write audit_log:', action, tableName, rowId, e);
  }
}

export async function getAuditLog(limit = 50, tableName?: string) {
  return db.auditLog.findMany({
    where: tableName ? { tableName } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
  });
}
