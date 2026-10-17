// ==========================================================================
// VUNA Life — hellos → friendship → chat
//
// HARD RULES (per the user's Phase 5 prompt + design doc):
//   - One hello per (from, to) pair — duplicates rejected.
//   - Max 3 outgoing hellos at a time (config: hello_max_outgoing).
//   - 24-hour cooldown after a hello is declined or ignored before
//     you can hello the same person again (config: hello_cooldown_hours).
//   - No hello to unverified accounts (target.isVerifiedStudent must be true).
//   - Under-18 (is_minor=true): can only chat with accepted friends.
//     This is naturally enforced because chats only open after hello is
//     accepted. Minors CAN send/accept hellos to make new friends.
//   - Block is instant and silent: target's presence + chat are gone,
//     no notification to the blocked user.
//   - No "friend" label in the UI — just "connected".
//   - Two-tap report (category chips only, no free text).
// ==========================================================================
import { db } from '@/lib/db';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';
import { clearPresence } from '@/lib/presence/presence';

const DEFAULT_MAX_OUTGOING = 3;
const DEFAULT_COOLDOWN_HOURS = 24;

export type HelloRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  buildingId: string | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  createdAt: Date;
  respondedAt: Date | null;
  // For the UI: the other side's username + displayName (only if accepted;
  // before that, null for privacy per "Someone from [dept]" rule)
  fromUser: { username: string | null; displayName: string | null; department: { code: string; name: string } | null };
  toUser: { username: string | null; displayName: string | null; department: { code: string; name: string } | null };
};

export type SendHelloResult =
  | { ok: true; helloId: string }
  | { ok: false; reason: 'self_hello' | 'target_unverified' | 'already_pending' | 'max_outgoing' | 'cooldown' | 'blocked' | 'unknown'; message: string };

/**
 * Send a hello from user A to user B.
 *
 * Anti-spam:
 *   - Self-hello rejected.
 *   - Target must be verified (isVerifiedStudent=true).
 *   - One pending hello per (A,B) pair — duplicates rejected.
 *   - Max 3 outgoing pending hellos at a time (configurable).
 *   - 24-hour cooldown after a hello to the same person was declined/ignored.
 *   - If B has blocked A, the hello silently fails (no error to A —
 *     block is silent per HARD RULE).
 */
export async function sendHello(args: {
  fromUserId: string;
  toUserId: string;
  buildingId?: string;
  message?: string;
  ctx?: AuditContext;
}): Promise<SendHelloResult> {
  if (args.fromUserId === args.toUserId) {
    return { ok: false, reason: 'self_hello', message: 'You cannot say hello to yourself.' };
  }

  // Validate target.
  const target = await db.user.findUnique({
    where: { id: args.toUserId },
    include: { department: true },
  });
  if (!target) {
    return { ok: false, reason: 'unknown', message: 'User not found.' };
  }
  if (!target.isVerifiedStudent) {
    return { ok: false, reason: 'target_unverified', message: 'That account is not verified yet.' };
  }

  // Check if B has blocked A (silent — return generic error).
  const blockExists = await db.hello.findFirst({
    where: { fromUser: args.toUserId, toUser: args.fromUserId, status: 'blocked' },
  });
  if (blockExists) {
    // Per HARD RULE: block is silent. Don't tell A they were blocked.
    // Just return a generic "already pending" so A doesn't know.
    return { ok: false, reason: 'already_pending', message: 'You already have a hello out to this person.' };
  }

  // Check for an existing pending hello A→B.
  const existing = await db.hello.findUnique({
    where: { fromUser_toUser: { fromUser: args.fromUserId, toUser: args.toUserId } },
  });
  if (existing && existing.status === 'pending') {
    return { ok: false, reason: 'already_pending', message: 'You already have a hello out to this person.' };
  }

  // Cooldown check: if the previous hello to B was declined/ignored within
  // the last 24 hours, reject.
  if (existing && (existing.status === 'declined' || existing.status === 'blocked')) {
    const cooldownHours = DEFAULT_COOLDOWN_HOURS;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const sinceResponse = Date.now() - (existing.respondedAt?.getTime() ?? existing.createdAt.getTime());
    if (sinceResponse < cooldownMs) {
      return { ok: false, reason: 'cooldown', message: `Wait ${cooldownHours}h before saying hello again.` };
    }
  }

  // Max outgoing check.
  const maxOutgoing = DEFAULT_MAX_OUTGOING;
  const outgoingPending = await db.hello.count({
    where: { fromUser: args.fromUserId, status: 'pending' },
  });
  if (outgoingPending >= maxOutgoing) {
    return { ok: false, reason: 'max_outgoing', message: `You have ${maxOutgoing} pending hellos. Wait for one to be responded to.` };
  }

  // Upsert (replace any existing declined/blocked entry).
  const hello = await db.hello.upsert({
    where: { fromUser_toUser: { fromUser: args.fromUserId, toUser: args.toUserId } },
    update: {
      buildingId: args.buildingId ?? null,
      message: args.message ?? null,
      status: 'pending',
      respondedAt: null,
      createdAt: new Date(),
    },
    create: {
      fromUser: args.fromUserId,
      toUser: args.toUserId,
      buildingId: args.buildingId ?? null,
      message: args.message ?? null,
      status: 'pending',
    },
  });

  await writeAudit(args.ctx ?? {}, 'send_hello', 'hellos', hello.id, null, {
    from: args.fromUserId,
    to: args.toUserId,
  });

  return { ok: true, helloId: hello.id };
}

