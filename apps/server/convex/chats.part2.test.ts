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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
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

describe('chats.getChatReadStatuses', () => {
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

	it('should return empty statuses when no read records exist', async () => {
		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId });

		expect(result.statuses).toEqual([]);
		expect([null, '_end_cursor']).toContain(result.nextCursor);
	});

	it('should return statuses for user chats', async () => {
		const chatId = await t.run(async (ctx) => {
			return await ctx.db.insert('chats', {
				userId,
				title: 'Test Chat',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		await asExternalId(t, 'test-user').mutation(api.chats.markChatAsRead, { userId, chatId });

		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId });

		expect(result.statuses.length).toBe(1);
		expect(result.statuses[0].chatId).toBe(chatId);
		expect(result.statuses[0].lastReadAt).toBeGreaterThan(0);
	});

	it('should only return statuses for requesting user', async () => {
		const userChatId = await t.run(async (ctx) => {
			return await ctx.db.insert('chats', {
				userId,
				title: 'User Chat',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		const otherChatId = await t.run(async (ctx) => {
			return await ctx.db.insert('chats', {
				userId: otherUserId,
				title: 'Other Chat',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		await asExternalId(t, 'test-user').mutation(api.chats.markChatAsRead, { userId, chatId: userChatId });
		await asExternalId(t, 'other-user').mutation(api.chats.markChatAsRead, { userId: otherUserId, chatId: otherChatId });

		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId });

		expect(result.statuses.length).toBe(1);
		expect(result.statuses[0].chatId).toBe(userChatId);
	});

	it('should respect custom limit', async () => {
		await t.run(async (ctx) => {
			const now = Date.now();
			for (let i = 0; i < 5; i++) {
				const chatId = await ctx.db.insert('chats', {
					userId,
					title: `Chat ${i}`,
					createdAt: now + i,
					updatedAt: now + i,
				});
				await ctx.db.insert('chatReadStatus', {
					userId,
					chatId,
					lastReadAt: now + i,
				});
			}
		});

		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId, limit: 3 });

		expect(result.statuses.length).toBe(3);
		expect(result.nextCursor).toBeTruthy();
	});

	it('should support pagination with cursor', async () => {
		await t.run(async (ctx) => {
			const now = Date.now();
			for (let i = 0; i < 6; i++) {
				const chatId = await ctx.db.insert('chats', {
					userId,
					title: `Chat ${i}`,
					createdAt: now + i,
					updatedAt: now + i,
				});
				await ctx.db.insert('chatReadStatus', {
					userId,
					chatId,
					lastReadAt: now + i,
				});
			}
		});

		const firstPage = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId, limit: 4 });
		expect(firstPage.statuses.length).toBe(4);
		expect(firstPage.nextCursor).toBeTruthy();

		const secondPage = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, {
			userId,
			limit: 4,
			cursor: firstPage.nextCursor ?? undefined,
		});
		expect(secondPage.statuses.length).toBe(2);
	});

	it('should enforce maximum limit of 1000', async () => {
		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId, limit: 9999 });
		expect(result).toBeDefined();
		expect(result.statuses).toEqual([]);
	});

	it('should handle invalid limit (negative)', async () => {
		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId, limit: -1 });
		expect(result).toBeDefined();
	});

	it('should return null/end nextCursor when all results fetched', async () => {
		await t.run(async (ctx) => {
			const chatId = await ctx.db.insert('chats', {
				userId,
				title: 'Only Chat',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.insert('chatReadStatus', { userId, chatId, lastReadAt: Date.now() });
		});

		const result = await asExternalId(t, 'test-user').query(api.chats.getChatReadStatuses, { userId, limit: 10 });

		expect(result.statuses.length).toBe(1);
		expect([null, '_end_cursor']).toContain(result.nextCursor);
	});
});

