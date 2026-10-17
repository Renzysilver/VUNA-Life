// ==========================================================================
// VUNA Life — chat (1:1 messages between accepted hello pairs)
//
// HARD RULES:
//   - Chats only open AFTER a hello is accepted (which creates the
//     friendship + chat row). No open DMs to strangers.
//   - Under-18 (is_minor=true): can only send to accepted friends.
//     Naturally enforced because chats only exist post-acceptance,
//     but we double-check on every send.
//   - Blocked users: their chat is deleted (blockHello removes the chat
//     row). Subsequent message attempts to a deleted chat return 404.
//   - No real name, hostel, or matric in messages (rule is in the UI;
//     server just stores the body text. The UI warns if a user asks
//     for PII too fast.)
// ==========================================================================
import { db } from '@/lib/db';
import { writeAudit, type AuditContext } from '@/lib/db/audit-log';

export type ChatListItem = {
  id: string;
  otherUserId: string;
  otherUsername: string | null;
  otherDisplayName: string | null;
  otherDepartment: { code: string; name: string } | null;
  lastMessageBody: string | null;
  lastMessageAt: Date | null;
};

/**
 * List the user's chats. For the People tab.
 */
export async function listMyChats(userId: string): Promise<ChatListItem[]> {
  const chats = await db.chat.findMany({
    where: { OR: [{ userA: userId }, { userB: userId }] },
    orderBy: { createdAt: 'desc' },
  });

  const out: ChatListItem[] = [];
  for (const c of chats) {
    const otherId = c.userA === userId ? c.userB : c.userA;
    const other = await db.user.findUnique({
      where: { id: otherId },
      include: { department: true },
    });
    if (!other) continue;
    const lastMsg = await db.message.findFirst({
      where: { chatId: c.id },
      orderBy: { createdAt: 'desc' },
    });
    out.push({
      id: c.id,
      otherUserId: otherId,
      otherUsername: other.username,
      otherDisplayName: other.displayName,
      otherDepartment: other.department
        ? { code: other.department.code, name: other.department.name }
        : null,
      lastMessageBody: lastMsg?.body ?? null,
      lastMessageAt: lastMsg?.createdAt ?? null,
    });
  }
  return out;
}

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'chat_not_found' | 'not_participant' | 'under_18_blocked' | 'blocked'; message: string };

/**
 * Send a message in a chat. Verifies:
 *   - The chat exists.
 *   - The sender is a participant.
 *   - The sender + recipient are still friends (not blocked).
 *   - If either party is under 18, the chat must exist (it only would
 *     if they were accepted friends).
 */
export async function sendMessage(args: {
  chatId: string;
  senderId: string;
  body: string;
  ctx?: AuditContext;
}): Promise<SendMessageResult> {
  const chat = await db.chat.findUnique({ where: { id: args.chatId } });
  if (!chat) return { ok: false, reason: 'chat_not_found', message: 'Chat not found.' };

  const isParticipant = chat.userA === args.senderId || chat.userB === args.senderId;
  if (!isParticipant) {
    return { ok: false, reason: 'not_participant', message: 'You are not in this chat.' };
  }

  const otherId = chat.userA === args.senderId ? chat.userB : chat.userA;

  // Check if either side has blocked the other — if so, the chat
  // row should have been deleted by blockHello. But just in case,
  // check the hellos table.
  const blockExists = await db.hello.findFirst({
    where: {
      OR: [
        { fromUser: args.senderId, toUser: otherId, status: 'blocked' },
        { fromUser: otherId, toUser: args.senderId, status: 'blocked' },
      ],
    },
  });
  if (blockExists) {
    return { ok: false, reason: 'blocked', message: 'This chat is no longer available.' };
  }

  // Under-18 rule: minors can only chat with accepted friends. Since the
  // chat exists, they ARE friends. But verify the other side is still
  // verified (in case their verification was revoked).
  const other = await db.user.findUnique({ where: { id: otherId } });
  if (other && !other.isVerifiedStudent) {
    return { ok: false, reason: 'under_18_blocked', message: 'This account is no longer verified.' };
  }

  const trimmed = args.body.trim().slice(0, 1000);
  if (!trimmed) {
    return { ok: false, reason: 'under_18_blocked', message: 'Empty message.' };
  }

  const msg = await db.message.create({
    data: { chatId: args.chatId, senderId: args.senderId, body: trimmed },
  });

  await writeAudit(args.ctx ?? {}, 'send_message', 'messages', msg.id, null, {
    chatId: args.chatId,
    senderId: args.senderId,
    length: trimmed.length,
  });

  return { ok: true, messageId: msg.id };
}

export async function listMessages(chatId: string, viewerId: string, limit = 100): Promise<{
  ok: boolean;
  messages?: Array<{ id: string; senderId: string; body: string; createdAt: Date }>;
  reason?: string;
}> {
  const chat = await db.chat.findUnique({ where: { id: chatId } });
  if (!chat) return { ok: false, reason: 'chat_not_found' };
  const isParticipant = chat.userA === viewerId || chat.userB === viewerId;
  if (!isParticipant) return { ok: false, reason: 'not_participant' };

  const rows = await db.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return {
    ok: true,
    messages: rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}