export type RespondHelloResult =
  | { ok: true; chatId?: string; friendshipId?: string }
  | { ok: false; reason: 'not_found' | 'not_yours' | 'already_responded'; message: string };

/**
 * Accept a hello. Creates a friendship + a chat. Idempotent: if already
 * accepted, returns the existing chat.
 */
export async function acceptHello(args: {
  helloId: string;
  responderId: string; // must be the toUser
  ctx?: AuditContext;
}): Promise<RespondHelloResult> {
  const hello = await db.hello.findUnique({ where: { id: args.helloId } });
  if (!hello) return { ok: false, reason: 'not_found', message: 'Hello not found.' };
  if (hello.toUser !== args.responderId) {
    return { ok: false, reason: 'not_yours', message: 'This hello is not for you.' };
  }
  if (hello.status === 'accepted') {
    // Find the existing chat.
    const [a, b] = [hello.fromUser, hello.toUser].sort() as [string, string];
    const chat = await db.chat.findUnique({
      where: { userA_userB: { userA: a, userB: b } },
    });
    return { ok: true, chatId: chat?.id };
  }
  if (hello.status !== 'pending') {
    return { ok: false, reason: 'already_responded', message: 'Already responded.' };
  }

  // Update hello status.
  await db.hello.update({
    where: { id: args.helloId },
    data: { status: 'accepted', respondedAt: new Date() },
  });

  // Create friendship (canonicalized: userA < userB).
  const [a, b] = [hello.fromUser, hello.toUser].sort() as [string, string];
  const friendship = await db.friendship.upsert({
    where: { userA_userB: { userA: a, userB: b } },
    update: {},
    create: { userA: a, userB: b },
  });

  // Create chat (1:1, canonicalized same way).
  const chat = await db.chat.upsert({
    where: { userA_userB: { userA: a, userB: b } },
    update: {},
    create: { userA: a, userB: b },
  });

  await writeAudit(args.ctx ?? {}, 'accept_hello', 'hellos', args.helloId, null, {
    friendshipId: friendship.id,
    chatId: chat.id,
  });

  return { ok: true, chatId: chat.id, friendshipId: friendship.id };
}

/**
 * Decline a hello. Marks status='declined'. No friendship/chat created.
 */
export async function declineHello(args: {
  helloId: string;
  responderId: string;
  ctx?: AuditContext;
}): Promise<RespondHelloResult> {
  const hello = await db.hello.findUnique({ where: { id: args.helloId } });
  if (!hello) return { ok: false, reason: 'not_found', message: 'Hello not found.' };
  if (hello.toUser !== args.responderId) {
    return { ok: false, reason: 'not_yours', message: 'This hello is not for you.' };
  }
  if (hello.status !== 'pending') {
    return { ok: false, reason: 'already_responded', message: 'Already responded.' };
  }

  await db.hello.update({
    where: { id: args.helloId },
    data: { status: 'declined', respondedAt: new Date() },
  });

  await writeAudit(args.ctx ?? {}, 'decline_hello', 'hellos', args.helloId, null, {});

  return { ok: true };
}

