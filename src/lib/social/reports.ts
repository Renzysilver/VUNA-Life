// ==========================================================================
// VUNA Life — two-tap report
// Per HARD RULE: no free-text. The reporter taps the user, then taps a
// category chip. That's it. The server records the report and queues
// it for moderation review.
//
// Categories (from the design doc):
//   - harassment
//   - spam
//   - impersonation
//   - off-campus contact (sharing phone / social media handle)
//   - other (still no free text — just the "other" tag)
// ==========================================================================
import { db } from '@/lib/db';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

export const REPORT_CATEGORIES = [
  'harassment',
  'spam',
  'impersonation',
  'off_campus_contact',
  'other',
] as const;

export type ReportCategory = typeof REPORT_CATEGORIES[number];

export type ReportResult =
  | { ok: true; reportId: string }
  | { ok: false; reason: 'self_report' | 'target_not_found' | 'invalid_category' | 'duplicate'; message: string };

/**
 * Submit a two-tap report. The reporter taps the user, taps a category
 * chip, submits. No free-text body.
 *
 * Idempotency: one report per (reporter, target, category) per 24h.
 */
export async function submitReport(args: {
  reporterId: string;
  targetId: string;
  category: string;
  ctx?: AuditContext;
}): Promise<ReportResult> {
  if (args.reporterId === args.targetId) {
    return { ok: false, reason: 'self_report', message: 'Cannot report yourself.' };
  }
  if (!REPORT_CATEGORIES.includes(args.category as ReportCategory)) {
    return { ok: false, reason: 'invalid_category', message: 'Invalid category.' };
  }
  const target = await db.user.findUnique({ where: { id: args.targetId } });
  if (!target) {
    return { ok: false, reason: 'target_not_found', message: 'User not found.' };
  }

  // Idempotency: 24h cooldown for the same (reporter, target, category).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await db.hello.findFirst({
    where: { /* placeholder — we store reports in the audit_log */ },
  });
  // Actually we'll use a simpler model: reports go to audit_log with
  // action='report_user', table_name='users', row_id=targetId, before=null,
  // after={ category, reporterId }. The moderation queue reads audit_log
  // where action='report_user' and reviewed_by IS NULL.
  // For idempotency, we just check the audit_log for a recent report
  // with the same shape.
  const recentReports = await db.auditLog.findMany({
    where: {
      action: 'report_user',
      tableName: 'users',
      rowId: args.targetId,
      createdAt: { gte: since },
    },
    take: 50,
  });
  for (const r of recentReports) {
    try {
      const after = JSON.parse(r.after ?? '{}');
      if (after.reporterId === args.reporterId && after.category === args.category) {
        return { ok: false, reason: 'duplicate', message: 'You already reported this person for this in the last 24h.' };
      }
    } catch {
      // ignore
    }
  }

  // Write the report to audit_log (the moderation queue reads from there).
  await writeAudit(args.ctx ?? {}, 'report_user', 'users', args.targetId, null, {
    reporterId: args.reporterId,
    targetId: args.targetId,
    category: args.category,
  });

  return { ok: true, reportId: `report:${args.targetId}:${args.category}` };
}
