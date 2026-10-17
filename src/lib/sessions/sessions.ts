// ==========================================================================
// VUNA Life — sessions adapter
// A session is a class, mass, event, or exam that students can check in to.
// Each session has a `qr_seed` (random 32-byte string) used to derive the
// 10-second rotating QR token.
//
// Session lifecycle:
//   - Lecturer creates a session (POST /api/sessions) → server generates
//     qr_seed, stores row with opens_at + closes_at.
//   - Lecturer opens the "active session" view → GET /api/sessions/[id]/qr
//     returns the current token + secondsUntilRotation.
//   - Student scans the QR (in DEMO_MODE: reads the token from the screen)
//     and POST /api/sessions/[id]/check-in with the token + their device_id.
//   - After closes_at, the session is closed; missed-mass fines apply
//     (for mass sessions only).
// ==========================================================================
import { db } from '@/lib/db';
import crypto from 'crypto';
import { currentQrTokenState } from '@/lib/auth/qr-token';
import { getConfig } from '@/lib/db/buildings';

export type SessionType = 'class' | 'mass' | 'event' | 'exam';

export type SessionRow = {
  id: string;
  type: SessionType;
  courseId: string | null;
  venueId: string | null;
  lecturerId: string | null;
  opensAt: Date;
  closesAt: Date;
  qrSeed: string;
  createdAt: Date;
};

function toRow(s: any): SessionRow {
  return {
    id: s.id,
    type: s.type as SessionType,
    courseId: s.courseId ?? null,
    venueId: s.venueId ?? null,
    lecturerId: s.lecturerId ?? null,
    opensAt: s.opensAt,
    closesAt: s.closesAt,
    qrSeed: s.qrSeed,
    createdAt: s.createdAt,
  };
}

function newQrSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a session. Lecturer-only (or system for auto-created mass sessions).
 */
export async function createSession(args: {
  type: SessionType;
  courseId?: string;
  venueId?: string;
  /** Optional — null for system-created sessions like daily mass. */
  lecturerId?: string | null;
  opensAt: Date;
  closesAt: Date;
}): Promise<SessionRow> {
  const created = await db.session.create({
    data: {
      type: args.type,
      courseId: args.courseId ?? null,
      venueId: args.venueId ?? null,
      lecturerId: args.lecturerId ?? null,
      opensAt: args.opensAt,
      closesAt: args.closesAt,
      qrSeed: newQrSeed(),
    },
  });
  return toRow(created);
}

/**
 * List today's sessions (any type). For the lecturer's "active sessions" view.
 */
export async function listSessionsToday(): Promise<Array<SessionRow & {
  venue: { pin: string; name: string | null; status: string } | null;
  course: { code: string; title: string } | null;
  attendanceCount: number;
}>> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const rows = await db.session.findMany({
    where: {
      OR: [
        { opensAt: { gte: todayStart, lte: todayEnd } },
        { closesAt: { gte: todayStart, lte: todayEnd } },
      ],
    },
    include: {
      venue: true,
      course: true,
      attendance: true,
    },
    orderBy: { opensAt: 'asc' },
  });

  return rows.map((r) => ({
    ...toRow(r),
    venue: r.venue ? { pin: r.venue.pin, name: r.venue.name, status: r.venue.status } : null,
    course: r.course ? { code: r.course.code, title: r.course.title } : null,
    attendanceCount: r.attendance.length,
  }));
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const s = await db.session.findUnique({ where: { id } });
  return s ? toRow(s) : null;
}

/**
 * Get the current QR token state for a session (for the lecturer's view).
 * Returns null if the session isn't open yet (before opensAt) or has
 * closed (after closesAt).
 */
export async function getSessionQrState(id: string, serverTimeMs: number = Date.now()): Promise<{
  token: string;
  slotIndex: number;
  secondsUntilRotation: number;
  opensAt: Date;
  closesAt: Date;
  isOpen: boolean;
  secondsUntilOpen: number | null;
  secondsUntilClose: number | null;
} | null> {
  const s = await getSession(id);
  if (!s) return null;
  const rotRaw = await getConfig('qr_rotation_seconds');
  const rot = typeof rotRaw === 'number' ? rotRaw : parseInt(String(rotRaw ?? '10'), 10) || 10;
  const now = new Date(serverTimeMs);
  const isOpen = now >= s.opensAt && now < s.closesAt;
  const secondsUntilOpen = now < s.opensAt ? Math.ceil((s.opensAt.getTime() - serverTimeMs) / 1000) : null;
  const secondsUntilClose = isOpen ? Math.ceil((s.closesAt.getTime() - serverTimeMs) / 1000) : null;

  if (!isOpen) {
    return {
      token: '',
      slotIndex: 0,
      secondsUntilRotation: 0,
      opensAt: s.opensAt,
      closesAt: s.closesAt,
      isOpen: false,
      secondsUntilOpen,
      secondsUntilClose,
    };
  }

  const state = currentQrTokenState({
    sessionId: s.id,
    qrSeed: s.qrSeed,
    serverTimeMs,
    rotationSeconds: rot,
  });
  return {
    ...state,
    opensAt: s.opensAt,
    closesAt: s.closesAt,
    isOpen: true,
    secondsUntilOpen,
    secondsUntilClose,
  };
}

/**
 * Mark a session's QR seed as stale by generating a new one (admin action
 * if a leak is suspected). All outstanding tokens are immediately
 * invalidated.
 */
export async function rotateSessionSeed(sessionId: string): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { qrSeed: newQrSeed() },
  });
}
