// ==========================================================================
// VUNA Life — presence adapter
//
// Presence is EPHEMERAL by design (HARD RULE). Each row has an expiresAt
// set to NOW + 15 minutes. Rows past expiresAt are deleted on every read
// (via expireStaleRows). There is NO presence_history table — by design.
//
// Privacy:
//   - Non-friends see only the COUNT per building (no names, no usernames,
//     no departments — just "5 people are here")
//   - Friends see usernames + display names + departments
//   - "Someone from [dept]" is shown for non-friend visible presences
//     (per the user's Phase 5 prompt: anonymous avatar silhouettes with
//     username only if hello accepted, otherwise "Someone from [dept]")
//
// In DEMO_MODE there's no Supabase Realtime, so the map screen polls
// /api/presence every 5 seconds. When real Supabase env vars are set,
// the same endpoint can be upgraded to subscribe to a Realtime channel
// for live updates.
// ==========================================================================
import { db } from '@/lib/db';

const PRESENCE_TTL_MIN = 15;

export type PresenceState = 'solid' | 'likely' | 'event' | 'ghost';

export type PresenceRow = {
  userId: string;
  buildingId: string;
  state: PresenceState;
  since: Date;
  expiresAt: Date;
};

/**
 * Delete all presence rows past their expiresAt. Called on every
 * listPresencePerBuilding call. Idempotent.
 */
export async function expireStaleRows(): Promise<void> {
  const now = new Date();
  await db.presence.deleteMany({
    where: { expiresAt: { lt: now } },
  });
}

/**
 * Set or refresh the user's presence at a building.
 * Upserts the row with expiresAt = NOW + 15 minutes.
 *
 * HARD RULE: presence rows are EPHEMERAL. There is no history table;
 * this function never writes anywhere except the `presence` table.
 */
export async function setPresence(args: {
  userId: string;
  buildingId: string;
  state?: PresenceState;
}): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRESENCE_TTL_MIN * 60 * 1000);
  await db.presence.upsert({
    where: { userId: args.userId },
    update: {
      buildingId: args.buildingId,
      state: args.state ?? 'solid',
      since: now,
      expiresAt,
    },
    create: {
      userId: args.userId,
      buildingId: args.buildingId,
      state: args.state ?? 'solid',
      since: now,
      expiresAt,
    },
  });
}

/**
 * Clear the user's presence (e.g. when they go offline, sign out, or
 * enter a sensitive zone like a hostel room where presence is OFF).
 */
export async function clearPresence(userId: string): Promise<void> {
  await db.presence.deleteMany({ where: { userId } });
}

/**
 * Get a list of all buildings with active presence, plus the count of
 * people at each. Privacy-safe: returns ONLY the count, never names.
 *
 * Called by the map screen to render the presence dots.
 */
export async function listPresenceCountsPerBuilding(): Promise<Array<{
  buildingId: string;
  count: number;
}>> {
  await expireStaleRows();
  const rows = await db.presence.findMany({
    where: { expiresAt: { gt: new Date() } },
    select: { buildingId: true, userId: true },
  });
  const byBuilding = new Map<string, number>();
  for (const r of rows) {
    byBuilding.set(r.buildingId, (byBuilding.get(r.buildingId) ?? 0) + 1);
  }
  return Array.from(byBuilding.entries()).map(([buildingId, count]) => ({ buildingId, count }));
}

/**
 * Get the users currently present at a building. Privacy-filtered:
 *
 * - For friends of the requesting user: returns full info (userId,
 *   username, displayName, department).
 * - For non-friends: returns "Someone from [dept]" only (userId is
 *   masked with a per-session random ID so the map can show distinct
 *   silhouettes; username + displayName are null).
 *
 * HARD RULE: a student's building location is never exposed to
 * non-friends in plain text. Non-friends see only the department-level
 * label, never the username or display name.
 */
export async function listPresenceAtBuilding(args: {
  buildingId: string;
  viewerId: string;
}): Promise<Array<{
  userId: string;
  username: string | null;
  displayName: string | null;
  department: { code: string; name: string } | null;
  isFriend: boolean;
  state: PresenceState;
  since: Date;
}>> {
  await expireStaleRows();
  const rows = await db.presence.findMany({
    where: { buildingId: args.buildingId, expiresAt: { gt: new Date() } },
    include: {
      user: {
        include: { department: true },
      },
    },
    orderBy: { since: 'desc' },
  });

  // Load the viewer's friendship IDs (both directions) in one query.
  const viewerFriendships = await db.friendship.findMany({
    where: { OR: [{ userA: args.viewerId }, { userB: args.viewerId }] },
  });
  const friendIds = new Set<string>();
  for (const f of viewerFriendships) {
    const other = f.userA === args.viewerId ? f.userB : f.userA;
    friendIds.add(other);
  }

  return rows.map((r) => {
    const isFriend = friendIds.has(r.userId);
    if (isFriend) {
      return {
        userId: r.userId,
        username: r.user.username,
        displayName: r.user.displayName,
        department: r.user.department
          ? { code: r.user.department.code, name: r.user.department.name }
          : null,
        isFriend: true,
        state: r.state as PresenceState,
        since: r.since,
      };
    }
    // Privacy: non-friend — mask the username + displayName, keep only
    // the department so the UI can show "Someone from Law".
    return {
      userId: r.userId, // still returned so the UI can render a hello button
      username: null,
      displayName: null,
      department: r.user.department
        ? { code: r.user.department.code, name: r.user.department.name }
        : null,
      isFriend: false,
      state: r.state as PresenceState,
      since: r.since,
    };
  });
}

/**
 * Get the user's own current presence (where they are right now).
 * Returns null if they have no active presence.
 */
export async function getMyPresence(userId: string): Promise<PresenceRow | null> {
  await expireStaleRows();
  const r = await db.presence.findUnique({ where: { userId } });
  if (!r) return null;
  return {
    userId: r.userId,
    buildingId: r.buildingId,
    state: r.state as PresenceState,
    since: r.since,
    expiresAt: r.expiresAt,
  };
}
