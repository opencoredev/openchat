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

describe('chats.remove (soft delete)', () => {
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

	it('should soft delete chat when user owns it', async () => {
		const created = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'My Chat',
		});

		const result = await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

    expect(result.ok).toBe(true);

    const chat = await t.run(async (ctx) => await ctx.db.get(created.chatId));
    expect(chat?.deletedAt).toBeDefined();
    expect(chat?.messageCount).toBe(0);
  });

	it('should soft delete all messages in chat', async () => {
		const chat = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'Chat with messages',
		});

    // Create some messages
    const msg1 = await t.run(async (ctx) => {
      return await ctx.db.insert('messages', {
        chatId: chat.chatId,
        role: 'user',
        content: 'Message 1',
        createdAt: Date.now(),
        status: 'completed',
      });
    });

    const msg2 = await t.run(async (ctx) => {
      return await ctx.db.insert('messages', {
        chatId: chat.chatId,
        role: 'assistant',
        content: 'Message 2',
        createdAt: Date.now(),
        status: 'completed',
      });
    });

		await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: chat.chatId,
			userId,
		});

    const message1 = await t.run(async (ctx) => await ctx.db.get(msg1));
    const message2 = await t.run(async (ctx) => await ctx.db.get(msg2));

    expect(message1?.deletedAt).toBeDefined();
    expect(message2?.deletedAt).toBeDefined();
  });

  it('should return false when chat does not exist', async () => {
    // Create a valid ID that doesn't exist
    const fakeChatId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('chats', {
        userId,
        title: 'Fake Chat',
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

		const result = await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: fakeChatId,
			userId,
		});

    expect(result.ok).toBe(false);
  });

	it('should return false when user does not own chat', async () => {
		const created = await asExternalId(t, 'other-user').mutation(api.chats.create, {
			userId: otherUserId,
			title: 'Other Chat',
		});

		const result = await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId, // Different user
		});

    expect(result.ok).toBe(false);
  });

	it('should return false when chat already deleted', async () => {
		const created = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'My Chat',
		});

		await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

		// Try to delete again
		const result = await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

    expect(result.ok).toBe(false);
  });

	it('should reset messageCount to 0', async () => {
		const created = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'My Chat',
		});

    // Update message count
    await t.run(async (ctx) => {
      await ctx.db.patch(created.chatId, { messageCount: 10 });
    });

		await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

    const chat = await t.run(async (ctx) => await ctx.db.get(created.chatId));
    expect(chat?.messageCount).toBe(0);
  });

	it('should handle deletion with no messages', async () => {
		const created = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'Empty Chat',
		});

		const result = await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

    expect(result.ok).toBe(true);
  });

	it('should not appear in list after deletion', async () => {
		const created = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'To Delete',
		});

		await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

		const list = await asExternalId(t, 'test-user').query(api.chats.list, { userId });

    expect(list.chats.length).toBe(0);
  });

	it('should not be retrievable after deletion', async () => {
		const created = await asExternalId(t, 'test-user').mutation(api.chats.create, {
			userId,
			title: 'To Delete',
		});

		await asExternalId(t, 'test-user').mutation(api.chats.remove, {
			chatId: created.chatId,
			userId,
		});

		const chat = await asExternalId(t, 'test-user').query(api.chats.get, {
			chatId: created.chatId,
			userId,
		});

    expect(chat).toBe(null);
  });
});
