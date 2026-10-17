// ==========================================================================
// VUNA Life — goals engine
// Assigns N daily goals (from config: home_daily_goal_count, default 3) to
// each student per day. The goals are picked from the goals table where
// cadence='daily' and is_active=true. Picks are deterministic per
// (userId, date) so refreshing the page doesn't reshuffle the day's goals.
//
// Completion flips user_goals.status from 'pending' to 'completed' and posts
// a goal_reward ledger entry (subject to the daily earning cap).
// ==========================================================================
import { db } from '@/lib/db';
import { postLedgerEntry } from './wallet';
import { getConfig } from './buildings';
import { writeAudit, type AuditContext } from './audit-log';

function dateKey(d: Date): string {
  // YYYY-MM-DD in local time. Used as the deterministic seed for goal picks.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A 32-bit hash from a string. Used to make the daily pick deterministic.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Ensure the user has goals assigned for today. If they don't (or if today's
 * date has rolled over since the last assignment), pick a fresh set of
 * `home_daily_goal_count` goals from the daily templates.
 *
 * Picks are deterministic: same user + same date = same set of goals, so a
 * page refresh doesn't reshuffle. Selection is path-balanced when possible
 * (we try to spread across the six life paths).
 */
export async function ensureTodaysGoals(userId: string): Promise<{
  assigned: boolean;
  goals: Array<{
    userGoalId: string;
    goalId: string;
    title: string;
    path: string | null;
    status: string;
    template: any;
  }>;
}> {
  const today = new Date();
  const todayStr = dateKey(today);

  // Check if there are user_goals assigned today. We store the date in
  // assignedAt, so we look for goals where assignedAt's date === today.
  const existing = await db.userGoal.findMany({
    where: { userId },
    include: { goal: true },
    orderBy: { assignedAt: 'desc' },
  });

  // Group by assignedAt date string.
  const todays = existing.filter((ug) => dateKey(ug.assignedAt) === todayStr);

  if (todays.length > 0) {
    return {
      assigned: false,
      goals: todays.map((ug) => ({
        userGoalId: ug.id,
        goalId: ug.goalId,
        title: ug.goal.title,
        path: ug.goal.path,
        status: ug.status,
        template: safeJson(ug.goal.template),
      })),
    };
  }

  // Otherwise, assign a fresh set.
  const countRaw = await getConfig('home_daily_goal_count');
  const count = typeof countRaw === 'number' ? countRaw : parseInt(String(countRaw ?? '3'), 10) || 3;

  const templates = await db.goal.findMany({
    where: { cadence: 'daily', isActive: true },
  });
  if (templates.length === 0) {
    return { assigned: false, goals: [] };
  }

  // Deterministic pick: hash the (userId, date) to a seed, then take N
  // templates by rotating through the seed. Path-balanced: we group
  // templates by path and try to pick one from each path first.
  const seed = hashStr(`${userId}:${todayStr}`);
  const byPath = new Map<string, typeof templates>();
  for (const t of templates) {
    const p = t.path ?? 'Scholar';
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p)!.push(t);
  }
  const paths = Array.from(byPath.keys()).sort();
  const picks: typeof templates = [];
  let i = 0;
  while (picks.length < Math.min(count, templates.length)) {
    const p = paths[(seed + i) % paths.length];
    const arr = byPath.get(p)!;
    const t = arr[(seed + i * 7) % arr.length];
    if (!picks.find((x) => x.id === t.id)) picks.push(t);
    i++;
    if (i > 100) break; // safety
  }

  // Insert them.
  const newUgs = await Promise.all(
    picks.map((p) =>
      db.userGoal.create({
        data: {
          userId,
          goalId: p.id,
          status: 'pending',
          assignedAt: today,
        },
        include: { goal: true },
      }),
    ),
  );

  return {
    assigned: true,
    goals: newUgs.map((ug) => ({
      userGoalId: ug.id,
      goalId: ug.goalId,
      title: ug.goal.title,
      path: ug.goal.path,
      status: ug.status,
      template: safeJson(ug.goal.template),
    })),
  };
}

/**
 * Mark a user_goal as completed. Posts a goal_reward ledger entry equal to
 * the template.reward (subject to the daily earning cap). Bumps the stat for
 * the goal's path. Idempotent: completing an already-completed goal is a
 * no-op (no double reward).
 */
export async function completeGoal(
  userGoalId: string,
  ctx: AuditContext,
): Promise<{
  ok: boolean;
  reason?: 'not_found' | 'already_completed';
  reward?: number;
  capped?: boolean;
  newXp?: number;
}> {
  const ug = await db.userGoal.findUnique({
    where: { id: userGoalId },
    include: { goal: true },
  });
  if (!ug) return { ok: false, reason: 'not_found' };
  if (ug.status === 'completed') return { ok: false, reason: 'already_completed' };

  // Mark complete.
  await db.userGoal.update({
    where: { id: userGoalId },
    data: { status: 'completed', completedAt: new Date() },
  });

  // Post the reward (if any) to the ledger. The wallet adapter enforces the
  // daily earning cap; we don't bypass it.
  const template = safeJson(ug.goal.template) as { reward?: number };
  const reward = template.reward ?? 0;
  let capped = false;
  let newBalance = 0;
  if (reward > 0) {
    const r = await postLedgerEntry({
      toUser: ug.userId,
      amount: reward,
      reason: 'goal_reward',
      metadata: { goalId: ug.goalId, goalTitle: ug.goal.title },
      ctx,
    });
    capped = r.capped;
    newBalance = r.balance;
  }

  // Bump the stat for the goal's path.
  let newXp = 0;
  const path = ug.goal.path;
  if (path) {
    const stat = await db.stat.upsert({
      where: { userId_path: { userId: ug.userId, path } },
      update: { xp: { increment: 10 }, updatedAt: new Date() },
      create: { userId: ug.userId, path, xp: 10 },
    });
    newXp = stat.xp;
  }

  await writeAudit(ctx, 'complete_goal', 'user_goals', userGoalId, null, {
    goalId: ug.goalId,
    reward,
    capped,
    path,
    newXp,
    newBalance,
  });

  return { ok: true, reward, capped, newXp };
}

function safeJson(s: string | null): any {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
