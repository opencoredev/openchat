/**
 * Safety-net tests for backgroundStream.ts
 *
 * Covers the mutation/query functions (NOT the executeStream action which requires external AI APIs):
 * - startStream: creates a stream job, validates inputs, rejects unauthorized
 * - getStreamJob: returns job data for owner, null for non-owner
 * - getActiveStreamJob: finds running/pending jobs by chat
 * - completeStream: updates job + creates/patches message
 * - failStream: records error on job, resets chat status
 * - cleanupStaleJobs: cleans old pending/running jobs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { modules, rateLimiter } from "./testSetup.test";

function createConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

function asExternalId(t: any, externalId: string) {
	return t.withIdentity({ subject: externalId });
}

/** Seed a user + chat directly in the DB (bypasses rate limits). */
async function seedUserAndChat(t: any, externalId = "test-user") {
	const userId = await t.run(async (ctx: any) => {
		return await ctx.db.insert("users", {
			externalId,
			email: `${externalId}@example.com`,
			name: "Test User",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});

	const chatId = await t.run(async (ctx: any) => {
		return await ctx.db.insert("chats", {
			userId,
			title: "Test Chat",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messageCount: 0,
			status: "idle",
		});
	});

	return { userId, chatId };
}

const baseMessages = [{ role: "user", content: "Hello, world!" }];

// ---------------------------------------------------------------------------
// startStream
// ---------------------------------------------------------------------------

describe("backgroundStream.startStream", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		// startStream calls ctx.scheduler.runAfter() which uses setTimeout in convex-test.
		// Use fake timers so scheduled work doesn't fire after the transaction closes,
		// preventing "Write outside of transaction" unhandled rejections.
		vi.useFakeTimers();
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("creates a stream job and returns a jobId", async () => {
		const jobId = await asExternalId(t, "test-user").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-1",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
			},
		);

		expect(jobId).toBeDefined();

		// Verify the job was created with correct initial state
		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job).toBeDefined();
		expect(job!.status).toBe("pending");
		expect(job!.content).toBe("");
		expect(job!.model).toBe("openai/gpt-4o");
		expect(job!.provider).toBe("osschat");
		expect(job!.messageId).toBe("msg-1");
		expect(job!.userId).toEqual(userId);
		expect(job!.chatId).toEqual(chatId);
	});

	it("sets chat status to streaming after starting", async () => {
		await asExternalId(t, "test-user").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-2",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
			},
		);

		const chat = await t.run(async (ctx: any) => ctx.db.get(chatId));
		expect(chat!.status).toBe("streaming");
		expect(chat!.activeStreamId).toBeDefined();
	});

	it("rejects unauthenticated requests", async () => {
		await expect(
			t.mutation(api.backgroundStream.startStream, {
				chatId,
				userId,
				messageId: "msg-3",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
			}),
		).rejects.toThrow();
	});

	it("rejects requests for chats not owned by the user", async () => {
		// Create another user
		const other = await seedUserAndChat(t, "other-user");

		// Try to start a stream on other user's chat
		await expect(
			asExternalId(t, "test-user").mutation(
				api.backgroundStream.startStream,
				{
					chatId: other.chatId,
					userId,
					messageId: "msg-4",
					model: "openai/gpt-4o",
					provider: "osschat",
					messages: baseMessages,
				},
			),
		).rejects.toThrow("Chat not found or unauthorized");
	});

	it("throws when a non-stale stream is already running", async () => {
		// Insert a running job directly
		await t.run(async (ctx: any) => {
			await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "existing-msg",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "partial...",
				createdAt: Date.now(), // recent → not stale
			});
		});

		await expect(
			asExternalId(t, "test-user").mutation(
				api.backgroundStream.startStream,
				{
					chatId,
					userId,
					messageId: "msg-5",
					model: "openai/gpt-4o",
					provider: "osschat",
					messages: baseMessages,
				},
			),
		).rejects.toThrow("Stream already in progress");
	});

	it("stores stream options when provided", async () => {
		const options = {
			enableReasoning: true,
			reasoningEffort: "high",
			enableWebSearch: true,
			maxSteps: 3,
		};

		const jobId = await asExternalId(t, "test-user").mutation(
			api.backgroundStream.startStream,
			{
				chatId,
				userId,
				messageId: "msg-opts",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				options,
			},
		);

		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job!.options).toEqual(options);
	});
});

