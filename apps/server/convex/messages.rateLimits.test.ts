import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { modules, rateLimiter } from './testSetup.test';

function createConvexTest() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

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
