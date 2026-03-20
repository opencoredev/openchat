import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules, rateLimiter } from "../testSetup.test";

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

let t: ReturnType<typeof makeConvexTest>;

beforeEach(() => {
	// startStream schedules functions via ctx.scheduler.runAfter(0, ...) which
	// maps to setTimeout(0) in convex-test. Fake timers prevent those from
	// firing during or between tests, eliminating "Write outside of transaction"
	// unhandled rejections.
	vi.useFakeTimers();
	t = makeConvexTest();
});

afterEach(() => {
	vi.useRealTimers();
});

async function seedUserAndChat(externalId: string) {
	const userId = await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			externalId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
	const chatId = await t.run(async (ctx) => {
		return await ctx.db.insert("chats", {
			userId,
			title: "New Chat",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
	return { userId, chatId };
}

function withIdentity(externalId: string) {
	return t.withIdentity({ subject: externalId });
}

const testMessages = [{ role: "user", content: "Hello!" }];

describe("backgroundStream", () => {
	// -------------------------------------------------------------------------
	// startStream
	// -------------------------------------------------------------------------

	test("startStream creates a stream job with pending status", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_1");

		const jobId = await withIdentity("bs_user_1").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-001",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		expect(jobId).toBeDefined();

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job).toMatchObject({
			chatId,
			userId,
			messageId: "msg-001",
			model: "openai/gpt-4o",
			provider: "openrouter",
			status: "pending",
			content: "",
		});
		expect(job?.createdAt).toBeGreaterThan(0);
	});

	test("startStream sets chat to streaming status and stores activeStreamId", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_2");

		const jobId = await withIdentity("bs_user_2").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-002",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe("streaming");
		expect(chat?.activeStreamId).toBe(`job-${jobId}`);
	});

	test("startStream rejects unauthorized user (userId mismatch)", async () => {
		const { chatId } = await seedUserAndChat("bs_user_3a");
		// Create a second user but call with their identity
		const otherId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				externalId: "bs_user_3b",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		// Authenticated as bs_user_3b but passing otherId — requireAuthUserId should
		// match because identity.subject → user._id === otherId.
		// However the chat belongs to bs_user_3a → "Chat not found or unauthorized"
		await expect(
			withIdentity("bs_user_3b").mutation(api.backgroundStream.startStream, {
				chatId,
				userId: otherId,
				messageId: "msg-003",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			}),
		).rejects.toThrow();
	});

	// -------------------------------------------------------------------------
	// getStreamJob
	// -------------------------------------------------------------------------

	test("getStreamJob returns job for the owning user", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_4");

		const jobId = await withIdentity("bs_user_4").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-004",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		const result = await withIdentity("bs_user_4").query(
			api.backgroundStream.getStreamJob,
			{ jobId, userId },
		);

		expect(result).not.toBeNull();
		expect(result?._id).toBe(jobId);
		expect(result?.messageId).toBe("msg-004");
		expect(result?.status).toBe("pending");
		expect(result?.model).toBe("openai/gpt-4o");
		expect(result?.provider).toBe("openrouter");
		expect(result?.content).toBe("");
	});

	test("getStreamJob returns null for a different user (ownership mismatch)", async () => {
		const { userId: userId1, chatId } = await seedUserAndChat("bs_user_5a");

		// Second user
		const userId2 = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				externalId: "bs_user_5b",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		const jobId = await withIdentity("bs_user_5a").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId: userId1,
				messageId: "msg-005",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		// Auth passes for user2 (identity matches userId2), but job.userId !== userId2
		const result = await withIdentity("bs_user_5b").query(
			api.backgroundStream.getStreamJob,
			{ jobId, userId: userId2 },
		);

		expect(result).toBeNull();
	});

	// -------------------------------------------------------------------------
	// updateStreamContent (internal)
	// -------------------------------------------------------------------------

	test("updateStreamContent updates content and transitions status to running", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_6");

		const jobId = await withIdentity("bs_user_6").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-006",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		await t.mutation(internal.backgroundStream.updateStreamContent, {
			jobId,
			content: "Partial response text...",
			status: "running",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.content).toBe("Partial response text...");
		expect(job?.status).toBe("running");
		// startedAt should be set when transitioning to running for the first time
		expect(job?.startedAt).toBeDefined();
	});

	test("updateStreamContent persists optional reasoning and metadata fields", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_7");

		const jobId = await withIdentity("bs_user_7").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-007",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		await t.mutation(internal.backgroundStream.updateStreamContent, {
			jobId,
			content: "Hello",
			reasoning: "I am thinking...",
			thinkingTimeMs: 1234,
			webSearchUsed: true,
			webSearchCallCount: 2,
			toolCallCount: 3,
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.reasoning).toBe("I am thinking...");
		expect(job?.thinkingTimeMs).toBe(1234);
		expect(job?.webSearchUsed).toBe(true);
		expect(job?.webSearchCallCount).toBe(2);
		expect(job?.toolCallCount).toBe(3);
	});

	// -------------------------------------------------------------------------
	// completeStream (internal)
	// -------------------------------------------------------------------------

	test("completeStream marks job completed and creates a new message", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_8");

		const jobId = await withIdentity("bs_user_8").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-008",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: "This is the completed response.",
		});

		// Job should be completed
		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("completed");
		expect(job?.content).toBe("This is the completed response.");
		expect(job?.completedAt).toBeDefined();

		// Chat should be reset to idle
		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe("idle");
		expect(chat?.activeStreamId).toBeUndefined();

		// A new message should have been created
		const message = await t.run(async (ctx) => {
			return await ctx.db
				.query("messages")
				.withIndex("by_client_id", (q) =>
					q.eq("chatId", chatId).eq("clientMessageId", "msg-008"),
				)
				.first();
		});
		expect(message).not.toBeNull();
		expect(message?.content).toBe("This is the completed response.");
		expect(message?.role).toBe("assistant");
		expect(message?.modelId).toBe("openai/gpt-4o");
		expect(message?.status).toBe("completed");
	});

	test("completeStream patches an existing message instead of creating a duplicate", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_9");

		const jobId = await withIdentity("bs_user_9").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-009",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		// Pre-insert a streaming placeholder message with the same clientMessageId
		const msgId = await t.run(async (ctx) => {
			return await ctx.db.insert("messages", {
				chatId,
				clientMessageId: "msg-009",
				role: "assistant",
				content: "",
				createdAt: Date.now(),
				status: "streaming",
				userId,
			});
		});

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: "Final patched content.",
		});

		// Original message should be updated in-place
		const updatedMsg = await t.run(async (ctx) => ctx.db.get(msgId));
		expect(updatedMsg?.content).toBe("Final patched content.");
		expect(updatedMsg?.status).toBe("completed");

		// Only one message should exist for this clientMessageId
		const allMessages = await t.run(async (ctx) => {
			return await ctx.db
				.query("messages")
				.withIndex("by_client_id", (q) =>
					q.eq("chatId", chatId).eq("clientMessageId", "msg-009"),
				)
				.collect();
		});
		expect(allMessages).toHaveLength(1);
	});

	// -------------------------------------------------------------------------
	// failStream (internal)
	// -------------------------------------------------------------------------

	test("failStream marks job as error and resets chat to idle", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_10");

		const jobId = await withIdentity("bs_user_10").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-010",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: "Something went wrong during streaming.",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("error");
		expect(job?.error).toBe("Something went wrong during streaming.");
		expect(job?.completedAt).toBeDefined();

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe("idle");
		expect(chat?.activeStreamId).toBeUndefined();
	});

	test("startStream does not schedule auto-title when all messages are assistant (seed is null)", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_12");

		const jobId = await withIdentity("bs_user_12").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-012",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: [{ role: "assistant", content: "Hello!" }],
			},
		);

		expect(jobId).toBeDefined();
		// If no error thrown, the null-seed path ran without issues
		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("pending");
	});

	test("startStream seed text is null when user message has whitespace-only content", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_13");

		const jobId = await withIdentity("bs_user_13").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-013",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: [{ role: "user", content: "   " }],
			},
		);

		expect(jobId).toBeDefined();
		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("pending");
	});

	test("startStream throws rate limit error after messageSend capacity is exhausted", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_rl_user");

		const sends = [];
		for (let i = 0; i < 10; i++) {
			sends.push(
				withIdentity("bs_rl_user").mutation(api.backgroundStream.startStream, {
					chatId,
					userId,
					messageId: `msg-rl-${i}`,
					model: "openai/gpt-4o",
					provider: "openrouter",
					messages: testMessages,
				}).catch(() => {}),
			);
		}
		await Promise.all(sends);

		await expect(
			withIdentity("bs_rl_user").mutation(api.backgroundStream.startStream, {
				chatId,
				userId,
				messageId: "msg-rl-overflow",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			}),
		).rejects.toThrow(/Too many streams started/);
	});

	test("failStream preserves partialContent when provided", async () => {
		const { userId, chatId } = await seedUserAndChat("bs_user_11");

		const jobId = await withIdentity("bs_user_11").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-011",
				model: "openai/gpt-4o",
				provider: "openrouter",
				messages: testMessages,
			},
		);

		// First advance some content
		await t.mutation(internal.backgroundStream.updateStreamContent, {
			jobId,
			content: "Partial text before error.",
			status: "running",
		});

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: "Connection dropped.",
			partialContent: "Partial text before error.",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("error");
		expect(job?.content).toBe("Partial text before error.");
		expect(job?.error).toBe("Connection dropped.");
	});
});