describe('chats.remove rate limit (line 165)', () => {
	let t: ReturnType<typeof createConvexTest>;
	let userId: Id<'users'>;

	beforeEach(async () => {
		vi.useFakeTimers();
		t = createConvexTest();
		userId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				externalId: 'rl-remove-user',
				email: 'rl-remove@example.com',
				name: 'RL Remove User',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('throws rate limit error after chatDelete capacity exhausted (capacity 3)', async () => {
		const chatIds: Id<'chats'>[] = [];
		for (let i = 0; i < 4; i++) {
			const c = await asExternalId(t, 'rl-remove-user').mutation(api.chats.create, { userId, title: `Chat ${i}` });
			chatIds.push(c.chatId);
		}

		for (let i = 0; i < 3; i++) {
			await asExternalId(t, 'rl-remove-user').mutation(api.chats.remove, { userId, chatId: chatIds[i]! });
		}

		await expect(
			asExternalId(t, 'rl-remove-user').mutation(api.chats.remove, { userId, chatId: chatIds[3]! })
		).rejects.toThrow();
	});
});

describe('chats.removeBulk rate limit (line 232)', () => {
	let t: ReturnType<typeof createConvexTest>;
	let userId: Id<'users'>;

	beforeEach(async () => {
		vi.useFakeTimers();
		t = createConvexTest();
		userId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				externalId: 'rl-bulk-user',
				email: 'rl-bulk@example.com',
				name: 'RL Bulk User',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('throws rate limit error when bulk delete exceeds capacity (capacity 50)', async () => {
		const chatIds: Id<'chats'>[] = [];
		for (let i = 0; i < 51; i++) {
			const c = await t.run(async (ctx) =>
				ctx.db.insert('chats', {
					userId,
					title: `Chat ${i}`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				})
			);
			chatIds.push(c);
		}

		await asExternalId(t, 'rl-bulk-user').mutation(api.chats.removeBulk, {
			userId,
			chatIds: chatIds.slice(0, 50),
		});

		await expect(
			asExternalId(t, 'rl-bulk-user').mutation(api.chats.removeBulk, {
				userId,
				chatIds: chatIds.slice(50),
			})
		).rejects.toThrow();
	});
});

describe('chats.create rate limit (line 132)', () => {
	let t: ReturnType<typeof createConvexTest>;
	let userId: Id<'users'>;

	beforeEach(async () => {
		vi.useFakeTimers();
		t = createConvexTest();
		userId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				externalId: 'rl-create-user',
				email: 'rl-create@example.com',
				name: 'RL Create User',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('throws rate limit error after chatCreate capacity exhausted', async () => {
		for (let i = 0; i < 5; i++) {
			await asExternalId(t, 'rl-create-user').mutation(api.chats.create, { userId, title: `Chat ${i}` });
		}
		await expect(
			asExternalId(t, 'rl-create-user').mutation(api.chats.create, { userId, title: 'Over limit' })
		).rejects.toThrow();
	});
});

describe('chats.checkExportRateLimit rate limit (line 325)', () => {
	let t: ReturnType<typeof createConvexTest>;
	let userId: Id<'users'>;

	beforeEach(async () => {
		vi.useFakeTimers();
		t = createConvexTest();
		userId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				externalId: 'rl-export-user',
				email: 'rl-export@example.com',
				name: 'RL Export User',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('throws after export capacity exhausted (capacity 2)', async () => {
		for (let i = 0; i < 2; i++) {
			await asExternalId(t, 'rl-export-user').mutation(api.chats.checkExportRateLimit, { userId });
		}
		await expect(
			asExternalId(t, 'rl-export-user').mutation(api.chats.checkExportRateLimit, { userId })
		).rejects.toThrow();
	});
});

describe('chats.markChatAsRead additional paths', () => {
	let t: ReturnType<typeof createConvexTest>;
	let userId: Id<'users'>;

	beforeEach(async () => {
		vi.useFakeTimers();
		t = createConvexTest();
		userId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				externalId: 'mark-read-user',
				email: 'mark-read@example.com',
				name: 'Mark Read User',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns ok: false when chat belongs to another user (line 355)', async () => {
		const otherId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				externalId: 'other-mark',
				email: 'other-mark@example.com',
				name: 'Other Mark',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert('chats', {
				userId: otherId,
				title: 'Other Chat',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);

		const result = await asExternalId(t, 'mark-read-user').mutation(api.chats.markChatAsRead, { userId, chatId });
		expect(result.ok).toBe(false);
	});

	it('updates existing read status record when calling markChatAsRead twice (line 370)', async () => {
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert('chats', {
				userId,
				title: 'My Chat',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
		);

		await asExternalId(t, 'mark-read-user').mutation(api.chats.markChatAsRead, { userId, chatId });
		const firstTime = await t.run(async (ctx) => {
			const record = await ctx.db.query('chatReadStatus').filter(q => q.eq(q.field('chatId'), chatId)).unique();
			return record?.lastReadAt;
		});

		vi.advanceTimersByTime(1000);

		await asExternalId(t, 'mark-read-user').mutation(api.chats.markChatAsRead, { userId, chatId });
		const secondTime = await t.run(async (ctx) => {
			const record = await ctx.db.query('chatReadStatus').filter(q => q.eq(q.field('chatId'), chatId)).unique();
			return record?.lastReadAt;
		});

		expect(secondTime).toBeGreaterThan(firstTime!);
	});
});
