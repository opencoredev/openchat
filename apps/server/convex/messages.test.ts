/**
 * Comprehensive Tests for Convex Message Functions
 *
 * Tests cover:
 * - Message creation and listing
 * - Message updates (streaming)
 * - Attachment handling
 * - Reasoning content storage
 * - Chronological ordering
 * - Security and validation
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { modules, rateLimiter } from './testSetup.test';

// Helper to create convex test instance with components registered
function createConvexTest() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

function asExternalId(t: any, externalId: string) {
	return t.withIdentity({ subject: externalId });
}

describe('messages.list', () => {
  let t: ReturnType<typeof convexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  let externalId: string;

  beforeEach(async () => {
    t = createConvexTest();

    externalId = 'test-user';
    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const chat = await asExternalId(t, externalId).mutation(api.chats.create, {
      userId,
      title: 'Test Chat',
    });
    chatId = chat.chatId;
  });

  it('should list messages for a chat', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Hello',
        createdAt: Date.now(),
        status: 'completed',
      });
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('should return empty array for chat with no messages', async () => {
    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    expect(messages).toEqual([]);
  });

  it('should return empty array when user does not own chat', async () => {
    const otherExternalId = 'other-user';
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: otherExternalId,
        email: 'other@example.com',
        name: 'Other User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const messages = await asExternalId(t, otherExternalId).query(api.messages.list, { chatId, userId: otherUserId });

    expect(messages).toEqual([]);
  });

  it('should filter out soft-deleted messages', async () => {
    const _msg1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Active',
        createdAt: Date.now(),
        status: 'completed',
      });
    });

    const _msg2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Deleted',
        createdAt: Date.now() + 1,
        status: 'completed',
        deletedAt: Date.now(),
      });
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Active');
  });

  it('should return messages in chronological order', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'First',
        createdAt: 1000,
        status: 'completed',
      });
      await ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'Second',
        createdAt: 2000,
        status: 'completed',
      });
      await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Third',
        createdAt: 3000,
        status: 'completed',
      });
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    expect(messages.length).toBe(3);
    expect(messages[0].content).toBe('First');
    expect(messages[1].content).toBe('Second');
    expect(messages[2].content).toBe('Third');
  });

  it('should exclude redundant fields from response', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Test',
        createdAt: Date.now(),
        status: 'completed',
        userId,
      });
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    const msg = messages[0];
    expect(msg).toHaveProperty('_id');
    expect(msg).toHaveProperty('role');
    expect(msg).toHaveProperty('content');
    expect(msg).toHaveProperty('createdAt');

		// These should be excluded
		expect(msg).not.toHaveProperty('_creationTime');
		expect(msg).not.toHaveProperty('chatId');
		expect(msg).not.toHaveProperty('userId');
		// status is included in the response for streaming/UX purposes
  });

  it('should include reasoning content when present', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'Answer',
        reasoning: 'My reasoning',
        thinkingTimeMs: 5000,
        createdAt: Date.now(),
        status: 'completed',
      });
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    expect(messages[0].reasoning).toBe('My reasoning');
    expect(messages[0].thinkingTimeMs).toBe(5000);
  });

  it('should include clientMessageId when present', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        clientMessageId: 'client123',
        role: 'user',
        content: 'Test',
        createdAt: Date.now(),
        status: 'completed',
      });
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });

    expect(messages[0].clientMessageId).toBe('client123');
  });
});

describe('messages.send', () => {
  let t: ReturnType<typeof convexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  let externalId: string;

  beforeEach(async () => {
    t = createConvexTest();

    externalId = 'test-user';
    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const chat = await asExternalId(t, externalId).mutation(api.chats.create, {
      userId,
      title: 'Test Chat',
    });
    chatId = chat.chatId;
  });

  it('should send user message', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.send, {
      chatId,
      userId,
      userMessage: {
        content: 'Hello',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.userMessageId).toBeDefined();

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello');
    expect(messages[0].role).toBe('user');
  });

  it('should send both user and assistant messages', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.send, {
      chatId,
      userId,
      userMessage: {
        content: 'Hello',
      },
      assistantMessage: {
        content: 'Hi there!',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.userMessageId).toBeDefined();
    expect(result.assistantMessageId).toBeDefined();

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should return ok: false when user does not own chat', async () => {
    const otherExternalId = 'other-user';
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: otherExternalId,
        email: 'other@example.com',
        name: 'Other User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asExternalId(t, otherExternalId).mutation(api.messages.send, {
      chatId,
      userId: otherUserId,
      userMessage: {
        content: 'Hello',
      },
    });

    expect(result.ok).toBe(false);
  });

  it('should use custom timestamp when provided', async () => {
    const customTime = 123456789;
    await asExternalId(t, externalId).mutation(api.messages.send, {
      chatId,
      userId,
      userMessage: {
        content: 'Hello',
        createdAt: customTime,
      },
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages[0].createdAt).toBe(customTime);
  });

  it('should update chat timestamps', async () => {
    const before = Date.now();
    await asExternalId(t, externalId).mutation(api.messages.send, {
      chatId,
      userId,
      userMessage: {
        content: 'Hello',
      },
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    // Check that lastMessageAt was updated (greater than or equal to before)
    // Add small buffer for timing variations
    expect(chat?.lastMessageAt).toBeGreaterThanOrEqual(before);
    expect(chat?.lastMessageAt).toBeLessThanOrEqual(Date.now() + 100);
  });

  it('should store clientMessageId', async () => {
    await asExternalId(t, externalId).mutation(api.messages.send, {
      chatId,
      userId,
      userMessage: {
        content: 'Hello',
        clientMessageId: 'client123',
      },
    });

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages[0].clientMessageId).toBe('client123');
  });
});

describe('messages.streamUpsert', () => {
  let t: ReturnType<typeof convexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  let externalId: string;

  beforeEach(async () => {
    t = createConvexTest();

    externalId = 'test-user';
    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const chat = await asExternalId(t, externalId).mutation(api.chats.create, {
      userId,
      title: 'Test Chat',
    });
    chatId = chat.chatId;
  });

  it('should create new message', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Streaming...',
    });

    expect(result.ok).toBe(true);
    expect(result.messageId).toBeDefined();

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Streaming...');
  });

  it('should update existing message', async () => {
    const initial = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Partial...',
    });

    const updated = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      messageId: initial.messageId,
      role: 'assistant',
      content: 'Complete response',
    });

    expect(updated.messageId).toBe(initial.messageId);

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Complete response');
  });

  it('should default status to streaming', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Test',
    });

    const msg = await t.run(async (ctx) => await ctx.db.get(result.messageId!));
    expect(msg?.status).toBe('streaming');
  });

  it('should accept custom status', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Done',
      status: 'completed',
    });

    const msg = await t.run(async (ctx) => await ctx.db.get(result.messageId!));
    expect(msg?.status).toBe('completed');
  });

  it('should store reasoning content', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Answer',
      reasoning: 'My reasoning',
      thinkingTimeMs: 3000,
    });

    const msg = await t.run(async (ctx) => await ctx.db.get(result.messageId!));
    expect(msg?.reasoning).toBe('My reasoning');
    expect(msg?.thinkingTimeMs).toBe(3000);
  });

  it('should reject invalid role', async () => {
    await expect(
      asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
        chatId,
        userId,
        role: 'system',
        content: 'Test',
      })
    ).rejects.toThrow('Invalid message role');
  });

  it('should validate message content length (100KB max)', async () => {
    const largeContent = 'a'.repeat(101 * 1024); // 101KB

    await expect(
      asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
        chatId,
        userId,
        role: 'user',
        content: largeContent,
      })
    ).rejects.toThrow('exceeds maximum length');
  });

  it('should allow content up to 100KB', async () => {
    const maxContent = 'a'.repeat(100 * 1024);

    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'user',
      content: maxContent,
    });

    expect(result.ok).toBe(true);
  });

  it('should enforce max messages per chat limit (10,000)', async () => {
    // Set message count to limit
    await t.run(async (ctx) => {
      await ctx.db.patch(chatId, { messageCount: 10000 });
    });

    await expect(
      asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
        chatId,
        userId,
        role: 'user',
        content: 'Too many',
      })
    ).rejects.toThrow('maximum message limit');
  });

  it('should increment message count on new message', async () => {
    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'user',
      content: 'Message 1',
    });

    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Message 2',
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.messageCount).toBeGreaterThanOrEqual(2);
  });

  it('should not increment count when updating existing message', async () => {
    const initial = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Initial',
    });

    const chatBefore = await t.run(async (ctx) => await ctx.db.get(chatId));
    const countBefore = chatBefore?.messageCount || 0;

    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      messageId: initial.messageId,
      role: 'assistant',
      content: 'Updated',
    });

    const chatAfter = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chatAfter?.messageCount).toBe(countBefore);
  });

  it('should reuse message by clientMessageId', async () => {
    const first = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      clientMessageId: 'client123',
      role: 'user',
      content: 'Original',
    });

    const second = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      clientMessageId: 'client123',
      role: 'user',
      content: 'Updated',
    });

    expect(second.messageId).toBe(first.messageId);

    const messages = await asExternalId(t, externalId).query(api.messages.list, { chatId, userId });
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Updated');
  });

  it('should handle empty content', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'user',
      content: '',
    });

    expect(result.ok).toBe(true);
  });

  it('should handle whitespace-only content', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'user',
      content: '   \n\t  ',
    });

    expect(result.ok).toBe(true);
  });

  it('should validate content length in bytes not characters', async () => {
    // Unicode character that takes 4 bytes
    const unicodeChar = '𝕳';
    const content = unicodeChar.repeat(26 * 1024); // ~104KB

    await expect(
      asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
        chatId,
        userId,
        role: 'user',
        content,
      })
    ).rejects.toThrow('exceeds maximum length');
  });

  it('should update chat timestamps when status is completed', async () => {
    const before = Date.now();

    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Done',
      status: 'completed',
    });

    const after = Date.now();
    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));

    expect(chat?.lastMessageAt).toBeGreaterThanOrEqual(before);
    expect(chat?.lastMessageAt).toBeLessThanOrEqual(after);
  });

  it('should return ok: false when user does not own chat', async () => {
    const otherExternalId = 'other-user';
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: otherExternalId,
        email: 'other@example.com',
        name: 'Other User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asExternalId(t, otherExternalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId: otherUserId,
      role: 'assistant',
      content: 'Test',
    });

    expect(result.ok).toBe(false);
  });

  it('should accept user role', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'user',
      content: 'Test',
    });

    expect(result.ok).toBe(true);

    const msg = await t.run(async (ctx) => await ctx.db.get(result.messageId!));
    expect(msg?.role).toBe('user');
  });

  it('should accept assistant role', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Test',
    });

    expect(result.ok).toBe(true);

    const msg = await t.run(async (ctx) => await ctx.db.get(result.messageId!));
    expect(msg?.role).toBe('assistant');
  });

  it('completed user message uses its own createdAt for lastMessageAt', async () => {
    const customTime = 999999;

    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'user',
      content: 'User message',
      status: 'completed',
      createdAt: customTime,
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.lastMessageAt).toBe(customTime);
  });

  it('streaming status does not update chat lastMessageAt', async () => {
    const chatBefore = await t.run(async (ctx) => await ctx.db.get(chatId));
    const lastMessageAtBefore = chatBefore?.lastMessageAt;

    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Streaming...',
      status: 'streaming',
    });

    const chatAfter = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chatAfter?.lastMessageAt).toBe(lastMessageAtBefore);
  });

  it('updating existing message preserves content and status correctly', async () => {
    const initial = await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      role: 'assistant',
      content: 'Initial',
    });

    await asExternalId(t, externalId).mutation(api.messages.streamUpsert, {
      chatId,
      userId,
      messageId: initial.messageId,
      role: 'assistant',
      content: 'Updated',
      status: 'completed',
    });

    const msg = await t.run(async (ctx) => await ctx.db.get(initial.messageId!));
    expect(msg?.role).toBe('assistant');
    expect(msg?.content).toBe('Updated');
    expect(msg?.status).toBe('completed');
  });
});

describe('messages.editAndRegenerate', () => {
  let t: ReturnType<typeof createConvexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  let messageId: Id<'messages'>;
  let externalId: string;

  beforeEach(async () => {
    t = createConvexTest();
    externalId = 'edit-user';
    userId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId,
        email: 'edit@example.com',
        name: 'Edit User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    chatId = await t.run(async (ctx) =>
      ctx.db.insert('chats', {
        userId,
        title: 'Test Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 3,
      })
    );
    messageId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Original content',
        createdAt: 1000,
        status: 'completed',
      })
    );
  });

  it('returns messageId and zero softDeletedCount when no messages after target', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated content',
    });

    expect(result.messageId).toBe(messageId);
    expect(result.softDeletedCount).toBe(0);
  });

  it('updates the message content to trimmed new content', async () => {
    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: '  New content  ',
    });

    const msg = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(msg?.content).toBe('New content');
  });

  it('soft-deletes messages after the target message', async () => {
    const afterMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'After message',
        createdAt: 2000,
        status: 'completed',
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const afterMsg = await t.run(async (ctx) => ctx.db.get(afterMsgId));
    expect(afterMsg?.deletedAt).toBeDefined();
  });

  it('returns correct softDeletedCount', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'After 1',
        createdAt: 2000,
        status: 'completed',
      });
      await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'After 2',
        createdAt: 3000,
        status: 'completed',
      });
    });

    const result = await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    expect(result.softDeletedCount).toBe(2);
  });

  it('decrements chat messageCount by softDeletedCount', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'After 1',
        createdAt: 2000,
        status: 'completed',
      });
      await ctx.db.patch(chatId, { messageCount: 5 });
    });

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.messageCount).toBe(4);
  });

  it('clears chat activeStreamId', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { activeStreamId: 'job-123' }));

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.activeStreamId).toBeUndefined();
  });

  it('sets chat status to idle', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { status: 'streaming' }));

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.status).toBe('idle');
  });

  it('updates chat updatedAt', async () => {
    const before = Date.now();

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('throws when user does not own the chat', async () => {
    const otherExternalId = 'other-edit-user';
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId: otherExternalId,
        email: 'other@example.com',
        name: 'Other User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await expect(
      asExternalId(t, otherExternalId).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId: otherUserId,
        messageId,
        newContent: 'Updated',
      })
    ).rejects.toThrow('Chat not found');
  });

  it('throws when the message does not exist', async () => {
    await t.run(async (ctx) => ctx.db.delete(messageId));

    await expect(
      asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId,
        newContent: 'Updated',
      })
    ).rejects.toThrow('Message not found or not a user message');
  });

  it('throws when message is an assistant message', async () => {
    const assistantMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'I am assistant',
        createdAt: 500,
        status: 'completed',
      })
    );

    await expect(
      asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId: assistantMsgId,
        newContent: 'Updated',
      })
    ).rejects.toThrow('Message not found or not a user message');
  });

  it('throws when message is already soft-deleted', async () => {
    const deletedMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Deleted message',
        createdAt: 500,
        status: 'completed',
        deletedAt: Date.now(),
      })
    );

    await expect(
      asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId: deletedMsgId,
        newContent: 'Updated',
      })
    ).rejects.toThrow('Message not found or not a user message');
  });

  it('throws when newContent is empty string', async () => {
    await expect(
      asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId,
        newContent: '',
      })
    ).rejects.toThrow('Message content cannot be empty');
  });

  it('throws when newContent is whitespace only', async () => {
    await expect(
      asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId,
        newContent: '   \n\t   ',
      })
    ).rejects.toThrow('Message content cannot be empty');
  });

  it('cancels running stream jobs', async () => {
    const streamJobId = await t.run(async (ctx) =>
      ctx.db.insert('streamJobs', {
        chatId,
        userId,
        messageId: 'msg_123',
        status: 'running',
        model: 'gpt-4o',
        provider: 'openrouter',
        messages: [],
        content: '',
        createdAt: Date.now(),
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const job = await t.run(async (ctx) => ctx.db.get(streamJobId));
    expect(job?.status).toBe('completed');
  });

  it('cancels pending stream jobs', async () => {
    const streamJobId = await t.run(async (ctx) =>
      ctx.db.insert('streamJobs', {
        chatId,
        userId,
        messageId: 'msg_123',
        status: 'pending',
        model: 'gpt-4o',
        provider: 'openrouter',
        messages: [],
        content: '',
        createdAt: Date.now(),
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const job = await t.run(async (ctx) => ctx.db.get(streamJobId));
    expect(job?.status).toBe('completed');
  });

  it('does not delete messages at the same createdAt as target', async () => {
    const sameMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'Same time message',
        createdAt: 1000,
        status: 'completed',
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const sameMsg = await t.run(async (ctx) => ctx.db.get(sameMsgId));
    expect(sameMsg?.deletedAt).toBeUndefined();
  });

  it('preserves messages before the target', async () => {
    const beforeMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Before message',
        createdAt: 500,
        status: 'completed',
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const beforeMsg = await t.run(async (ctx) => ctx.db.get(beforeMsgId));
    expect(beforeMsg?.deletedAt).toBeUndefined();
  });

  it('does not delete the target message itself', async () => {
    await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    const msg = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(msg?.deletedAt).toBeUndefined();
  });

  it('soft-deletes multiple messages after target', async () => {
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('messages', {
          chatId,
          role: i % 2 === 0 ? 'assistant' : 'user',
          content: `After message ${i}`,
          createdAt: 2000 + i * 100,
          status: 'completed',
        });
      }
    });

    const result = await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId,
      userId,
      messageId,
      newContent: 'Updated',
    });

    expect(result.softDeletedCount).toBe(3);
  });

  it('requires authentication', async () => {
    await expect(
      t.mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId,
        newContent: 'Updated',
      })
    ).rejects.toThrow();
  });

  it('treats missing messageCount as 0 (line 219 branch)', async () => {
    const chatNoCount = await t.run(async (ctx) =>
      ctx.db.insert('chats', {
        userId,
        title: 'No Count Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const msgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId: chatNoCount,
        role: 'user',
        content: 'User msg',
        createdAt: 1000,
        status: 'completed',
      })
    );
    const afterMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId: chatNoCount,
        role: 'assistant',
        content: 'After msg',
        createdAt: 2000,
        status: 'completed',
      })
    );

    const result = await asExternalId(t, externalId).mutation(api.messages.editAndRegenerate, {
      chatId: chatNoCount,
      userId,
      messageId: msgId,
      newContent: 'Updated',
    });

    expect(result.softDeletedCount).toBe(1);
    const chat = await t.run(async (ctx) => ctx.db.get(chatNoCount));
    expect(chat?.messageCount).toBe(0);
    const afterMsg = await t.run(async (ctx) => ctx.db.get(afterMsgId));
    expect(afterMsg?.deletedAt).toBeDefined();
  });
});

describe('messages.retryMessage', () => {
  let t: ReturnType<typeof createConvexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  let messageId: Id<'messages'>;
  let externalId: string;

  beforeEach(async () => {
    t = createConvexTest();
    externalId = 'retry-user';
    userId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId,
        email: 'retry@example.com',
        name: 'Retry User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    chatId = await t.run(async (ctx) =>
      ctx.db.insert('chats', {
        userId,
        title: 'Test Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 3,
      })
    );
    messageId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Original user message',
        createdAt: 1000,
        status: 'completed',
      })
    );
  });

  it('returns userContent and zero softDeletedCount when no messages after', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    expect(result.userContent).toBe('Original user message');
    expect(result.softDeletedCount).toBe(0);
  });

  it('returns the original user message content unchanged', async () => {
    const result = await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    expect(result.userContent).toBe('Original user message');
  });

  it('soft-deletes all messages after the target', async () => {
    const afterMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'After message',
        createdAt: 2000,
        status: 'completed',
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const afterMsg = await t.run(async (ctx) => ctx.db.get(afterMsgId));
    expect(afterMsg?.deletedAt).toBeDefined();
  });

  it('returns correct softDeletedCount', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'After 1',
        createdAt: 2000,
        status: 'completed',
      });
      await ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'After 2',
        createdAt: 3000,
        status: 'completed',
      });
    });

    const result = await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    expect(result.softDeletedCount).toBe(2);
  });

  it('decrements chat messageCount by softDeletedCount', async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'After 1',
        createdAt: 2000,
        status: 'completed',
      });
      await ctx.db.patch(chatId, { messageCount: 4 });
    });

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.messageCount).toBe(3);
  });

  it('clears chat activeStreamId', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { activeStreamId: 'job-abc' }));

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.activeStreamId).toBeUndefined();
  });

  it('sets chat status to idle', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { status: 'streaming' }));

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.status).toBe('idle');
  });

  it('updates chat updatedAt', async () => {
    const before = Date.now();

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('throws when user does not own the chat', async () => {
    const otherExternalId = 'other-retry-user';
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId: otherExternalId,
        email: 'other@example.com',
        name: 'Other',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await expect(
      asExternalId(t, otherExternalId).mutation(api.messages.retryMessage, {
        chatId,
        userId: otherUserId,
        messageId,
      })
    ).rejects.toThrow('Chat not found');
  });

  it('throws when the message does not exist', async () => {
    await t.run(async (ctx) => ctx.db.delete(messageId));

    await expect(
      asExternalId(t, externalId).mutation(api.messages.retryMessage, {
        chatId,
        userId,
        messageId,
      })
    ).rejects.toThrow('Message not found');
  });

  it('throws when message is an assistant message', async () => {
    const assistantMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'assistant',
        content: 'I am assistant',
        createdAt: 500,
        status: 'completed',
      })
    );

    await expect(
      asExternalId(t, externalId).mutation(api.messages.retryMessage, {
        chatId,
        userId,
        messageId: assistantMsgId,
      })
    ).rejects.toThrow('Message not found');
  });

  it('throws when message is already soft-deleted', async () => {
    const deletedMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Deleted',
        createdAt: 500,
        status: 'completed',
        deletedAt: Date.now(),
      })
    );

    await expect(
      asExternalId(t, externalId).mutation(api.messages.retryMessage, {
        chatId,
        userId,
        messageId: deletedMsgId,
      })
    ).rejects.toThrow('Message not found');
  });

  it('cancels running stream jobs', async () => {
    const streamJobId = await t.run(async (ctx) =>
      ctx.db.insert('streamJobs', {
        chatId,
        userId,
        messageId: 'msg_xyz',
        status: 'running',
        model: 'gpt-4o',
        provider: 'openrouter',
        messages: [],
        content: '',
        createdAt: Date.now(),
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const job = await t.run(async (ctx) => ctx.db.get(streamJobId));
    expect(job?.status).toBe('completed');
  });

  it('cancels pending stream jobs', async () => {
    const streamJobId = await t.run(async (ctx) =>
      ctx.db.insert('streamJobs', {
        chatId,
        userId,
        messageId: 'msg_xyz',
        status: 'pending',
        model: 'gpt-4o',
        provider: 'openrouter',
        messages: [],
        content: '',
        createdAt: Date.now(),
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const job = await t.run(async (ctx) => ctx.db.get(streamJobId));
    expect(job?.status).toBe('completed');
  });

  it('does not delete the target message itself', async () => {
    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const msg = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(msg?.deletedAt).toBeUndefined();
  });

  it('preserves messages before the target', async () => {
    const beforeMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Before message',
        createdAt: 500,
        status: 'completed',
      })
    );

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const beforeMsg = await t.run(async (ctx) => ctx.db.get(beforeMsgId));
    expect(beforeMsg?.deletedAt).toBeUndefined();
  });

  it('handles multiple messages after target correctly', async () => {
    const msgIds = await t.run(async (ctx) => {
      const ids: Id<'messages'>[] = [];
      for (let i = 0; i < 4; i++) {
        ids.push(await ctx.db.insert('messages', {
          chatId,
          role: i % 2 === 0 ? 'assistant' : 'user',
          content: `After ${i}`,
          createdAt: 2000 + i * 100,
          status: 'completed',
        }));
      }
      return ids;
    });

    const result = await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    expect(result.softDeletedCount).toBe(4);
    for (const id of msgIds) {
      const msg = await t.run(async (ctx) => ctx.db.get(id));
      expect(msg?.deletedAt).toBeDefined();
    }
  });

  it('messageCount does not go below zero', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { messageCount: 0 }));

    await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId,
      userId,
      messageId,
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.messageCount).toBe(0);
  });

  it('requires authentication', async () => {
    await expect(
      t.mutation(api.messages.retryMessage, {
        chatId,
        userId,
        messageId,
      })
    ).rejects.toThrow();
  });

  it('treats missing messageCount as 0 when decrementing (line 298 branch)', async () => {
    const chatNoCount = await t.run(async (ctx) =>
      ctx.db.insert('chats', {
        userId,
        title: 'No Count Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const msgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId: chatNoCount,
        role: 'user',
        content: 'Retry me',
        createdAt: 1000,
        status: 'completed',
      })
    );
    const afterMsgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId: chatNoCount,
        role: 'assistant',
        content: 'After',
        createdAt: 2000,
        status: 'completed',
      })
    );

    const result = await asExternalId(t, externalId).mutation(api.messages.retryMessage, {
      chatId: chatNoCount,
      userId,
      messageId: msgId,
    });

    expect(result.softDeletedCount).toBe(1);
    const chat = await t.run(async (ctx) => ctx.db.get(chatNoCount));
    expect(chat?.messageCount).toBe(0);
    const afterMsg = await t.run(async (ctx) => ctx.db.get(afterMsgId));
    expect(afterMsg?.deletedAt).toBeDefined();
  });
});

describe('messages rate limits', () => {
  let t: ReturnType<typeof createConvexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  let externalId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createConvexTest();
    externalId = 'rl-user';
    userId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId,
        email: 'rl@example.com',
        name: 'RL User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const chat = await t.withIdentity({ subject: externalId }).mutation(api.chats.create, {
      userId,
      title: 'RL Chat',
    });
    chatId = chat.chatId;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws rate limit error after messageSend capacity is exhausted (line 77)', async () => {
    for (let i = 0; i < 10; i++) {
      await t.withIdentity({ subject: externalId }).mutation(api.messages.send, {
        chatId,
        userId,
        userMessage: { content: `Msg ${i}` },
      });
    }
    await expect(
      t.withIdentity({ subject: externalId }).mutation(api.messages.send, {
        chatId,
        userId,
        userMessage: { content: 'Over limit' },
      })
    ).rejects.toThrow();
  });

  it('send stores attachments with uploadedAt (line 94)', async () => {
    const storageId = await t.run(async (ctx) => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      return ctx.storage.store(blob);
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('fileUploads', {
        userId,
        chatId,
        storageId,
        filename: 'test.txt',
        contentType: 'text/plain',
        size: 4,
        uploadedAt: Date.now(),
      });
    });

    const result = await t.withIdentity({ subject: externalId }).mutation(api.messages.send, {
      chatId,
      userId,
      userMessage: {
        content: 'Message with attachment',
        attachments: [
          {
            storageId,
            filename: 'test.txt',
            contentType: 'text/plain',
            size: 4,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    const msgs = await t.withIdentity({ subject: externalId }).query(api.messages.list, { chatId, userId });
    expect(msgs[0].attachments?.length).toBe(1);
    expect(msgs[0].attachments?.[0].uploadedAt).toBeDefined();
  });

  it('throws rate limit error in editAndRegenerate after capacity exhausted (line 165)', async () => {
    const msgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Original',
        createdAt: Date.now(),
        status: 'completed',
      })
    );

    for (let i = 0; i < 10; i++) {
      await t.withIdentity({ subject: externalId }).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId: msgId,
        newContent: `Edit ${i}`,
      });
    }

    await expect(
      t.withIdentity({ subject: externalId }).mutation(api.messages.editAndRegenerate, {
        chatId,
        userId,
        messageId: msgId,
        newContent: 'Over limit',
      })
    ).rejects.toThrow();
  });

  it('throws rate limit error in retryMessage after capacity exhausted (line 252)', async () => {
    const msgId = await t.run(async (ctx) =>
      ctx.db.insert('messages', {
        chatId,
        role: 'user',
        content: 'Retry me',
        createdAt: Date.now(),
        status: 'completed',
      })
    );

    for (let i = 0; i < 10; i++) {
      await t.withIdentity({ subject: externalId }).mutation(api.messages.retryMessage, {
        chatId,
        userId,
        messageId: msgId,
      });
    }

    await expect(
      t.withIdentity({ subject: externalId }).mutation(api.messages.retryMessage, {
        chatId,
        userId,
        messageId: msgId,
      })
    ).rejects.toThrow();
  });

  it('throws rate limit error in streamUpsert after messageStreamUpsert capacity exhausted (line 361)', async () => {
    for (let i = 0; i < 50; i++) {
      await t.withIdentity({ subject: externalId }).mutation(api.messages.streamUpsert, {
        chatId,
        userId,
        role: 'assistant',
        content: `Stream ${i}`,
      });
    }

    await expect(
      t.withIdentity({ subject: externalId }).mutation(api.messages.streamUpsert, {
        chatId,
        userId,
        role: 'assistant',
        content: 'Over limit',
      })
    ).rejects.toThrow();
  });
});
