// ==========================================================================
// VUNA Life — tests for Phase 5 hellos + presence privacy filtering
// Run with: bun test tests/hellos.test.ts
//
// HARD RULES tested:
//   - Max 3 outgoing pending hellos at a time
//   - 24h cooldown after a declined hello
//   - No hello to unverified accounts
//   - Block is instant + silent (and inserts a reverse block entry)
//   - Privacy filtering: non-friends see "Someone from [dept]" only
// ==========================================================================
import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { sendHello, acceptHello, declineHello, blockHello, listMyHellos } = await import('../src/lib/social/hellos');
const { setPresence, listPresenceAtBuilding, listPresenceCountsPerBuilding, clearPresence, expireStaleRows } = await import('../src/lib/presence/presence');

const A_EMAIL = 'hello-a@vuna-life.local';
const B_EMAIL = 'hello-b@vuna-life.local';
const C_EMAIL = 'hello-c@vuna-life.local';
const D_EMAIL = 'hello-d-unverified@vuna-life.local';

let aId: string, bId: string, cId: string, dId: string, libraryId: string;

beforeAll(async () => {
  // Get a department (CSC from the seed)
  const csc = await prisma.department.findUnique({ where: { code: 'CSC' } });
  if (!csc) throw new Error('CSC department not found in seed');

  // Create 4 test users
  for (const email of [A_EMAIL, B_EMAIL, C_EMAIL, D_EMAIL]) {
    const username = email.split('@')[0].replace(/-/g, '_');
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        role: 'student',
        isVerifiedStudent: !email.includes('unverified'),
        username,
        displayName: username.toUpperCase(),
        departmentId: csc.id,
        level: 200,
      },
    });
  }
  const a = await prisma.user.findUnique({ where: { email: A_EMAIL } });
  const b = await prisma.user.findUnique({ where: { email: B_EMAIL } });
  const c = await prisma.user.findUnique({ where: { email: C_EMAIL } });
  const d = await prisma.user.findUnique({ where: { email: D_EMAIL } });
  if (!a || !b || !c || !d) throw new Error('test users not created');
  aId = a.id; bId = b.id; cId = c.id; dId = d.id;

  // Get Library building id
  const library = await prisma.building.findUnique({ where: { pin: '8' } });
  if (!library) throw new Error('library building not found in seed');
  libraryId = library.id;
});

afterAll(async () => {
  // Clean up
  for (const email of [A_EMAIL, B_EMAIL, C_EMAIL, D_EMAIL]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.hello.deleteMany({ where: { OR: [{ fromUser: u.id }, { toUser: u.id }] } });
      await prisma.friendship.deleteMany({ where: { OR: [{ userA: u.id }, { userB: u.id }] } });
      await prisma.chat.deleteMany({ where: { OR: [{ userA: u.id }, { userB: u.id }] } });
      await prisma.presence.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { email } }).catch(() => {});
    }
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean hellos + friendships + chats + presence between tests
  // so one test's state doesn't leak into another.
  await prisma.hello.deleteMany({ where: { OR: [{ fromUser: aId }, { toUser: aId }] } });
  await prisma.hello.deleteMany({ where: { OR: [{ fromUser: bId }, { toUser: bId }] } });
  await prisma.hello.deleteMany({ where: { OR: [{ fromUser: cId }, { toUser: cId }] } });
  await prisma.friendship.deleteMany({ where: { OR: [{ userA: aId }, { userB: aId }] } });
  await prisma.friendship.deleteMany({ where: { OR: [{ userA: bId }, { userB: bId }] } });
  await prisma.chat.deleteMany({ where: { OR: [{ userA: aId }, { userB: aId }] } });
  await prisma.chat.deleteMany({ where: { OR: [{ userA: bId }, { userB: bId }] } });
  await prisma.presence.deleteMany({});
});