/**
 * Block the sender of a hello. Per HARD RULE: block is INSTANT and SILENT.
 *
 * - Marks the hello status='blocked'.
 * - Removes the friendship (if any).
 * - Removes the chat (if any) — messages become inaccessible.
 * - Clears the blocked user's presence at any building (so they don't
 *   see the blocker's presence either, by symmetry).
 *
 * The blocked user is NOT notified.
 */
export async function blockHello(args: {
  helloId: string;
  blockerId: string; // must be the toUser
  ctx?: AuditContext;
}): Promise<RespondHelloResult> {
  const hello = await db.hello.findUnique({ where: { id: args.helloId } });
  if (!hello) return { ok: false, reason: 'not_found', message: 'Hello not found.' };
  if (hello.toUser !== args.blockerId) {
    return { ok: false, reason: 'not_yours', message: 'This hello is not for you.' };
  }

  await db.hello.update({
    where: { id: args.helloId },
    data: { status: 'blocked', respondedAt: new Date() },
  });

  // Also insert a reverse block entry (fromUser=blocker, toUser=blocked,
  // status='blocked') so the blocked user can never hello the blocker
  // again.
  await db.hello.upsert({
    where: { fromUser_toUser: { fromUser: args.blockerId, toUser: hello.fromUser } },
    update: { status: 'blocked', respondedAt: new Date() },
    create: {
      fromUser: args.blockerId,
      toUser: hello.fromUser,
      status: 'blocked',
      respondedAt: new Date(),
    },
  });

  // Remove friendship + chat.
  const [a, b] = [hello.fromUser, hello.toUser].sort() as [string, string];
  await db.friendship.deleteMany({ where: { userA: a, userB: b } });
  await db.chat.deleteMany({ where: { userA: a, userB: b } });

  // Clear the blocked user's presence (so they don't see the blocker).
  await clearPresence(hello.fromUser);

  await writeAudit(args.ctx ?? {}, 'block_hello', 'hellos', args.helloId, null, {
    blocked: hello.fromUser,
  });

  return { ok: true };
}

/**
 * List the user's incoming + outgoing hellos. For the UI People tab.
 */
export async function listMyHellos(userId: string): Promise<{
  incoming: HelloRow[];
  outgoing: HelloRow[];
}> {
  const incoming = await db.hello.findMany({
    where: { toUser: userId },
    include: {
      fromUserRel: { include: { department: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const outgoing = await db.hello.findMany({
    where: { fromUser: userId },
    include: {
      toUserRel: { include: { department: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const mapIncoming = (h: any): HelloRow => ({
    id: h.id,
    fromUserId: h.fromUser,
    toUserId: h.toUser,
    buildingId: h.buildingId,
    message: h.message,
    status: h.status,
    createdAt: h.createdAt,
    respondedAt: h.respondedAt,
    // Per HARD RULE: only reveal the sender's username/displayName if
    // the hello is ACCEPTED. Before that, mask them.
    fromUser: h.status === 'accepted'
      ? {
          username: h.fromUserRel.username,
          displayName: h.fromUserRel.displayName,
          department: h.fromUserRel.department
            ? { code: h.fromUserRel.department.code, name: h.fromUserRel.department.name }
            : null,
        }
      : {
          username: null,
          displayName: null,
          department: h.fromUserRel.department
            ? { code: h.fromUserRel.department.code, name: h.fromUserRel.department.name }
            : null,
        },
    toUser: { username: null, displayName: null, department: null },
  });

  const mapOutgoing = (h: any): HelloRow => ({
    id: h.id,
    fromUserId: h.fromUser,
    toUserId: h.toUser,
    buildingId: h.buildingId,
    message: h.message,
    status: h.status,
    createdAt: h.createdAt,
    respondedAt: h.respondedAt,
    fromUser: { username: null, displayName: null, department: null },
    toUser: h.status === 'accepted'
      ? {
          username: h.toUserRel.username,
          displayName: h.toUserRel.displayName,
          department: h.toUserRel.department
            ? { code: h.toUserRel.department.code, name: h.toUserRel.department.name }
            : null,
        }
      : {
          username: null,
          displayName: null,
          department: h.toUserRel.department
            ? { code: h.toUserRel.department.code, name: h.toUserRel.department.name }
            : null,
        },
  });

  return {
    incoming: incoming.map(mapIncoming),
    outgoing: outgoing.map(mapOutgoing),
  };
}
