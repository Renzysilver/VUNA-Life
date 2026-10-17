// ==========================================================================
// VUNA Life — Phase 7 UI tests (avatar config + wardrobe equip + snapshot)
// Run with: bun test tests/avatar-wardrobe.test.ts
// ==========================================================================
import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { purchaseItem, equipItem, getUserWardrobeState } = await import('../src/lib/economy/wardrobe');

const TEST_EMAIL = 'avatar-wardrobe-test@vuna-life.local';
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
      username: 'avatar_test',
      displayName: 'Avatar Test',
      avatarConfig: '{}',
      equippedItems: '{}',
      ownedItems: '[]',
    },
  });
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!u) throw new Error('test user not created');
  testUserId = u.id;

  // Create a test wardrobe item
  const item = await prisma.wardrobeItem.create({
    data: { name: 'Test Shirt', category: 'outfit_top', variant: 'white_button_down', price: 500, layer: 3 },
  });
  testItemId = item.id;

  // Seed wallet
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: testUserId }, { toUser: testUserId }] } });
  await prisma.wallet.deleteMany({ where: { userId: testUserId } });
  await prisma.ledger.create({
    data: { fromUser: null, toUser: testUserId, amount: 50000, reason: 'weekly_allowance', metadata: '{}' },
  });
});

afterAll(async () => {
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: testUserId }, { toUser: testUserId }] } });
  await prisma.wallet.deleteMany({ where: { userId: testUserId } });
  await prisma.wardrobeItem.deleteMany({ where: { name: 'Test Shirt' } });
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.user.update({
    where: { id: testUserId },
    data: { avatarConfig: '{}', equippedItems: '{}', ownedItems: '[]' },
  });
  await prisma.ledger.deleteMany({ where: { OR: [{ fromUser: testUserId }, { toUser: testUserId }] } });
  await prisma.ledger.create({
    data: { fromUser: null, toUser: testUserId, amount: 50000, reason: 'weekly_allowance', metadata: '{}' },
  });
  await prisma.wallet.deleteMany({ where: { userId: testUserId } });
});

describe('avatar config', () => {
  test('saves bodyType + skinTone correctly via db update', async () => {
    await prisma.user.update({
      where: { id: testUserId },
      data: { avatarConfig: JSON.stringify({ bodyType: 'slim', skinTone: '#EAC086' }) },
    });
    const u = await prisma.user.findUnique({ where: { id: testUserId } });
    const cfg = JSON.parse(u?.avatarConfig || '{}');
    expect(cfg.bodyType).toBe('slim');
    expect(cfg.skinTone).toBe('#EAC086');
  });

  test('is user-scoped — updating user A does not affect user B', async () => {
    // Create a second user
    const bEmail = 'avatar-b@vuna-life.local';
    await prisma.user.upsert({
      where: { email: bEmail },
      update: {},
      create: { email: bEmail, role: 'student', isVerifiedStudent: true, username: 'avatar_b', avatarConfig: '{}' },
    });
    const b = await prisma.user.findUnique({ where: { email: bEmail } });

    // Set A's config
    await prisma.user.update({
      where: { id: testUserId },
      data: { avatarConfig: JSON.stringify({ bodyType: 'full', skinTone: '#3D1C0A' }) },
    });

    // B's config should still be {}
    const bUser = await prisma.user.findUnique({ where: { id: b!.id } });
    const bCfg = JSON.parse(bUser?.avatarConfig || '{}');
    expect(bCfg.bodyType).toBeUndefined();

    // Cleanup
    await prisma.user.delete({ where: { email: bEmail } }).catch(() => {});
  });
});

describe('wardrobe equip flow', () => {
  test('equip updates the live avatar state (equippedItems JSON)', async () => {
    // Purchase first
    const purchase = await purchaseItem({ userId: testUserId, itemId: testItemId });
    expect(purchase.ok).toBe(true);

    // Equip
    const equip = await equipItem({ userId: testUserId, itemId: testItemId });
    expect(equip.ok).toBe(true);

    // Verify the equipped state
    const state = await getUserWardrobeState(testUserId);
    expect(state.equipped['outfit_top']).toBe(testItemId);
  });

  test('wardrobe state shows owned items after purchase', async () => {
    const before = await getUserWardrobeState(testUserId);
    expect(before.owned).toHaveLength(0);

    await purchaseItem({ userId: testUserId, itemId: testItemId });

    const after = await getUserWardrobeState(testUserId);
    expect(after.owned).toHaveLength(1);
    expect(after.owned).toContain(testItemId);
  });

  test('day summary avatar snapshot stores equippedItems at generation time', async () => {
    // Purchase + equip an item
    await purchaseItem({ userId: testUserId, itemId: testItemId });
    await equipItem({ userId: testUserId, itemId: testItemId });

    // Get equipped state (this is what would be snapshotted)
    const state = await getUserWardrobeState(testUserId);
    const snapshot = JSON.stringify(state.equipped);

    // Store a day summary with the snapshot
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.daySummary.deleteMany({ where: { userId: testUserId } });
    const ds = await prisma.daySummary.create({
      data: {
        userId: testUserId,
        summaryDate: today,
        payload: '{}',
        avatarSnapshot: snapshot,
      },
    });

    // Verify the snapshot was stored
    const stored = await prisma.daySummary.findUnique({ where: { id: ds.id } });
    const storedSnapshot = JSON.parse(stored?.avatarSnapshot || '{}');
    expect(storedSnapshot['outfit_top']).toBe(testItemId);

    // Cleanup
    await prisma.daySummary.deleteMany({ where: { userId: testUserId } });
  });
});
