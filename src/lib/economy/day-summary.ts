// ==========================================================================
// VUNA Life — Day Summary card
// At end of day (or on demand), generate a summary of what the student
// did today: CC earned, CC spent, classes attended, mass attended,
// goals completed, hair state, discipline state. Stored as a
// day_summaries row with a unique share_token. The share view is public
// (no auth) — anyone with the token can see the (non-PII) summary.
//
// HARD RULE: the day summary contains no PII. The user's email, real
// name, hostel, or matric are never included. The username and avatar
// only (if the user has chosen to set them) appear on the shared card.
// ==========================================================================
import { db } from '@/lib/db';
import crypto from 'crypto';
import { listLedger } from '@/lib/db/wallet';
import { listSessionAttendance } from '@/lib/sessions/attendance';

export type DaySummaryPayload = {
  date: string;             // YYYY-MM-DD
  displayName: string | null;
  username: string | null;
  department: { code: string; name: string } | null;
  level: number | null;
  // Money
  ccEarnedToday: number;
  ccSpentToday: number;
  balanceEndOfDay: number;
  topEarnReason: string | null;
  topSpendReason: string | null;
  // Activity
  classesCheckedIn: number;
  massCheckedIn: boolean;
  goalsCompleted: number;
  goalsTotal: number;
  // Status
  hairStage: string | null;
  disciplineTier: string | null;
  missedMassWarnings: number;
};

function newShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Generate today's day summary for the user. Idempotent — if a row
 * already exists for today, return the existing one (without rewriting).
 * Otherwise compute from ledger + attendance + goals + hair + discipline.
 */
export async function generateTodayDaySummary(userId: string): Promise<{ shareToken: string; payload: DaySummaryPayload }> {
  const today = new Date();
  const todayStr = dateKey(today);
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);

  // Check if a summary already exists for today.
  const existing = await db.daySummary.findUnique({
    where: { userId_summaryDate: { userId, summaryDate: todayDate } },
  });
  if (existing) {
    return {
      shareToken: existing.shareToken ?? '',
      payload: JSON.parse(existing.payload) as DaySummaryPayload,
    };
  }

  // Compute the payload.
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { department: true },
  });
  if (!user) throw new Error('user not found');

  // Money: scan today's ledger entries.
  const ledgerRows = await listLedger(userId, 200);
  const todayRows = ledgerRows.filter((r) => dateKey(r.createdAt) === todayStr);

  let ccEarnedToday = 0;
  let ccSpentToday = 0;
  const earnReasons = ['earning', 'goal_reward', 'hustle_sale', 'campus_job', 'mass_attendance', 'weekly_allowance'];
  const earnByReason = new Map<string, number>();
  const spendByReason = new Map<string, number>();

  for (const r of todayRows) {
    if (r.toUser === userId && earnReasons.includes(r.reason)) {
      ccEarnedToday += r.amount;
      earnByReason.set(r.reason, (earnByReason.get(r.reason) ?? 0) + r.amount);
    } else if (r.fromUser === userId) {
      ccSpentToday += r.amount;
      spendByReason.set(r.reason, (spendByReason.get(r.reason) ?? 0) + r.amount);
    }
  }

  const topEarnReason = earnByReason.size > 0
    ? Array.from(earnByReason.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : null;
  const topSpendReason = spendByReason.size > 0
    ? Array.from(spendByReason.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // Balance: recompute from ledger (latest wallet state).
  const wallet = await db.wallet.findUnique({ where: { userId } });
  const balanceEndOfDay = wallet?.balance ?? 0;

  // Classes: count today's attendance rows for the user.
  const todayAttendance = await db.attendance.findMany({
    where: {
      userId,
      checkedInAt: { gte: todayDate },
    },
    include: { session: true },
  });
  const classesCheckedIn = todayAttendance.filter((a) => a.session?.type === 'class').length;
  const massCheckedIn = todayAttendance.some((a) => a.session?.type === 'mass');

  // Goals: count today's completed goals.
  const todayGoals = await db.userGoal.findMany({
    where: {
      userId,
      completedAt: { gte: todayDate },
    },
  });
  const goalsCompleted = todayGoals.length;
  const allTodayGoals = await db.userGoal.findMany({
    where: { userId, assignedAt: { gte: todayDate } },
  });
  const goalsTotal = allTodayGoals.length;

  // Hair + discipline
  const hairRow = await db.hairState.findUnique({ where: { userId } });
  const disciplineRow = await db.discipline.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const missedMassWarnings = await db.discipline.count({
    where: { userId, tier: 'Warning', metadata: { contains: 'missed_mass' } },
  });

  const payload: DaySummaryPayload = {
    date: todayStr,
    displayName: user.displayName,
    username: user.username,
    department: user.department ? { code: user.department.code, name: user.department.name } : null,
    level: user.level,
    ccEarnedToday,
    ccSpentToday,
    balanceEndOfDay,
    topEarnReason,
    topSpendReason,
    classesCheckedIn,
    massCheckedIn,
    goalsCompleted,
    goalsTotal,
    hairStage: hairRow?.stage ?? null,
    disciplineTier: disciplineRow?.tier ?? null,
    missedMassWarnings,
  };

  // Insert (with share_token). If the upsert race-condition happens,
  // re-read the existing row.
  const shareToken = newShareToken();
  const created = await db.daySummary.upsert({
    where: { userId_summaryDate: { userId, summaryDate: todayDate } },
    update: {},  // don't overwrite if it exists
    create: {
      userId,
      summaryDate: todayDate,
      payload: JSON.stringify(payload),
      shareToken,
    },
  });

  return {
    shareToken: created.shareToken ?? shareToken,
    payload,
  };
}

/**
 * Public share view: load a day summary by share_token. No auth required.
 * Returns the payload (no PII beyond username + displayName + department).
 */
export async function getDaySummaryByToken(shareToken: string): Promise<{ payload: DaySummaryPayload } | null> {
  const row = await db.daySummary.findUnique({ where: { shareToken } });
  if (!row) return null;
  return { payload: JSON.parse(row.payload) as DaySummaryPayload };
}
