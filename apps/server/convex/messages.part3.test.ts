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

import { describe, it, expect, beforeEach } from 'vitest';
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
