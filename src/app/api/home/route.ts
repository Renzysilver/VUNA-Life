// GET /api/home
// Returns everything the Home screen needs in one response:
// - server time + day-of-week + time-of-day greeting
// - the daily loop timeline (Loop A from the design doc) with the current-position marker
// - next obligation (next class or mass or hostel-lock depending on the time)
// - today's 3 assigned goals (assigning fresh ones if it's the first load of the day)
// - wallet (balance + earned_today + daily_cap) — recomputed from ledger
// - hair state (computed from lastCutAt + config thresholds)
// - discipline status (highest active tier)
// - announcements strip (active + pinned-first)
// - class alert (if next class starts within N minutes from config)
//
// This is the endpoint that "feels like Lagos Life": time pressure, money
// pressure, daily goals, daily loop. It's the heart of the daily return hook.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookie, getRequestContext } from '@/lib/auth/session';
import { ensureTodaysGoals } from '@/lib/db/goals';
import { getWallet } from '@/lib/db/wallet';
import { getHairState } from '@/lib/db/hair';
import { listTimetableForUser } from '@/lib/db/academic';
import { getConfig } from '@/lib/db/buildings';
import { ensureTodayMassSession, checkAndApplyMissedMassFines, getMissedMassWarningsCount, hasUserCheckedInToSession } from '@/lib/sessions/mass';
import { ensureWeeklyAllowance } from '@/lib/economy/allowance';
import { rollBackground, ensureMonthlyParentTransfer, getBackgroundInfo } from '@/lib/economy/background';

