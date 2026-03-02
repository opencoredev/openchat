import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

function asExternalId(t: any, externalId: string) {
  return t.withIdentity({ subject: externalId });
}

describe('chats.setActiveStream', () => {
  let t: ReturnType<typeof createConvexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createConvexTest();
    userId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId: 'stream-user',
        email: 'stream@example.com',
        name: 'Stream User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const chat = await asExternalId(t, 'stream-user').mutation(api.chats.create, {
      userId,
      title: 'Stream Chat',
    });
    chatId = chat.chatId;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets activeStreamId and status to streaming when streamId is provided', async () => {
    await asExternalId(t, 'stream-user').mutation(api.chats.setActiveStream, {
      chatId,
      userId,
      streamId: 'stream-abc',
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.activeStreamId).toBe('stream-abc');
    expect(chat?.status).toBe('streaming');
  });

  it('clears activeStreamId and sets status to idle when streamId is null', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { activeStreamId: 'old-stream', status: 'streaming' }));

    await asExternalId(t, 'stream-user').mutation(api.chats.setActiveStream, {
      chatId,
      userId,
      streamId: null,
    });

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.activeStreamId).toBeUndefined();
    expect(chat?.status).toBe('idle');
  });

  it('returns null without patching when chat does not belong to user', async () => {
    const otherId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId: 'other-stream',
        email: 'other@example.com',
        name: 'Other',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const otherChat = await t.run(async (ctx) =>
      ctx.db.insert('chats', { userId: otherId, title: 'Other Chat', createdAt: Date.now(), updatedAt: Date.now() })
    );

    const result = await asExternalId(t, 'stream-user').mutation(api.chats.setActiveStream, {
      chatId: otherChat,
      userId,
      streamId: 'stream-xyz',
    });

    expect(result).toBeNull();
    const chat = await t.run(async (ctx) => ctx.db.get(otherChat));
    expect(chat?.activeStreamId).toBeUndefined();
  });
});

describe('chats.getActiveStream', () => {
  let t: ReturnType<typeof createConvexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = createConvexTest();
    userId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId: 'gas-user',
        email: 'gas@example.com',
        name: 'GAS User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const chat = await asExternalId(t, 'gas-user').mutation(api.chats.create, {
      userId,
      title: 'GAS Chat',
    });
    chatId = chat.chatId;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no active stream', async () => {
    const result = await asExternalId(t, 'gas-user').query(api.chats.getActiveStream, { chatId, userId });
    expect(result).toBeNull();
  });

  it('returns stream ID when one is set', async () => {
    await t.run(async (ctx) => ctx.db.patch(chatId, { activeStreamId: 'stream-123' }));

    const result = await asExternalId(t, 'gas-user').query(api.chats.getActiveStream, { chatId, userId });
    expect(result).toBe('stream-123');
  });

  it('returns null when chat does not belong to user', async () => {
    const otherId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        externalId: 'other-gas',
        email: 'other-gas@example.com',
        name: 'Other GAS',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const otherChat = await t.run(async (ctx) =>
      ctx.db.insert('chats', {
        userId: otherId,
        title: 'Other',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        activeStreamId: 'stream-xyz',
      })
    );

    const result = await asExternalId(t, 'gas-user').query(api.chats.getActiveStream, {
      chatId: otherChat,
      userId,
    });
    expect(result).toBeNull();
  });
});
