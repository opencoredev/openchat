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

