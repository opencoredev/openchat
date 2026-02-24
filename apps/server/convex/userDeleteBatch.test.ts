import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import { internal } from "./_generated/api";
import { normalizeBatchSize } from "./userDeleteBatch";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter } from "./testSetup.test";

let t: ReturnType<typeof makeConvexTest>;

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

beforeEach(() => {
	vi.useFakeTimers();
	t = makeConvexTest();
});

afterEach(() => {
	vi.useRealTimers();
});

async function seedUser(externalId: string): Promise<Id<"users">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			externalId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
}

async function seedChat(userId: Id<"users">): Promise<Id<"chats">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("chats", {
			userId,
			title: "Test Chat",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
}

describe("normalizeBatchSize (pure function)", () => {
	test("returns default (100) for undefined", () => {
		expect(normalizeBatchSize(undefined)).toBe(100);
	});

	test("returns default (100) for zero", () => {
		expect(normalizeBatchSize(0)).toBe(100);
	});

	test("returns default (100) for negative values", () => {
		expect(normalizeBatchSize(-5)).toBe(100);
	});

	test("returns default (100) for NaN", () => {
		expect(normalizeBatchSize(Number.NaN)).toBe(100);
	});

	test("returns default (100) for Infinity (not finite)", () => {
		expect(normalizeBatchSize(Number.POSITIVE_INFINITY)).toBe(100);
	});

	test("returns provided value for valid positive number", () => {
		expect(normalizeBatchSize(50)).toBe(50);
	});

	test("returns provided value for exactly 1", () => {
		expect(normalizeBatchSize(1)).toBe(1);
	});

	test("caps at maximum (500)", () => {
		expect(normalizeBatchSize(1000)).toBe(500);
	});

	test("returns exactly 500 when at limit", () => {
		expect(normalizeBatchSize(500)).toBe(500);
	});

	test("floors fractional values", () => {
		expect(normalizeBatchSize(7.9)).toBe(7);
	});
});

describe("deleteUserStreamJobs", () => {
	test("returns deleted:0, hasMore:false when no jobs exist", async () => {
		const userId = await seedUser("del_jobs_empty");
		const result = await t.mutation(internal.userDeleteBatch.deleteUserStreamJobs, { userId });
		expect(result.deleted).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test("deletes all stream jobs for the user", async () => {
		const userId = await seedUser("del_jobs_has_jobs");
		const chatId = await seedChat(userId);
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				await ctx.db.insert("streamJobs", {
					chatId,
					userId,
					messageId: `msg-${i}`,
					status: "pending",
					model: "openai/gpt-4o",
					provider: "openrouter",
					messages: [{ role: "user", content: "hello" }],
					content: "",
					createdAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserStreamJobs, { userId });
		expect(result.deleted).toBe(3);
		expect(result.hasMore).toBe(false);
	});

	test("only deletes jobs belonging to the specified user", async () => {
		const userId1 = await seedUser("del_jobs_user1");
		const userId2 = await seedUser("del_jobs_user2");
		const chatId1 = await seedChat(userId1);
		const chatId2 = await seedChat(userId2);
		await t.run(async (ctx) => {
			await ctx.db.insert("streamJobs", {
				chatId: chatId1,
				userId: userId1,
				messageId: "msg-user1",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: [],
				content: "",
				createdAt: Date.now(),
			});
			await ctx.db.insert("streamJobs", {
				chatId: chatId2,
				userId: userId2,
				messageId: "msg-user2",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: [],
				content: "",
				createdAt: Date.now(),
			});
		});
		await t.mutation(internal.userDeleteBatch.deleteUserStreamJobs, { userId: userId1 });
		const all = await t.run(async (ctx) => ctx.db.query("streamJobs").collect());
		const remaining = all.filter((j) => j.userId === userId2);
		expect(remaining).toHaveLength(1);
	});

	test("respects custom batchSize and reports hasMore when truncated", async () => {
		const userId = await seedUser("del_jobs_batch");
		const chatId = await seedChat(userId);
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await ctx.db.insert("streamJobs", {
					chatId,
					userId,
					messageId: `msg-batch-${i}`,
					status: "pending",
					model: "openai/gpt-4o",
					provider: "openrouter",
					messages: [],
					content: "",
					createdAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserStreamJobs, { userId, batchSize: 2 });
		expect(result.deleted).toBe(2);
		expect(result.hasMore).toBe(true);
	});
});

describe("deleteUserMessages", () => {
	test("returns deleted:0, hasMore:false when no messages exist", async () => {
		const userId = await seedUser("del_msgs_empty");
		const result = await t.mutation(internal.userDeleteBatch.deleteUserMessages, { userId });
		expect(result.deleted).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test("deletes messages belonging to the user", async () => {
		const userId = await seedUser("del_msgs_has");
		const chatId = await seedChat(userId);
		await t.run(async (ctx) => {
			for (let i = 0; i < 4; i++) {
				await ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: `message ${i}`,
					createdAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserMessages, { userId });
		expect(result.deleted).toBe(4);
		expect(result.hasMore).toBe(false);
	});

	test("respects batchSize", async () => {
		const userId = await seedUser("del_msgs_batch");
		const chatId = await seedChat(userId);
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await ctx.db.insert("messages", {
					chatId,
					userId,
					role: "assistant",
					content: `msg ${i}`,
					createdAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserMessages, { userId, batchSize: 3 });
		expect(result.deleted).toBe(3);
		expect(result.hasMore).toBe(true);
	});
});

describe("deleteUserChats", () => {
	test("returns deleted:0, hasMore:false when no chats exist", async () => {
		const userId = await seedUser("del_chats_empty");
		const result = await t.mutation(internal.userDeleteBatch.deleteUserChats, { userId });
		expect(result.deleted).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test("deletes chats belonging to the user", async () => {
		const userId = await seedUser("del_chats_has");
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				await ctx.db.insert("chats", {
					userId,
					title: `Chat ${i}`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserChats, { userId });
		expect(result.deleted).toBe(3);
		expect(result.hasMore).toBe(false);
	});

	test("respects batchSize and reports hasMore", async () => {
		const userId = await seedUser("del_chats_batch");
		await t.run(async (ctx) => {
			for (let i = 0; i < 4; i++) {
				await ctx.db.insert("chats", {
					userId,
					title: `Chat ${i}`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserChats, { userId, batchSize: 2 });
		expect(result.deleted).toBe(2);
		expect(result.hasMore).toBe(true);
	});

	test("does not delete chats belonging to another user", async () => {
		const userId1 = await seedUser("del_chats_u1");
		const userId2 = await seedUser("del_chats_u2");
		await t.run(async (ctx) => {
			await ctx.db.insert("chats", { userId: userId1, title: "U1 Chat", createdAt: Date.now(), updatedAt: Date.now() });
			await ctx.db.insert("chats", { userId: userId2, title: "U2 Chat", createdAt: Date.now(), updatedAt: Date.now() });
		});
		await t.mutation(internal.userDeleteBatch.deleteUserChats, { userId: userId1 });
		const allChats = await t.run(async (ctx) => ctx.db.query("chats").collect());
		const remaining = allChats.filter((c) => c.userId === userId2);
		expect(remaining).toHaveLength(1);
	});
});

describe("deleteUserFiles", () => {
	test("returns deleted:0, hasMore:false when no files exist", async () => {
		const userId = await seedUser("del_files_empty");
		const result = await t.mutation(internal.userDeleteBatch.deleteUserFiles, { userId });
		expect(result.deleted).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test("deletes file records belonging to the user", async () => {
		const userId = await seedUser("del_files_has");
		const chatId = await seedChat(userId);
		const storageId = await t.run(async (ctx) => {
			return ctx.storage.store(new Blob(["file content"], { type: "text/plain" }));
		});
		await t.run(async (ctx) => {
			await ctx.db.insert("fileUploads", {
				userId,
				chatId,
				storageId,
				filename: "test.txt",
				contentType: "text/plain",
				size: 12,
				uploadedAt: Date.now(),
			});
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserFiles, { userId });
		expect(result.deleted).toBe(1);
		expect(result.hasMore).toBe(false);
	});

	test("respects batchSize for files", async () => {
		const userId = await seedUser("del_files_batch");
		const chatId = await seedChat(userId);
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				const storageId = await ctx.storage.store(new Blob([`file ${i}`], { type: "text/plain" }));
				await ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId,
					filename: `file${i}.txt`,
					contentType: "text/plain",
					size: 6,
					uploadedAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserFiles, { userId, batchSize: 2 });
		expect(result.deleted).toBe(2);
		expect(result.hasMore).toBe(true);
	});

	test("handles storage.delete throwing not-found error gracefully (lines 111-112)", async () => {
		const userId = await seedUser("del_files_notfound");
		const chatId = await seedChat(userId);

		const storageId = await t.run(async (ctx) => {
			const id = await ctx.storage.store(new Blob(["temporary"], { type: "text/plain" }));
			await ctx.storage.delete(id);
			return id;
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("fileUploads", {
				userId,
				chatId,
				storageId,
				filename: "ghost.txt",
				contentType: "text/plain",
				size: 9,
				uploadedAt: Date.now(),
			});
		});

		const result = await t.mutation(internal.userDeleteBatch.deleteUserFiles, { userId });
		expect(result.deleted).toBe(1);
		expect(result.hasMore).toBe(false);
	});
});

describe("deleteUserChatReadStatuses", () => {
	test("returns deleted:0, hasMore:false when no statuses exist", async () => {
		const userId = await seedUser("del_read_empty");
		const result = await t.mutation(internal.userDeleteBatch.deleteUserChatReadStatuses, { userId });
		expect(result.deleted).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test("deletes read statuses belonging to the user", async () => {
		const userId = await seedUser("del_read_has");
		const chatId = await seedChat(userId);
		await t.run(async (ctx) => {
			await ctx.db.insert("chatReadStatus", {
				userId,
				chatId,
				lastReadAt: Date.now(),
			});
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserChatReadStatuses, { userId });
		expect(result.deleted).toBe(1);
		expect(result.hasMore).toBe(false);
	});

	test("does not delete read statuses for other users", async () => {
		const userId1 = await seedUser("del_read_u1");
		const userId2 = await seedUser("del_read_u2");
		const chat1 = await seedChat(userId1);
		const chat2 = await seedChat(userId2);
		await t.run(async (ctx) => {
			await ctx.db.insert("chatReadStatus", { userId: userId1, chatId: chat1, lastReadAt: Date.now() });
			await ctx.db.insert("chatReadStatus", { userId: userId2, chatId: chat2, lastReadAt: Date.now() });
		});
		await t.mutation(internal.userDeleteBatch.deleteUserChatReadStatuses, { userId: userId1 });
		const allStatuses = await t.run(async (ctx) => ctx.db.query("chatReadStatus").collect());
		const remaining = allStatuses.filter((s) => s.userId === userId2);
		expect(remaining).toHaveLength(1);
	});
});

describe("deleteUserPromptTemplates", () => {
	test("returns deleted:0, hasMore:false when no templates exist", async () => {
		const userId = await seedUser("del_tmpl_empty");
		const result = await t.mutation(internal.userDeleteBatch.deleteUserPromptTemplates, { userId });
		expect(result.deleted).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test("deletes prompt templates belonging to the user", async () => {
		const userId = await seedUser("del_tmpl_has");
		await t.run(async (ctx) => {
			for (let i = 0; i < 2; i++) {
				await ctx.db.insert("promptTemplates", {
					userId,
					name: `Template ${i}`,
					command: `/cmd${i}`,
					template: `Template content ${i}`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserPromptTemplates, { userId });
		expect(result.deleted).toBe(2);
		expect(result.hasMore).toBe(false);
	});

	test("respects batchSize for templates", async () => {
		const userId = await seedUser("del_tmpl_batch");
		await t.run(async (ctx) => {
			for (let i = 0; i < 4; i++) {
				await ctx.db.insert("promptTemplates", {
					userId,
					name: `Template ${i}`,
					command: `/cmd${i}`,
					template: `Content ${i}`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			}
		});
		const result = await t.mutation(internal.userDeleteBatch.deleteUserPromptTemplates, { userId, batchSize: 3 });
		expect(result.deleted).toBe(3);
		expect(result.hasMore).toBe(true);
	});

	test("does not delete templates for other users", async () => {
		const userId1 = await seedUser("del_tmpl_u1");
		const userId2 = await seedUser("del_tmpl_u2");
		await t.run(async (ctx) => {
			await ctx.db.insert("promptTemplates", {
				userId: userId1,
				name: "U1 Template",
				command: "/u1",
				template: "content",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.insert("promptTemplates", {
				userId: userId2,
				name: "U2 Template",
				command: "/u2",
				template: "content",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		await t.mutation(internal.userDeleteBatch.deleteUserPromptTemplates, { userId: userId1 });
		const allTemplates = await t.run(async (ctx) => ctx.db.query("promptTemplates").collect());
		const remaining = allTemplates.filter((p) => p.userId === userId2);
		expect(remaining).toHaveLength(1);
	});
});