describe('sendHello — happy path', () => {
  test('A can send a hello to B (both verified)', async () => {
    const r = await sendHello({ fromUserId: aId, toUserId: bId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.helloId).toBeTruthy();
  });
});

describe('sendHello — anti-spam', () => {
  test('self-hello rejected', async () => {
    const r = await sendHello({ fromUserId: aId, toUserId: aId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('self_hello');
  });

  test('hello to unverified account rejected', async () => {
    const r = await sendHello({ fromUserId: aId, toUserId: dId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_unverified');
  });

  test('duplicate pending hello rejected', async () => {
    await sendHello({ fromUserId: aId, toUserId: bId });
    const r = await sendHello({ fromUserId: aId, toUserId: bId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already_pending');
  });

  test('max 3 outgoing pending hellos enforced', async () => {
    // Send 3 hellos: A → B, A → C (and we need a 4th user; use dId even
    // though unverified — wait, we can't. We need 3 verified users.
    // We have A, B, C (and D is unverified). So A → B, A → C = 2.
    // Let's create a 4th verified user.
    const eEmail = 'hello-e@vuna-life.local';
    await prisma.user.upsert({
      where: { email: eEmail },
      update: {},
      create: { email: eEmail, role: 'student', isVerifiedStudent: true, username: 'hello_e' },
    });
    const e = await prisma.user.findUnique({ where: { email: eEmail } });
    if (!e) throw new Error('no E');

    // A → B, A → C, A → E = 3 pending outgoing (the max).
    await sendHello({ fromUserId: aId, toUserId: bId });
    await sendHello({ fromUserId: aId, toUserId: cId });
    await sendHello({ fromUserId: aId, toUserId: e.id });

    // The 4th should be rejected.
    // We need another verified user. Let's create F.
    const fEmail = 'hello-f@vuna-life.local';
    await prisma.user.upsert({
      where: { email: fEmail },
      update: {},
      create: { email: fEmail, role: 'student', isVerifiedStudent: true, username: 'hello_f' },
    });
    const f = await prisma.user.findUnique({ where: { email: fEmail } });
    if (!f) throw new Error('no F');

    const r = await sendHello({ fromUserId: aId, toUserId: f.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('max_outgoing');

    // Cleanup
    await prisma.user.delete({ where: { email: eEmail } }).catch(() => {});
    await prisma.user.delete({ where: { email: fEmail } }).catch(() => {});
  });

  test('24h cooldown after a declined hello', async () => {
    // A → B, B declines
    const s = await sendHello({ fromUserId: aId, toUserId: bId });
    if (!s.ok) throw new Error('first hello failed');
    await declineHello({ helloId: s.helloId, responderId: bId });

    // A → B immediately — should be rejected with cooldown
    const r = await sendHello({ fromUserId: aId, toUserId: bId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('cooldown');
  });
});

describe('acceptHello — creates friendship + chat', () => {
  test('accepting a hello creates a chat + friendship', async () => {
    const s = await sendHello({ fromUserId: aId, toUserId: bId });
    if (!s.ok) throw new Error('hello failed');
    const r = await acceptHello({ helloId: s.helloId, responderId: bId });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.chatId).toBeTruthy();
      expect(r.friendshipId).toBeTruthy();
    }
  });

  test('accepting someone else\'s hello is rejected', async () => {
    const s = await sendHello({ fromUserId: aId, toUserId: bId });
    if (!s.ok) throw new Error('hello failed');
    const r = await acceptHello({ helloId: s.helloId, responderId: cId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_yours');
  });
});

describe('blockHello — instant + silent + bidirectional', () => {
  test('block marks the hello + creates a reverse block + removes friendship', async () => {
    // A → B, B accepts (creates friendship), then B blocks A
    const s = await sendHello({ fromUserId: aId, toUserId: bId });
    if (!s.ok) throw new Error('hello failed');
    await acceptHello({ helloId: s.helloId, responderId: bId });

    // Verify friendship + chat exist
    const friendshipBefore = await prisma.friendship.count({
      where: { OR: [{ userA: aId, userB: bId }, { userA: bId, userB: aId }] },
    });
    expect(friendshipBefore).toBe(1);

    // B blocks A via a fresh hello (we need a hello row to block on).
    // Actually blockHello takes a helloId. Let's re-think — the block
    // flow is: B has an incoming hello from A. B taps "block" on that
    // hello. But if B already accepted, the hello status='accepted'.
    // Can you block an already-accepted hello? Yes — that's the
    // "unfriend + block" flow.
    const r = await blockHello({ helloId: s.helloId, blockerId: bId });
    expect(r.ok).toBe(true);

    // Friendship + chat should be gone
    const friendshipAfter = await prisma.friendship.count({
      where: { OR: [{ userA: aId, userB: bId }, { userA: bId, userB: aId }] },
    });
    expect(friendshipAfter).toBe(0);

    // The hello from A→B should be 'blocked'
    const helloAB = await prisma.hello.findUnique({
      where: { fromUser_toUser: { fromUser: aId, toUser: bId } },
    });
    expect(helloAB?.status).toBe('blocked');

    // The reverse entry (B→A) should ALSO be 'blocked' (so A can't re-hello B)
    const helloBA = await prisma.hello.findUnique({
      where: { fromUser_toUser: { fromUser: bId, toUser: aId } },
    });
    expect(helloBA?.status).toBe('blocked');
  });

  test('after block, A cannot send another hello to B (silent reject)', async () => {
    // A → B, B blocks
    const s = await sendHello({ fromUserId: aId, toUserId: bId });
    if (!s.ok) throw new Error('hello failed');
    await blockHello({ helloId: s.helloId, blockerId: bId });

    // A tries again — should be rejected as 'already_pending' (silent)
    const r = await sendHello({ fromUserId: aId, toUserId: bId });
    expect(r.ok).toBe(false);
    // Per HARD RULE: block is silent. We don't tell A they're blocked —
    // we just say "already_pending" so A doesn't learn the block exists.
    if (!r.ok) expect(r.reason).toBe('already_pending');
  });
});

describe('presence — privacy filtering', () => {
  test('listPresenceAtBuilding: non-friends see only "Someone from [dept]" — no username', async () => {
    // B is at the library; A is not friends with B.
    await setPresence({ userId: bId, buildingId: libraryId });
    const rows = await listPresenceAtBuilding({ buildingId: libraryId, viewerId: aId });
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.userId).toBe(bId);
    expect(row.isFriend).toBe(false);
    // Privacy: username + displayName should be null for non-friends.
    expect(row.username).toBeNull();
    expect(row.displayName).toBeNull();
    // Department IS returned so the UI can show "Someone from Law".
    expect(row.department).not.toBeNull();
  });

  test('listPresenceAtBuilding: friends see username + displayName', async () => {
    // A → B, B accepts (friendship), then B is at the library.
    const s = await sendHello({ fromUserId: aId, toUserId: bId });
    if (!s.ok) throw new Error('hello failed');
    await acceptHello({ helloId: s.helloId, responderId: bId });

    await setPresence({ userId: bId, buildingId: libraryId });
    const rows = await listPresenceAtBuilding({ buildingId: libraryId, viewerId: aId });
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.isFriend).toBe(true);
    expect(row.username).not.toBeNull();
    expect(row.displayName).not.toBeNull();
  });

  test('listPresenceCountsPerBuilding: returns counts only — no names', async () => {
    await setPresence({ userId: aId, buildingId: libraryId });
    await setPresence({ userId: bId, buildingId: libraryId });
    await setPresence({ userId: cId, buildingId: libraryId });
    const counts = await listPresenceCountsPerBuilding();
    const libraryCount = counts.find((c) => c.buildingId === libraryId);
    expect(libraryCount?.count).toBe(3);
    // No userIds in the count response — privacy safe.
    expect(JSON.stringify(counts)).not.toContain(aId);
    expect(JSON.stringify(counts)).not.toContain(bId);
  });
});

describe('presence — TTL expiry', () => {
  test('expireStaleRows deletes rows past their expiresAt', async () => {
    // Insert a presence row with expiresAt in the past
    await prisma.presence.create({
      data: {
        userId: aId,
        buildingId: libraryId,
        state: 'solid',
        since: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
        expiresAt: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago (expired)
      },
    });
    await expireStaleRows();
    const remaining = await prisma.presence.findUnique({ where: { userId: aId } });
    expect(remaining).toBeNull();
  });

  test('clearPresence removes the user\'s row entirely', async () => {
    await setPresence({ userId: aId, buildingId: libraryId });
    await clearPresence(aId);
    const r = await prisma.presence.findUnique({ where: { userId: aId } });
    expect(r).toBeNull();
  });
});
