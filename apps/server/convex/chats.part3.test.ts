/**
 * Comprehensive Tests for Convex Chat Functions
 *
 * Tests cover:
 * - Chat creation with validation and sanitization
 * - Chat listing with pagination and filtering
 * - Chat retrieval with ownership checks
 * - Chat deletion (soft delete) with cascading
 * - Rate limiting
 * - Security and authorization
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

describe('chats.removeBulk', () => {
  let t: ReturnType<typeof convexTest>;
  let userId: Id<'users'>;
  let otherUserId: Id<'users'>;

  beforeEach(async () => {
    t = createConvexTest();

    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: 'other-user',
        email: 'other@example.com',
        name: 'Other User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  });

	it('should return early with empty array', async () => {
		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds: [],
			userId,
		});

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(0);
  });

	it('should throw error when exceeding max bulk size (51 chats)', async () => {
    // Create 51 chat IDs (we don't actually need them to exist for this test)
    const chatIds: Id<'chats'>[] = [];
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 51; i++) {
        const id = await ctx.db.insert('chats', {
          userId,
          title: `Chat ${i}`,
          messageCount: 0,
          createdAt: now + i,
          updatedAt: now + i,
        });
        chatIds.push(id);
      }
    });

		await expect(
			asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
				chatIds,
				userId,
			})
		).rejects.toThrow('Cannot delete more than 50 chats at once');
  });

	it('should delete multiple owned chats successfully', async () => {
    // Create chats directly to avoid rate limiting
    const chatIds: Id<'chats'>[] = [];
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        const id = await ctx.db.insert('chats', {
          userId,
          title: `Chat ${i}`,
          messageCount: 0,
          createdAt: now + i,
          updatedAt: now + i,
        });
        chatIds.push(id);
      }
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds,
			userId,
		});

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(3);
    expect(result.failed).toBe(0);

    // Verify all chats are soft-deleted
    for (const chatId of chatIds) {
      const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
      expect(chat?.deletedAt).toBeDefined();
      expect(chat?.messageCount).toBe(0);
    }
  });

	it('should handle mixed owned and unowned chats', async () => {
    const ownedChatIds: Id<'chats'>[] = [];
    const unownedChatIds: Id<'chats'>[] = [];

    await t.run(async (ctx) => {
      const now = Date.now();
      // Create owned chats
      for (let i = 0; i < 2; i++) {
        const id = await ctx.db.insert('chats', {
          userId,
          title: `Owned Chat ${i}`,
          messageCount: 0,
          createdAt: now + i,
          updatedAt: now + i,
        });
        ownedChatIds.push(id);
      }
      // Create unowned chats
      for (let i = 0; i < 2; i++) {
        const id = await ctx.db.insert('chats', {
          userId: otherUserId,
          title: `Unowned Chat ${i}`,
          messageCount: 0,
          createdAt: now + 10 + i,
          updatedAt: now + 10 + i,
        });
        unownedChatIds.push(id);
      }
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds: [...ownedChatIds, ...unownedChatIds],
			userId,
		});

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(2);
    expect(result.failed).toBe(2);

    // Verify owned chats are deleted
    for (const chatId of ownedChatIds) {
      const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
      expect(chat?.deletedAt).toBeDefined();
    }

    // Verify unowned chats are NOT deleted
    for (const chatId of unownedChatIds) {
      const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
      expect(chat?.deletedAt).toBeUndefined();
    }
  });

	it('should skip already deleted chats', async () => {
    const chatIds: Id<'chats'>[] = [];
    await t.run(async (ctx) => {
      const now = Date.now();
      // Create active chat
      const activeId = await ctx.db.insert('chats', {
        userId,
        title: 'Active Chat',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      chatIds.push(activeId);

      // Create already deleted chat
      const deletedId = await ctx.db.insert('chats', {
        userId,
        title: 'Deleted Chat',
        messageCount: 0,
        createdAt: now + 1,
        updatedAt: now + 1,
        deletedAt: now + 1,
      });
      chatIds.push(deletedId);
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds,
			userId,
		});

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(1);
  });

	it('should soft delete all messages in bulk deleted chats', async () => {
    let chatId: Id<'chats'>;
    const messageIds: Id<'messages'>[] = [];

    await t.run(async (ctx) => {
      const now = Date.now();
      chatId = await ctx.db.insert('chats', {
        userId,
        title: 'Chat with messages',
        messageCount: 3,
        createdAt: now,
        updatedAt: now,
      });

      // Create messages for this chat
      for (let i = 0; i < 3; i++) {
        const msgId = await ctx.db.insert('messages', {
          chatId,
          role: 'user',
          content: `Message ${i}`,
          createdAt: now + i,
          status: 'completed',
        });
        messageIds.push(msgId);
      }
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds: [chatId!],
			userId,
		});

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(1);

    // Verify all messages are soft-deleted
    for (const msgId of messageIds) {
      const msg = await t.run(async (ctx) => await ctx.db.get(msgId));
      expect(msg?.deletedAt).toBeDefined();
    }
  });

	it('should not delete chats belonging to other users', async () => {
    let otherChatId: Id<'chats'>;
    await t.run(async (ctx) => {
      const now = Date.now();
      otherChatId = await ctx.db.insert('chats', {
        userId: otherUserId,
        title: 'Other User Chat',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds: [otherChatId!],
			userId,
		});

    expect(result.ok).toBe(false);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(1);

    // Verify chat is NOT deleted
    const chat = await t.run(async (ctx) => await ctx.db.get(otherChatId!));
    expect(chat?.deletedAt).toBeUndefined();
  });

	it('should not appear in list after bulk deletion', async () => {
    const chatIds: Id<'chats'>[] = [];
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        const id = await ctx.db.insert('chats', {
          userId,
          title: `Chat ${i}`,
          messageCount: 0,
          createdAt: now + i,
          updatedAt: now + i,
        });
        chatIds.push(id);
      }
    });

		await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds,
			userId,
		});

		const list = await asExternalId(t, 'test-user').query(api.chats.list, { userId });
    expect(list.chats.length).toBe(0);
  });

	it('should return ok: false when all chats fail to delete', async () => {
    // Create chats owned by another user
    const chatIds: Id<'chats'>[] = [];
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 2; i++) {
        const id = await ctx.db.insert('chats', {
          userId: otherUserId,
          title: `Other Chat ${i}`,
          messageCount: 0,
          createdAt: now + i,
          updatedAt: now + i,
        });
        chatIds.push(id);
      }
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.removeBulk, {
			chatIds,
			userId,
		});

    expect(result.ok).toBe(false);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(2);
  });
});

describe('chats.checkExportRateLimit', () => {
  let t: ReturnType<typeof convexTest>;
  let userId: Id<'users'>;

  beforeEach(async () => {
    t = createConvexTest();

    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  });

	it('should return ok: true when not rate limited', async () => {
		const result = await asExternalId(t, 'test-user').mutation(api.chats.checkExportRateLimit, {
			userId,
		});

    expect(result.ok).toBe(true);
  });

	it('should allow multiple export checks within limit', async () => {
		const result1 = await asExternalId(t, 'test-user').mutation(api.chats.checkExportRateLimit, { userId });
		const result2 = await asExternalId(t, 'test-user').mutation(api.chats.checkExportRateLimit, { userId });

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });
});

describe('chats.setGeneratedTitle', () => {
  let t: ReturnType<typeof convexTest>;
  let userId: Id<'users'>;

  beforeEach(async () => {
    t = createConvexTest();

    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  });

	it('should update title when chat still has default title', async () => {
    const chatId = await t.run(async (ctx) => {
      return await ctx.db.insert('chats', {
        userId,
        title: 'New Chat',
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await asExternalId(t, 'test-user').mutation(api.chatTitle.setGeneratedTitle, {
      chatId,
      userId,
      title: 'Generated Title',
      force: false,
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.title).toBe('Generated Title');
  });

	it('should bump updatedAt for generated title updates', async () => {
    const chatId = await t.run(async (ctx) => {
      return await ctx.db.insert('chats', {
        userId,
        title: 'New Chat',
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await asExternalId(t, 'test-user').mutation(api.chatTitle.setGeneratedTitle, {
      chatId,
      userId,
      title: 'Fresh Title',
      force: false,
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.updatedAt).toBeGreaterThan(1);
  });

	it('should not overwrite a custom title without force', async () => {
    const chatId = await t.run(async (ctx) => {
      return await ctx.db.insert('chats', {
        userId,
        title: 'Already Custom',
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await asExternalId(t, 'test-user').mutation(api.chatTitle.setGeneratedTitle, {
      chatId,
      userId,
      title: 'Should Not Apply',
      force: false,
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.title).toBe('Already Custom');
  });

	it('should overwrite a custom title when force=true', async () => {
    const chatId = await t.run(async (ctx) => {
      return await ctx.db.insert('chats', {
        userId,
        title: 'Already Custom',
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await asExternalId(t, 'test-user').mutation(api.chatTitle.setGeneratedTitle, {
      chatId,
      userId,
      title: 'Forced Replace',
      force: true,
    });

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.title).toBe('Forced Replace');
  });
});
