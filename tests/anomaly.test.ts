// ==========================================================================
// VUNA Life — tests for Phase 4 anomaly detection (cap breach + impossible
// gain + frozen account rejection).
// Run with: bun test tests/anomaly.test.ts
//
// HARD RULES tested:
//   - A goal_reward entry exceeding anomaly_max_goal_reward freezes the
//     account immediately.
//   - A wallet that exceeds cap × breach_mult after an earning entry
//     gets frozen automatically.
//   - A frozen wallet rejects ALL money movement (debits AND credits).
// ==========================================================================
import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { postLedgerEntry, freezeAccount, unfreezeAccount, getWallet } = await import('../src/lib/db/wallet');

const TEST_EMAIL = 'anomaly-test@vuna-life.local';

beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: { email: TEST_EMAIL, role: 'student', isVerifiedStudent: true, username: 'anomaly_test' },
  });
});

afterAll(async () => {
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (u) {
    await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: u.id }, { toUser: u.id }] } });
    await prisma.wallet.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => {});
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Reset the test user's wallet + ledger between tests.
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (u) {
    await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: u.id }, { toUser: u.id }] } });
    await prisma.wallet.deleteMany({ where: { userId: u.id } });
    // Seed a fresh wallet with 1000 CC via ledger (so the user has money
    // to test purchases with).
    await prisma.ledger.create({
      data: {
        fromUser: null, toUser: u.id, amount: 1000, reason: 'weekly_allowance',
        metadata: JSON.stringify({ week: 'test-init' }),
      },
    });
  }
});

describe('impossible-gain detection', () => {
  test('a goal_reward entry exceeding anomaly_max_goal_reward (100) freezes the account', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    // 999 CC as a goal_reward — way over the 100 max → should freeze + reject.
    await expect(
      postLedgerEntry({
        toUser: u.id,
        amount: 999,
        reason: 'goal_reward',
        metadata: { test: 'impossible' },
      }),
    ).rejects.toThrow(/impossible_gain_detected/);

    const w = await getWallet(u.id);
    expect(w.frozen).toBe(true);
    expect(w.frozenReason).toContain('impossible_gain');
  });

  test('a hustle_sale entry exceeding anomaly_max_hustle_sale (500) freezes the account', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    // Unfreeze first (the previous test froze the account).
    await unfreezeAccount({ userId: u.id });

    await expect(
      postLedgerEntry({
        toUser: u.id,
        amount: 600,
        reason: 'hustle_sale',
        metadata: { test: 'impossible' },
      }),
    ).rejects.toThrow(/impossible_gain_detected/);

    const w = await getWallet(u.id);
    expect(w.frozen).toBe(true);
  });

  test('a small goal_reward (within max) does NOT freeze the account', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');
    await unfreezeAccount({ userId: u.id });

    const r = await postLedgerEntry({
      toUser: u.id,
      amount: 30,
      reason: 'goal_reward',
    });
    expect(r.frozen).toBeFalsy();

    const w = await getWallet(u.id);
    expect(w.frozen).toBe(false);
  });
});

describe('cap-breach detection', () => {
  test('after multiple earnings push earned_today past cap × 1.5, the account is frozen', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');
    await unfreezeAccount({ userId: u.id });

    // Default cap is 300. Cap × 1.5 = 450.
    // Simulate a corrupted ledger by inserting 500 CC of mass_attendance
    // directly (bypassing the cap). Then any subsequent money movement
    // on this user — debit OR credit — should trigger the cap_breach
    // freeze via the pre-flight check in postLedgerEntry.
    await prisma.ledger.createMany({
      data: [
        { toUser: u.id, amount: 500, reason: 'mass_attendance', metadata: '{}' },
      ],
    });
    await unfreezeAccount({ userId: u.id });

    // Trigger the breach check by attempting ANY ledger operation.
    // The pre-flight check sees earnedToday=500 > cap×1.5=450 and freezes.
    await expect(
      postLedgerEntry({
        toUser: u.id,
        amount: 10,
        reason: 'goal_reward',
      }),
    ).rejects.toThrow(/account_frozen/);

    const w = await getWallet(u.id);
    expect(w.frozen).toBe(true);
    expect(w.frozenReason).toContain('cap_breach');
  });
});

describe('frozen account rejection', () => {
  test('a frozen wallet rejects debits (canteen purchase)', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    await freezeAccount({ userId: u.id, reason: 'test freeze' });

    await expect(
      postLedgerEntry({
        fromUser: u.id,
        amount: 50,
        reason: 'canteen_purchase',
      }),
    ).rejects.toThrow(/account_frozen/);

    const w = await getWallet(u.id);
    expect(w.balance).toBe(1000); // unchanged
  });

  test('a frozen wallet rejects credits (goal_reward)', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    await freezeAccount({ userId: u.id, reason: 'test freeze' });

    await expect(
      postLedgerEntry({
        toUser: u.id,
        amount: 30,
        reason: 'goal_reward',
      }),
    ).rejects.toThrow(/account_frozen/);

    const w = await getWallet(u.id);
    expect(w.balance).toBe(1000); // unchanged
  });

  test('unfreeze clears the flag and allows money movement again', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');
    await freezeAccount({ userId: u.id, reason: 'will unfreeze' });

    await unfreezeAccount({ userId: u.id });

    const r = await postLedgerEntry({
      toUser: u.id,
      amount: 30,
      reason: 'goal_reward',
    });
    expect(r.balance).toBe(1030);
  });
});
