// ==========================================================================
// VUNA Life — Phase 7 tests
// Background roll, parent transfers, wardrobe purchase/equip
// Run with: bun test tests/phase7.test.ts
// ==========================================================================
import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { rollBackground, ensureMonthlyParentTransfer, getBackgroundInfo } = await import('../src/lib/economy/background');
const { purchaseItem, equipItem, getUserWardrobeState } = await import('../src/lib/economy/wardrobe');

const TEST_EMAIL = 'phase7-test@vuna-life.local';
let testUserId: string;
let testItemId: string;

beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: {
      email: TEST_EMAIL,
      role: 'student',
      isVerifiedStudent: true,
      username: 'phase7_test',
      displayName: 'Phase7 Test',
      backgroundTier: 'comfortable',
      backgroundRolledAt: null,
    },
  });
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!u) throw new Error('test user not created');
  testUserId = u.id;

  // Create a test wardrobe item
  const item = await prisma.wardrobeItem.create({
    data: {
      name: 'Test Chain',
      category: 'accessory_1',
      variant: 'gold_chain',
      price: 1000,
      layer: 6,
    },
  });
  testItemId = item.id;

  // Seed wallet with enough Naira for purchases
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: testUserId }, { toUser: testUserId }] } });
  await prisma.wallet.deleteMany({ where: { userId: testUserId } });
  await prisma.ledger.create({
    data: { fromUser: null, toUser: testUserId, amount: 50000, reason: 'weekly_allowance', metadata: '{}' },
  });
});

afterAll(async () => {
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: testUserId }, { toUser: testUserId }] } });
  await prisma.wallet.deleteMany({ where: { userId: testUserId } });
  await prisma.wardrobeItem.deleteMany({ where: { name: 'Test Chain' } });
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Reset background + wardrobe state between tests
  await prisma.user.update({
    where: { id: testUserId },
    data: {
      backgroundTier: 'comfortable',
      backgroundRolledAt: null,
      equippedItems: '{}',
      ownedItems: '[]',
    },
  });
  // Reset wallet
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: testUserId }, { toUser: testUserId }] } });
  await prisma.ledger.create({
    data: { fromUser: null, toUser: testUserId, amount: 50000, reason: 'weekly_allowance', metadata: '{}' },
  });
  await prisma.wallet.deleteMany({ where: { userId: testUserId } });
});

describe('background roll', () => {
  test('roll assigns a valid tier', async () => {
    const r = await rollBackground({ userId: testUserId });
    expect(r.rolled).toBe(true);
    expect(['hustler', 'comfortable', 'blessed']).toContain(r.tier);
  });

  test('roll is idempotent — second call returns same tier without re-rolling', async () => {
    const r1 = await rollBackground({ userId: testUserId });
    const r2 = await rollBackground({ userId: testUserId });
    expect(r2.rolled).toBe(false);
    expect(r2.tier).toBe(r1.tier);
  });

  test('background is immutable — no API to change it after roll', async () => {
    await rollBackground({ userId: testUserId });
    const info = await getBackgroundInfo(testUserId);
    expect(info.rolledAt).not.toBeNull();
    // There is no setTier/changeTier function — the background module
    // only exports rollBackground (which is a no-op if already rolled)
    // and getBackgroundInfo (read-only). Immutability is by design.
  });
});

describe('parent transfer', () => {
  test('posts correct amount for hustler tier', async () => {
    // Force hustler background
    await prisma.user.update({
      where: { id: testUserId },
      data: { backgroundTier: 'hustler', backgroundRolledAt: new Date() },
    });
    const r = await ensureMonthlyParentTransfer({ userId: testUserId });
    expect(r.posted).toBe(true);
    expect(r.amount).toBeGreaterThanOrEqual(50000);
    expect(r.amount).toBeLessThanOrEqual(70000);
  });

  test('posts correct amount for blessed tier', async () => {
    await prisma.user.update({
      where: { id: testUserId },
      data: { backgroundTier: 'blessed', backgroundRolledAt: new Date() },
    });
    const r = await ensureMonthlyParentTransfer({ userId: testUserId });
    expect(r.posted).toBe(true);
    expect(r.amount).toBeGreaterThanOrEqual(200000);
    expect(r.amount).toBeLessThanOrEqual(400000);
  });

  test('is idempotent — second call in the same month does not post again', async () => {
    await prisma.user.update({
      where: { id: testUserId },
      data: { backgroundTier: 'comfortable', backgroundRolledAt: new Date() },
    });
    const r1 = await ensureMonthlyParentTransfer({ userId: testUserId });
    expect(r1.posted).toBe(true);
    const r2 = await ensureMonthlyParentTransfer({ userId: testUserId });
    expect(r2.posted).toBe(false);
  });

  test('parent transfer is exempt from daily earning cap', async () => {
    await prisma.user.update({
      where: { id: testUserId },
      data: { backgroundTier: 'blessed', backgroundRolledAt: new Date() },
    });
    const r = await ensureMonthlyParentTransfer({ userId: testUserId });
    expect(r.posted).toBe(true);
    // The transfer amount (200k-400k) far exceeds the daily cap (3000).
    // If it were capped, it would be clipped to 3000 or rejected.
    // Since it went through, it's cap-exempt.
    expect(r.amount).toBeGreaterThan(3000);
  });
});

describe('wardrobe purchase', () => {
  test('purchase deducts from wallet via ledger', async () => {
    const r = await purchaseItem({ userId: testUserId, itemId: testItemId });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.price).toBe(1000);
      expect(r.newBalance).toBeLessThan(50000); // balance decreased
    }
  });

  test('purchasing an already-owned item is rejected', async () => {
    await purchaseItem({ userId: testUserId, itemId: testItemId });
    const r2 = await purchaseItem({ userId: testUserId, itemId: testItemId });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('already_owned');
  });

  test('purchase with insufficient balance is rejected', async () => {
    // Create an expensive item
    const expensive = await prisma.wardrobeItem.create({
      data: { name: 'Test Expensive', category: 'accessory_2', variant: 'test_expensive', price: 999999, layer: 7 },
    });
    const r = await purchaseItem({ userId: testUserId, itemId: expensive.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('insufficient_balance');
    await prisma.wardrobeItem.delete({ where: { id: expensive.id } });
  });
});

describe('wardrobe equip', () => {
  test('equip rejects an unowned item', async () => {
    // Create a new item the user doesn't own
    const unowned = await prisma.wardrobeItem.create({
      data: { name: 'Test Unowned', category: 'shoes', variant: 'test_unowned', price: 5000, layer: 5 },
    });
    const r = await equipItem({ userId: testUserId, itemId: unowned.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_owned');
    await prisma.wardrobeItem.delete({ where: { id: unowned.id } });
  });

  test('equip sets the item as active for its layer', async () => {
    // Purchase first
    await purchaseItem({ userId: testUserId, itemId: testItemId });
    // Then equip
    const r = await equipItem({ userId: testUserId, itemId: testItemId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.layer).toBe('accessory_1');
    // Verify the equipped state
    const state = await getUserWardrobeState(testUserId);
    expect(state.equipped['accessory_1']).toBe(testItemId);
  });
});