// ---------------------------------------------------------------------------
// getStreamJob
// ---------------------------------------------------------------------------

describe("backgroundStream.getStreamJob", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	it("returns job data for the owner", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "msg-query-1",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "Hello",
				reasoning: "thinking...",
				createdAt: Date.now(),
			});
		});

		const result = await asExternalId(t, "test-user").query(
			api.backgroundStream.getStreamJob,
			{ jobId, userId },
		);

		expect(result).not.toBeNull();
		expect(result!._id).toEqual(jobId);
		expect(result!.status).toBe("running");
		expect(result!.content).toBe("Hello");
		expect(result!.reasoning).toBe("thinking...");
		expect(result!.model).toBe("openai/gpt-4o");
		expect(result!.messageId).toBe("msg-query-1");
	});

	it("returns null for a different user", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "msg-query-2",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		const other = await seedUserAndChat(t, "other-user");

		// other-user passes their own userId — auth succeeds but job ownership check returns null
		const result = await asExternalId(t, "other-user").query(
			api.backgroundStream.getStreamJob,
			{ jobId, userId: other.userId },
		);

		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// getActiveStreamJob
// ---------------------------------------------------------------------------

describe("backgroundStream.getActiveStreamJob", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	it("returns null when no active stream exists", async () => {
		const result = await asExternalId(t, "test-user").query(
			api.backgroundStream.getActiveStreamJob,
			{ chatId, userId },
		);
		expect(result).toBeNull();
	});

	it("returns a running job", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "active-msg",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "streaming...",
				createdAt: Date.now(),
			});
		});

		const result = await asExternalId(t, "test-user").query(
			api.backgroundStream.getActiveStreamJob,
			{ chatId, userId },
		);

		expect(result).not.toBeNull();
		expect(result!._id).toEqual(jobId);
		expect(result!.status).toBe("running");
		expect(result!.content).toBe("streaming...");
	});

	it("falls back to pending job when no running job exists", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "pending-msg",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		const result = await asExternalId(t, "test-user").query(
			api.backgroundStream.getActiveStreamJob,
			{ chatId, userId },
		);

		expect(result).not.toBeNull();
		expect(result!._id).toEqual(jobId);
		expect(result!.status).toBe("pending");
	});
});

// ---------------------------------------------------------------------------
// completeStream (internalMutation)
// ---------------------------------------------------------------------------

describe("backgroundStream.completeStream", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	it("marks job as completed and creates a message", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "complete-msg-1",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "partial",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: "Full response content",
			reasoning: "I thought about it",
			thinkingTimeMs: 1500,
		});

		// Verify job status
		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job!.status).toBe("completed");
		expect(job!.content).toBe("Full response content");
		expect(job!.completedAt).toBeDefined();

		// Verify message was created
		const message = await t.run(async (ctx: any) => {
			return await ctx.db
				.query("messages")
				.withIndex("by_client_id", (q: any) =>
					q.eq("chatId", chatId).eq("clientMessageId", "complete-msg-1"),
				)
				.first();
		});

		expect(message).not.toBeNull();
		expect(message!.content).toBe("Full response content");
		expect(message!.role).toBe("assistant");
		expect(message!.modelId).toBe("openai/gpt-4o");
		expect(message!.provider).toBe("osschat");
		expect(message!.reasoning).toBe("I thought about it");
		expect(message!.status).toBe("completed");
	});

	it("patches existing message instead of creating duplicate", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "complete-msg-2",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		// Pre-create a message with the same clientMessageId
		const existingMsgId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("messages", {
				chatId,
				clientMessageId: "complete-msg-2",
				role: "assistant",
				content: "streaming partial...",
				status: "streaming",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: "Final content",
		});

		// The existing message should be patched, not duplicated
		const message = await t.run(async (ctx: any) => ctx.db.get(existingMsgId));
		expect(message!.content).toBe("Final content");
		expect(message!.status).toBe("completed");

		// Verify no duplicate
		const allMessages = await t.run(async (ctx: any) => {
			return await ctx.db
				.query("messages")
				.withIndex("by_client_id", (q: any) =>
					q.eq("chatId", chatId).eq("clientMessageId", "complete-msg-2"),
				)
				.collect();
		});
		expect(allMessages.length).toBe(1);
	});

	it("resets chat status to idle on completion", async () => {
		// Set chat to streaming
		await t.run(async (ctx: any) => {
			await ctx.db.patch(chatId, { status: "streaming", activeStreamId: "job-test" });
		});

		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "complete-msg-3",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: "Done",
		});

		const chat = await t.run(async (ctx: any) => ctx.db.get(chatId));
		expect(chat!.status).toBe("idle");
		expect(chat!.activeStreamId).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// failStream (internalMutation)
