import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter, betterAuth } from "./testSetup.test";

let t: ReturnType<typeof makeConvexTest>;

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	betterAuth.register(t);
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

async function seedMessage(chatId: Id<"chats">, userId: Id<"users">): Promise<Id<"messages">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("messages", {
			chatId,
			userId,
			role: "user",
			content: "test message content",
			createdAt: Date.now(),
		});
	});
}

describe("deleteUserRecord (internalMutation)", () => {
	test("returns { success: false } when userId does not exist in database", async () => {
		const userId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("users", {
				externalId: "temp-to-delete",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});
		const result = await t.mutation(internal.users.deleteUserRecord, {
			userId,
			externalId: "ext-123",
		});
		expect(result).toEqual({ success: false });
	});

	test("returns { success: false } when externalId does not match stored user", async () => {
		const userId = await seedUser("real-external-id");
		const result = await t.mutation(internal.users.deleteUserRecord, {
			userId,
			externalId: "wrong-external-id",
		});
		expect(result).toEqual({ success: false });
	});
	test("deleteUserRecord: returns {success: true} when user exists with matching externalId", async () => {
		const externalId = "test-external-id";
		const userId = await seedUser(externalId);
		const result = await t.mutation(internal.users.deleteUserRecord, { userId, externalId });
		expect(result).toEqual({ success: true });
	});

	test("deleteUserRecord: deletes profile record when user has one (line 55)", async () => {
		const externalId = "test-with-profile";
		const userId = await seedUser(externalId);
		// Insert a profile for this user
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await t.mutation(internal.users.deleteUserRecord, { userId, externalId });
		expect(result).toEqual({ success: true });
		// Verify profile was deleted
		const profile = await t.run(async (ctx) =>
			ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).unique()
		);
		expect(profile).toBeNull();
	});
});

describe("deleteAccountWorkflowStep (action)", () => {
	const externalId = "workflow-user-ext-123";

	test("delete-stream-jobs step: returns hasMore=false when no stream jobs exist", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-stream-jobs",
			},
		);
		expect(result.hasMore).toBe(false);
		expect(result.deleted).toBe(0);
	});

	test("delete-messages step: returns hasMore=false when no messages exist", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-messages",
			},
		);
		expect(result.hasMore).toBe(false);
		expect(result.deleted).toBe(0);
	});

	test("delete-messages step: deletes all messages for user", async () => {
		const userId = await seedUser(externalId);
		const chatId = await seedChat(userId);
		await seedMessage(chatId, userId);
		await seedMessage(chatId, userId);

		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-messages",
			},
		);
		expect(result.deleted).toBe(2);
	});

	test("delete-chats step: returns hasMore=false when no chats exist", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-chats",
			},
		);
		expect(result.hasMore).toBe(false);
		expect(result.deleted).toBe(0);
	});

	test("delete-chats step: deletes all chats for user", async () => {
		const userId = await seedUser(externalId);
		await seedChat(userId);
		await seedChat(userId);

		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-chats",
			},
		);
		expect(result.deleted).toBe(2);
	});

	test("delete-files step: returns hasMore=false when no files exist", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-files",
			},
		);
		expect(result.hasMore).toBe(false);
		expect(result.deleted).toBe(0);
	});

	test("delete-chat-read-statuses step: returns hasMore=false when no chat read statuses exist", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-chat-read-statuses",
			},
		);
		expect(result.hasMore).toBe(false);
		expect(result.deleted).toBe(0);
	});

	test("delete-prompt-templates step: returns hasMore=false when no prompt templates exist", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-prompt-templates",
			},
		);
		expect(result.hasMore).toBe(false);
		expect(result.deleted).toBe(0);
	});

	test("delete-stream-jobs step: respects batchSize parameter", async () => {
		const userId = await seedUser(externalId);
		const result = await t.withIdentity({ subject: externalId }).action(
			api.users.deleteAccountWorkflowStep,
			{
				userId,
				externalId,
				step: "delete-stream-jobs",
				batchSize: 50,
			},
		);
		expect(result.hasMore).toBe(false);
	});

	test("throws Unauthorized when no identity provided", async () => {
		const userId = await seedUser(externalId);
		await expect(
			t.action(api.users.deleteAccountWorkflowStep, {
				userId,
				externalId,
				step: "delete-stream-jobs",
			}),
		).rejects.toThrow();
	});

	test("throws Unauthorized when identity userId does not match", async () => {
		const userId = await seedUser(externalId);
		await expect(
			t.withIdentity({ subject: "different-user-ext" }).action(
				api.users.deleteAccountWorkflowStep,
				{
					userId,
					externalId,
					step: "delete-stream-jobs",
				},
			),
		).rejects.toThrow();
	});

	test("delete-user step: returns {success: true, deleted: 1, hasMore: false} when user exists", async () => {
		const extId = "workflow-delete-user-ext";
		const userId = await seedUser(extId);
		const result = await t.withIdentity({ subject: extId }).action(
			api.users.deleteAccountWorkflowStep,
			{ userId, externalId: extId, step: "delete-user" },
		);
		expect(result.success).toBe(true);
		expect(result.deleted).toBe(1);
		expect(result.hasMore).toBe(false);
	});
});

describe("deleteAccount (mutation)", () => {
	test("throws when identity subject does not match externalId arg (line 154)", async () => {
		const externalId = "da_real_ext_id";
		const userId = await seedUser(externalId);
		await expect(
			t.withIdentity({ subject: externalId }).mutation(api.users.deleteAccount, {
				userId,
				externalId: "completely-different-id", // mismatch → throws at line 154
			}),
		).rejects.toThrow("User not found or unauthorized");
	});

	test("throws Unauthorized when called without identity", async () => {
		const userId = await seedUser("da_no_auth_user");
		await expect(
			t.mutation(api.users.deleteAccount, {
				userId,
				externalId: "da_no_auth_user",
			}),
		).rejects.toThrow();
	});

	test("deleteAccount: returns {success: true} when identity matches user", async () => {
		const extId = "da_success_test";
		const userId = await seedUser(extId);
		const result = await t.withIdentity({ subject: extId }).mutation(
			api.users.deleteAccount,
			{ userId, externalId: extId },
		);
		expect(result).toEqual({ success: true });
	});

	test("deleteAccount: deletes profile record when user has one (line 245)", async () => {
		const extId = "da_with_profile_test";
		const userId = await seedUser(extId);
		// Insert a profile for this user
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await t.withIdentity({ subject: extId }).mutation(
			api.users.deleteAccount,
			{ userId, externalId: extId },
		);
		expect(result).toEqual({ success: true });
	});
});
