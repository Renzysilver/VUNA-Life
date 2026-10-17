// ==========================================================================
// VUNA Life — tests for wallet adapter (DEMO_MODE local adapter)
// Run with: bun test tests/wallet.test.ts
//
// HARD RULE tested: balance is ALWAYS recomputed from the append-only ledger.
// No code path can set a balance directly. Earning cap is enforced.
// ==========================================================================
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// We import the wallet adapter. To test it in isolation we use a temp user
// + temp ledger rows. The wallet adapter reads from the same DB the seed
// script uses (file:...db/custom.db), so these tests are integration tests
// against the local SQLite.
const { postLedgerEntry, getWallet, recomputeWallet } = await import('../src/lib/db/wallet');

const TEST_EMAIL = 'wallet-test@vuna-life.local';

beforeAll(async () => {
  // Create the test user (no school-email verification needed for the test).
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: { email: TEST_EMAIL, role: 'student', isVerifiedStudent: false },
  });
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!u) throw new Error('test user not created');

  // Clean any previous ledger/wallet rows for this user.
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: u.id }, { toUser: u.id }] } });
  await prisma.wallet.deleteMany({ where: { userId: u.id } });
});

afterAll(async () => {
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (u) {
    await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: u.id }, { toUser: u.id }] } });
    await prisma.wallet.deleteMany({ where: { userId: u.id } });
  }
  await prisma.$disconnect();
});

describe('wallet balance is ledger-derived (never directly set)', () => {
  test('empty ledger → zero balance', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');
    await recomputeWallet(u.id);
    const w = await getWallet(u.id);
    expect(w.balance).toBe(0);
    expect(w.earnedToday).toBe(0);
  });

  test('single credit (weekly_allowance) → balance = amount', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    await postLedgerEntry({
      toUser: u.id,
      amount: 1200,
      reason: 'weekly_allowance',
      metadata: { week: 'test1' },
    });
    const w = await getWallet(u.id);
    expect(w.balance).toBe(1200);
  });

  test('debit reduces balance', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    await postLedgerEntry({
      fromUser: u.id,
      amount: 100,
      reason: 'canteen_purchase',
      metadata: { item: 'rice' },
    });
    const w = await getWallet(u.id);
    expect(w.balance).toBe(1100); // 1200 - 100
  });

  test('cannot debit more than balance — throws', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    const before = (await getWallet(u.id)).balance;
    await expect(
      postLedgerEntry({
        fromUser: u.id,
        amount: before + 1,
        reason: 'attempt_overspend',
      }),
    ).rejects.toThrow(/insufficient_balance/);

    // Balance unchanged
    const after = await getWallet(u.id);
    expect(after.balance).toBe(before);
  });

  test('amount = 0 rejected', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    await expect(
      postLedgerEntry({
        toUser: u.id,
        amount: 0,
        reason: 'zero_test',
      }),
    ).rejects.toThrow(/amount must be > 0/);
  });

  test('neither fromUser nor toUser rejected', async () => {
    await expect(
      postLedgerEntry({
        amount: 50,
        reason: 'orphan_test',
      }),
    ).rejects.toThrow(/need at least one of fromUser\/toUser/);
  });
});

describe('daily earning cap is enforced', () => {
  test('earning past the cap is clipped, not refused', async () => {
    const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!u) throw new Error('no test user');

    // Read the cap (default 300 CC from config).
    const before = await getWallet(u.id);
    const cap = before.dailyEarningCap;

    // Earn cap + 50 using the 'earning' reason (no per-reason max
    // configured, so it won't trigger impossible-gain detection). Should
    // clip to cap exactly.
    const r = await postLedgerEntry({
      toUser: u.id,
      amount: cap + 50,
      reason: 'earning',
      metadata: { test: 'cap_clip' },
    });
    expect(r.capped).toBe(true);
    expect(r.earnedToday).toBe(cap); // clipped at cap, not cap + 50

    // Subsequent earning in the same day is blocked entirely.
    const r2 = await postLedgerEntry({
      toUser: u.id,
      amount: 10,
      reason: 'earning',
      metadata: { test: 'cap_block' },
    });
    expect(r2.capped).toBe(true);
    expect(r2.earnedToday).toBe(cap);
  });
});