// ---------------------------------------------------------------------------

describe("backgroundStream.failStream", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	it("records error on the job and sets status to error", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "fail-msg-1",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "partial output",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: "Provider returned 500",
		});

		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job!.status).toBe("error");
		expect(job!.error).toBe("Provider returned 500");
		expect(job!.completedAt).toBeDefined();
		// Content should remain as-is when no partialContent provided
		expect(job!.content).toBe("partial output");
	});

	it("saves partial content when provided", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "fail-msg-2",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: "Timeout",
			partialContent: "Here is what I had so far...",
		});

		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job!.content).toBe("Here is what I had so far...");
	});

	it("resets chat status to idle on failure", async () => {
		await t.run(async (ctx: any) => {
			await ctx.db.patch(chatId, { status: "streaming", activeStreamId: "job-fail" });
		});

		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "fail-msg-3",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: "Something went wrong",
		});

		const chat = await t.run(async (ctx: any) => ctx.db.get(chatId));
		expect(chat!.status).toBe("idle");
		expect(chat!.activeStreamId).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// cleanupStaleJobs
// ---------------------------------------------------------------------------

describe("backgroundStream.cleanupStaleJobs", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	it("cleans jobs older than 5 minutes", async () => {
		const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

		const staleJobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "stale-msg",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: tenMinutesAgo,
			});
		});

		const result = await asExternalId(t, "test-user").mutation(
			api.backgroundStream.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(1);

		const job = await t.run(async (ctx: any) => ctx.db.get(staleJobId));
		expect(job!.status).toBe("error");
		expect(job!.error).toBe("Cleaned up stale job");
	});

	it("does not clean recent jobs", async () => {
		await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "recent-msg",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(), // just created
			});
		});

		const result = await asExternalId(t, "test-user").mutation(
			api.backgroundStream.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// updateStreamContent (internalMutation)
// ---------------------------------------------------------------------------

describe("backgroundStream.updateStreamContent", () => {
	let t: ReturnType<typeof convexTest>;
	let userId: Id<"users">;
	let chatId: Id<"chats">;

	beforeEach(async () => {
		t = createConvexTest();
		const seed = await seedUserAndChat(t);
		userId = seed.userId;
		chatId = seed.chatId;
	});

	it("updates job content and sets startedAt on status change to running", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "update-msg",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.updateStreamContent, {
			jobId,
			content: "Streaming in progress...",
			status: "running",
		});

		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job!.content).toBe("Streaming in progress...");
		expect(job!.status).toBe("running");
		expect(job!.startedAt).toBeDefined();
	});

	it("updates reasoning and web search fields", async () => {
		const jobId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("streamJobs", {
				chatId,
				userId,
				messageId: "update-msg-2",
				status: "running",
				model: "openai/gpt-4o",
				provider: "osschat",
				messages: baseMessages,
				content: "",
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.updateStreamContent, {
			jobId,
			content: "Response",
			reasoning: "Step 1: think...",
			webSearchUsed: true,
			webSearchCallCount: 2,
			toolCallCount: 3,
		});

		const job = await t.run(async (ctx: any) => ctx.db.get(jobId));
		expect(job!.reasoning).toBe("Step 1: think...");
		expect(job!.webSearchUsed).toBe(true);
		expect(job!.webSearchCallCount).toBe(2);
		expect(job!.toolCallCount).toBe(3);
	});
});