// Daily loop timeline (Loop A from the design doc).
// Each block has: time (24h), label, kind. The Home screen uses this to draw
// the day's structure and mark where the user currently is.
const DAILY_LOOP: Array<{
  time: string; // HH:MM
  label: string;
  kind: 'wake' | 'groom' | 'breakfast' | 'class' | 'mass' | 'lunch' | 'free' | 'hustle' | 'lock' | 'night';
  description: string;
}> = [
  { time: '07:00', label: 'Wake', kind: 'wake', description: 'Snooze or get up' },
  { time: '07:15', label: 'Groom', kind: 'groom', description: 'Full groom or quick wash — inspection risk if hair is overdue' },
  { time: '07:45', label: 'Breakfast', kind: 'breakfast', description: 'Eat well, bread and egg, or skip (hunger debuff)' },
  { time: '08:00', label: 'First class', kind: 'class', description: 'Scan the rotating QR or skip' },
  { time: '10:00', label: 'Free block', kind: 'free', description: 'Library, socialise, or start a campus job' },
  { time: '12:10', label: 'Mass rush', kind: 'mass', description: 'Compulsory faculty mass at the Chapel — 500 ₦ fine if you miss' },
  { time: '13:00', label: 'Lunch', kind: 'lunch', description: 'AC Canteen queue, vendor, or hostel provisions' },
  { time: '14:00', label: 'Class block 2', kind: 'class', description: 'QR check-in' },
  { time: '16:00', label: 'Free', kind: 'free', description: 'Sports, club, or hustle prep' },
  { time: '18:00', label: 'Hustle window opens', kind: 'hustle', description: 'Take stock on consignment (carry limit) or decline' },
  { time: '19:30', label: 'Selling', kind: 'hustle', description: 'Price high (slow sales) or low (fast, thin margin)' },
  { time: '21:45', label: 'Wrap up', kind: 'hustle', description: 'Head in now or push sales to 22:00' },
  { time: '22:00', label: 'Hostel lock', kind: 'lock', description: 'In is safe; out is TO_VERIFY' },
  { time: '22:30', label: 'Night', kind: 'night', description: 'Day summary card with a share button' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function greetingFor(h: number): { greeting: string; phase: 'morning' | 'afternoon' | 'evening' | 'night' } {
  if (h < 5) return { greeting: 'Night owl', phase: 'night' };
  if (h < 12) return { greeting: 'Good morning', phase: 'morning' };
  if (h < 17) return { greeting: 'Good afternoon', phase: 'afternoon' };
  if (h < 21) return { greeting: 'Good evening', phase: 'evening' };
  return { greeting: 'Wetin dey?', phase: 'night' };
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Not authenticated.' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    include: { department: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, message: 'User not found.' }, { status: 404 });
  }

  // ---------- server time ----------
  const now = new Date();
  const weekday = now.getDay(); // 0=Sun..6=Sat
  const dayName = DAY_NAMES[weekday];
  const hh = now.getHours();
  const mm = now.getMinutes();
  const nowMin = hh * 60 + mm;
  const { greeting, phase } = greetingFor(hh);

  // ---------- today's goals (assign if not yet assigned) ----------
  const goalsResult = await ensureTodaysGoals(user.id);

  // ---------- wallet ----------
  const wallet = await getWallet(user.id);

  // ---------- hair state ----------
  // ---------- weekly allowance (Phase 4) ----------
  // Auto-post the weekly allowance if today is the first /api/home load of
  // a new ISO week. Idempotent per (userId, ISO week). Posts through the
  // append-only ledger — server-side only.
  const allowance = await ensureWeeklyAllowance(user.id, {
    actorId: user.id,
    ...getRequestContext(req),
  });

  // ---------- Phase 7: family background + monthly parent transfer ----------
  const bgRoll = await rollBackground({
    userId: user.id,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  const parentTransfer = await ensureMonthlyParentTransfer({
    userId: user.id,
    ctx: { actorId: user.id, ...getRequestContext(req) },
  });
  const backgroundInfo = await getBackgroundInfo(user.id);

  const hair = await getHairState(user.id);

  // ---------- discipline (highest active tier) ----------
  const disciplineEntries = await db.discipline.findMany({
    where: { userId: user.id, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
  });
  const disciplineTier = disciplineEntries[0]?.tier ?? null;

  // ---------- announcements ----------
  const announcements = await db.announcement.findMany({
    where: {
      AND: [
        { startsAt: { lte: now } },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: 8,
  });

  // ---------- today's + next class ----------
  const todaysTimetable = await listTimetableForUser({
    departmentId: user.departmentId ?? undefined,
    level: user.level ?? undefined,
    weekday,
  });

  // Find the next upcoming class (start time >= now) or the next one tomorrow.
  let nextClass: any = null;
  let classAlertMinutes: number | null = null;
  for (const e of todaysTimetable) {
    const startMin = timeToMin(e.startTime);
    const endMin = timeToMin(e.endTime);
    if (nowMin < endMin) {
      const minsUntilStart = startMin - nowMin;
      nextClass = {
        id: e.id,
        courseCode: e.course.code,
        courseTitle: e.course.title,
        startTime: e.startTime,
        endTime: e.endTime,
        venue: e.venue
          ? { pin: e.venue.pin, name: e.venue.name, status: e.venue.status }
          : null,
        lecturer: e.lecturer ? { username: e.lecturer.username } : null,
        inProgress: nowMin >= startMin && nowMin < endMin,
        minutesUntilStart: minsUntilStart,
      };
      // Class alert: if start is within N minutes (default 15), surface it.
      const alertConfig = await getConfig('home_class_alert_minutes');
      const alertThreshold = typeof alertConfig === 'number'
        ? alertConfig
        : parseInt(String(alertConfig ?? '15'), 10) || 15;
      if (minsUntilStart >= 0 && minsUntilStart <= alertThreshold) {
        classAlertMinutes = minsUntilStart;
      }
      break;
    }
  }

  // ---------- next obligation ----------
  // Walk the daily loop to find the next block whose time is > now.
  // If there's a class alert, that takes priority.
  let nextObligation: any = null;
  if (classAlertMinutes !== null && nextClass) {
    nextObligation = {
      kind: 'class',
      label: `${nextClass.courseCode} starts in ${classAlertMinutes} min`,
      detail: `${nextClass.startTime} — ${nextClass.venue?.name ?? 'venue TBA'}`,
      cta: 'Scan QR at the door',
      urgent: true,
    };
  } else {
    for (let i = 0; i < DAILY_LOOP.length; i++) {
      const block = DAILY_LOOP[i];
      const blockMin = timeToMin(block.time);
      if (blockMin > nowMin) {
        nextObligation = {
          kind: block.kind,
          label: block.label,
          detail: block.description,
          cta: blockCta(block.kind),
          time: block.time,
          minutesUntil: blockMin - nowMin,
          urgent: block.kind === 'mass' || block.kind === 'lock',
        };
        break;
      }
    }
    // If we're past the last block (22:30 Night), look forward to tomorrow's wake.
    if (!nextObligation) {
      nextObligation = {
        kind: 'wake' as const,
        label: 'Sleep',
        detail: 'Day summary card is ready. Get some rest — wake at 07:00.',
        cta: 'View day summary',
        time: '07:00',
        minutesUntil: (24 * 60 - nowMin) + timeToMin('07:00'),
        urgent: false,
      };
    }
  }

  // ---------- daily loop with current position ----------
  // Mark the block the user is currently in (now between this block and the next).
  const loopWithPosition = DAILY_LOOP.map((block, i) => {
    const blockMin = timeToMin(block.time);
    const nextBlockMin = i < DAILY_LOOP.length - 1 ? timeToMin(DAILY_LOOP[i + 1].time) : 24 * 60;
    const isCurrent = nowMin >= blockMin && nowMin < nextBlockMin;
    const isPast = nowMin >= nextBlockMin;
    return {
      ...block,
      isCurrent,
      isPast,
      minutesUntil: Math.max(0, blockMin - nowMin),
    };
  });

  // ---------- mass (Phase 3) ----------
  // Ensure today's mass session exists (weekends skipped). Then, if mass
  // has already closed and the user didn't check in (and hasn't already
  // been fined), apply the 500 ₦ missed-mass fine + Warning tier.
  const massSession = await ensureTodayMassSession();
  let mass: any = null;
  let missedMassFineApplied = false;
  let missedMassFineAmount = 0;
  let missedMassWarningsCount = 0;
  if (massSession.session) {
    const s = massSession.session;
    const isOpen = now >= s.opensAt && now < s.closesAt;
    const checkedIn = await hasUserCheckedInToSession(user.id, s.id);
    const fineResult = await checkAndApplyMissedMassFines(user.id);
    missedMassFineApplied = fineResult.fineApplied;
    missedMassFineAmount = fineResult.amount;
    missedMassWarningsCount = await getMissedMassWarningsCount(user.id);

    mass = {
      sessionId: s.id,
      opensAt: s.opensAt,
      closesAt: s.closesAt,
      isOpen,
      checkedIn,
      minutesUntilOpen: now < s.opensAt ? Math.ceil((s.opensAt.getTime() - now.getTime()) / 1000 / 60) : null,
      minutesUntilClose: isOpen ? Math.ceil((s.closesAt.getTime() - now.getTime()) / 1000 / 60) : null,
      missedWarnings: missedMassWarningsCount,
      // The 500 ₦ fine is applied at most once per mass session.
      // Surface it here so the Home screen can show "Missed mass: -500 CC".
      fineAppliedToday: missedMassFineApplied,
      fineAmount: missedMassFineAmount,
    };
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    weekday,
    dayName,
    timeOfDay: phase,
    greeting,
    user: {
      id: user.id,
      email: user.email,
      emailDomain: user.email?.split('@')[1]?.toLowerCase() ?? '',
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      department: user.department
        ? { code: user.department.code, name: user.department.name, faculty: user.department.faculty }
        : null,
      level: user.level,
      isVerifiedStudent: user.isVerifiedStudent,
      avatarPath: user.avatarPath,
    },
    dailyLoop: loopWithPosition,
    nextObligation,
    classAlert: classAlertMinutes !== null
      ? { minutesUntilStart: classAlertMinutes, class: nextClass }
      : null,
    nextClass,
    goals: goalsResult.goals,
    wallet,
    hair,
    discipline: { tier: disciplineTier, count: disciplineEntries.length },
    allowance,
    background: {
      tier: backgroundInfo.tier,
      rolledAt: backgroundInfo.rolledAt,
      parentTransferPosted: parentTransfer.posted,
      parentTransferAmount: parentTransfer.amount,
      parentTransferMonth: parentTransfer.month,
    },
    avatarConfig: user.avatarConfig ? JSON.parse(user.avatarConfig) : null,
    equippedItems: user.equippedItems ? JSON.parse(user.equippedItems) : {},
    // Day summary card is "ready" to wrap up after 22:00 (hostel lock).
    // The Home screen shows the DaySummaryCard component when this is true.
    daySummaryReady: now.getHours() >= 22,
    mass,
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      category: a.category,
      isPinned: a.isPinned,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
    })),
    todaysTimetable: todaysTimetable.map((e) => ({
      id: e.id,
      courseCode: e.course.code,
      courseTitle: e.course.title,
      weekday: e.weekday,
      startTime: e.startTime,
      endTime: e.endTime,
      venue: e.venue
        ? { pin: e.venue.pin, name: e.venue.name, status: e.venue.status }
        : null,
    })),
  });
}

function blockCta(kind: string): string {
  switch (kind) {
    case 'wake': return 'Get up';
    case 'groom': return 'Groom';
    case 'breakfast': return 'Eat';
    case 'class': return 'Scan QR';
    case 'mass': return 'Walk to chapel';
    case 'lunch': return 'Queue at canteen';
    case 'free': return 'Free time';
    case 'hustle': return 'Take stock';
    case 'lock': return 'Head to hostel';
    case 'night': return 'Day summary';
    default: return 'Open';
  }
}
