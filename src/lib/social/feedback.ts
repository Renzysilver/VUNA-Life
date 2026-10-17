// ==========================================================================
// VUNA Life — feedback (the ONE place free text is allowed)
// Max 140 chars, rate-limited 1 per 24h per user. 5 category chips.
// ==========================================================================
import { db } from '@/lib/db';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';
import { getConfig } from '@/lib/db/buildings';

export const FEEDBACK_CATEGORIES = ['bug', 'feature_request', 'suggestion', 'complaint', 'praise'] as const;

export type SubmitFeedbackResult =
  | { ok: true; feedbackId: string }
  | { ok: false; reason: 'too_long' | 'rate_limited' | 'invalid_category'; message: string };

export async function submitFeedback(args: {
  userId: string;
  category: string;
  body: string;
  ctx?: AuditContext;
}): Promise<SubmitFeedbackResult> {
  if (!FEEDBACK_CATEGORIES.includes(args.category as any)) {
    return { ok: false, reason: 'invalid_category', message: 'Invalid category.' };
  }

  const maxCharsRaw = await getConfig('feedback_max_chars');
  const maxChars = typeof maxCharsRaw === 'number' ? maxCharsRaw : parseInt(String(maxCharsRaw ?? '140'), 10) || 140;
  const body = args.body.slice(0, maxChars + 1);
  if (body.length > maxChars) {
    return { ok: false, reason: 'too_long', message: `Max ${maxChars} characters.` };
  }

  // Rate limit: 1 per 24h.
  const rateLimitRaw = await getConfig('feedback_rate_limit_hours');
  const rateLimitHours = typeof rateLimitRaw === 'number' ? rateLimitRaw : parseInt(String(rateLimitRaw ?? '24'), 10) || 24;
  const since = new Date(Date.now() - rateLimitHours * 60 * 60 * 1000);
  const recent = await db.feedback.findFirst({
    where: { userId: args.userId, createdAt: { gte: since } },
  });
  if (recent) {
    return { ok: false, reason: 'rate_limited', message: `You can submit feedback once every ${rateLimitHours}h.` };
  }

  const fb = await db.feedback.create({
    data: {
      userId: args.userId,
      category: args.category,
      body: body.trim() || null,
    },
  });

  await writeAudit(args.ctx ?? {}, 'submit_feedback', 'feedback', fb.id, null, {
    userId: args.userId,
    category: args.category,
    bodyLength: body.length,
  });

  return { ok: true, feedbackId: fb.id };
}

export async function listFeedback(limit = 50) {
  return db.feedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    include: {
      user: {
        select: { id: true, username: true, displayName: true, email: true, department: { select: { code: true, name: true } } },
      },
    },
  });
}
