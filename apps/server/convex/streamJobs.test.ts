import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter } from "./testSetup.test";

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

async function seedUser(t: ReturnType<typeof makeConvexTest>, externalId = "ext_1") {
	return t.run(async (ctx) =>
		ctx.db.insert("users", {
			externalId,
			email: `${externalId}@test.com`,
			name: "User",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedChat(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
	return t.run(async (ctx) =>
		ctx.db.insert("chats", {
			userId,
			title: "Test Chat",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedStreamJob(
	t: ReturnType<typeof makeConvexTest>,
	userId: Id<"users">,
	chatId: Id<"chats">,
	status: "pending" | "running" | "completed" | "error" = "pending",
	overrides: Record<string, unknown> = {},
) {
	return t.run(async (ctx) =>
		ctx.db.insert("streamJobs", {
			userId,
			chatId,
			messageId: `msg_${Date.now()}`,
			status,
			model: "openai/gpt-4o",
			provider: "openai",
			messages: [],
			content: "",
			createdAt: Date.now(),
			...overrides,
		}),
	);
}

describe("streamJobs.updateStreamContent", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("updates content on the job", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId);

		await t.mutation(internal.streamJobs.updateStreamContent, {
			jobId,
			content: "Hello world",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.content).toBe("Hello world");
	});

	test("does nothing when job does not exist", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const fakeJobId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_fake",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		await expect(
			t.mutation(internal.streamJobs.updateStreamContent, {
				jobId: fakeJobId,
				content: "Should not matter",
			}),
		).resolves.not.toThrow();
	});

	test("sets startedAt when status changes to 'running' and startedAt is not yet set", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "pending");

		vi.setSystemTime(9999);

		await t.mutation(internal.streamJobs.updateStreamContent, {
			jobId,
			content: "Streaming...",
			status: "running",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("running");
		expect(job?.startedAt).toBe(9999);
	});

	test("does NOT overwrite startedAt when already set", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running", { startedAt: 1000 });

		vi.setSystemTime(9999);

		await t.mutation(internal.streamJobs.updateStreamContent, {
			jobId,
			content: "More content",
			status: "running",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.startedAt).toBe(1000);
	});

	test("sets completedAt when status changes to 'completed'", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		vi.setSystemTime(42000);

		await t.mutation(internal.streamJobs.updateStreamContent, {
			jobId,
			content: "Done",
			status: "completed",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("completed");
		expect(job?.completedAt).toBe(42000);
	});

	test("sets completedAt when status changes to 'error'", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		vi.setSystemTime(55000);

		await t.mutation(internal.streamJobs.updateStreamContent, {
			jobId,
			content: "",
			status: "error",
			error: "Something went wrong",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("error");
		expect(job?.completedAt).toBe(55000);
	});

	test("stores all optional reasoning/search fields when provided (lines 58-64)", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId);

		await t.mutation(internal.streamJobs.updateStreamContent, {
			jobId,
			content: "content",
			reasoning: "some reasoning",
			chainOfThoughtParts: [{ type: "reasoning", index: 0, text: "step 1" }],
			thinkingTimeMs: 500,
			thinkingTimeSec: 0.5,
			reasoningCharCount: 100,
			reasoningChunkCount: 3,
			reasoningTokenCount: 25,
			reasoningRequested: true,
			webSearchUsed: true,
			webSearchCallCount: 2,
			toolCallCount: 1,
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.reasoning).toBe("some reasoning");
		expect(job?.chainOfThoughtParts).toHaveLength(1);
		expect(job?.thinkingTimeMs).toBe(500);
		expect(job?.thinkingTimeSec).toBe(0.5);
		expect(job?.reasoningCharCount).toBe(100);
		expect(job?.reasoningChunkCount).toBe(3);
		expect(job?.reasoningTokenCount).toBe(25);
		expect(job?.reasoningRequested).toBe(true);
		expect(job?.webSearchUsed).toBe(true);
		expect(job?.webSearchCallCount).toBe(2);
		expect(job?.toolCallCount).toBe(1);
	});
});

describe("streamJobs.completeStream", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("marks job as completed and inserts message when none exists", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		await t.mutation(internal.streamJobs.completeStream, {
			jobId,
			content: "Final content",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("completed");
		expect(job?.content).toBe("Final content");
		expect(job?.completedAt).toBeDefined();

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe("idle");
		expect(chat?.activeStreamId).toBeUndefined();

		const messages = await t.run(async (ctx) =>
			ctx.db.query("messages").filter((q) => q.eq(q.field("chatId"), chatId)).collect(),
		);
		expect(messages.length).toBe(1);
		expect(messages[0].content).toBe("Final content");
		expect(messages[0].role).toBe("assistant");
	});

	test("patches existing message when one already exists with same clientMessageId", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const messageId = "client-msg-123";

		const jobId = await t.run(async (ctx) =>
			ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId,
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "partial",
				createdAt: Date.now(),
			}),
		);

		const existingMsgId = await t.run(async (ctx) =>
			ctx.db.insert("messages", {
				chatId,
				clientMessageId: messageId,
				role: "assistant",
				content: "partial",
				createdAt: Date.now(),
				status: "streaming",
			}),
		);

		await t.mutation(internal.streamJobs.completeStream, {
			jobId,
			content: "Full content now",
		});

		const msg = await t.run(async (ctx) => ctx.db.get(existingMsgId));
		expect(msg?.content).toBe("Full content now");
		expect(msg?.status).toBe("completed");

		const allMessages = await t.run(async (ctx) =>
			ctx.db.query("messages").filter((q) => q.eq(q.field("chatId"), chatId)).collect(),
		);
		expect(allMessages.length).toBe(1);
	});

	test("does nothing when job does not exist", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const fakeJobId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_x",
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		await expect(
			t.mutation(internal.streamJobs.completeStream, {
				jobId: fakeJobId,
				content: "Irrelevant",
			}),
		).resolves.not.toThrow();
	});

	test("derives tool and web search counts from chainOfThoughtParts", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		await t.mutation(internal.streamJobs.completeStream, {
			jobId,
			content: "Done",
			chainOfThoughtParts: [
				{ type: "reasoning", index: 0, text: "thinking..." },
				{ type: "tool", index: 1, toolName: "web_search", toolCallId: "tc1", state: "done" },
				{ type: "tool", index: 2, toolName: "code_exec", toolCallId: "tc2", state: "done" },
			],
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.toolCallCount).toBe(2);
		expect(job?.webSearchCallCount).toBe(1);
		expect(job?.webSearchUsed).toBe(true);
	});

	test("updates chat status to idle", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "Streaming Chat",
				status: "streaming",
				activeStreamId: "some-stream-id",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		await t.mutation(internal.streamJobs.completeStream, {
			jobId,
			content: "Done",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe("idle");
		expect(chat?.activeStreamId).toBeUndefined();
	});
});

describe("streamJobs.failStream", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("marks job as error with message", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		await t.mutation(internal.streamJobs.failStream, {
			jobId,
			error: "Rate limit exceeded",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe("error");
		expect(job?.error).toBe("Rate limit exceeded");
		expect(job?.completedAt).toBeDefined();
	});

	test("uses partialContent when provided", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running", { content: "" });

		await t.mutation(internal.streamJobs.failStream, {
			jobId,
			error: "Interrupted",
			partialContent: "Partial response here",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.content).toBe("Partial response here");
	});

	test("falls back to existing content when no partialContent provided", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running", { content: "Already got some" });

		await t.mutation(internal.streamJobs.failStream, {
			jobId,
			error: "Network error",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.content).toBe("Already got some");
	});

	test("resets chat status to idle", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "Active Chat",
				status: "streaming",
				activeStreamId: "stream-123",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		await t.mutation(internal.streamJobs.failStream, {
			jobId,
			error: "Failed",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe("idle");
		expect(chat?.activeStreamId).toBeUndefined();
	});

	test("persists an assistant error message for failed streams", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId, "running");

		await t.mutation(internal.streamJobs.failStream, {
			jobId,
			error: "Your OpenRouter account does not have enough credits for this model.",
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		const message = await t.run(async (ctx) =>
			ctx.db
				.query("messages")
				.withIndex("by_client_id", (q) =>
					q.eq("chatId", chatId).eq("clientMessageId", job!.messageId),
				)
				.first(),
		);
		expect(message?.messageType).toBe("error");
		expect(message?.status).toBe("error");
		expect(message?.error?.message).toContain("does not have enough credits");
	});

	test("does nothing when job does not exist", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const fakeJobId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_x",
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		await expect(
			t.mutation(internal.streamJobs.failStream, {
				jobId: fakeJobId,
				error: "Irrelevant",
			}),
		).resolves.not.toThrow();
	});
});

describe("streamJobs.getJobInternal", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("returns job when it exists", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const jobId = await seedStreamJob(t, userId, chatId);

		const result = await t.query(internal.streamJobs.getJobInternal, { jobId });

		expect(result).not.toBeNull();
		expect(result?._id).toBe(jobId);
		expect(result?.status).toBe("pending");
	});

	test("returns null when job does not exist", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);
		const fakeJobId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_x",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		const result = await t.query(internal.streamJobs.getJobInternal, { jobId: fakeJobId });
		expect(result).toBeNull();
	});
});

describe("streamJobs.getPersistedDailyUsageForDateInternal", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("returns 0 for non-existent user", async () => {
		const userId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("users", {
				externalId: "temp",
				email: "temp@test.com",
				name: "Temp",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		const result = await t.query(internal.streamJobs.getPersistedDailyUsageForDateInternal, {
			userId,
			dateKey: "2026-02-21",
		});

		expect(result).toBe(0);
	});

	test("returns 0 when user aiUsageDate does not match dateKey", async () => {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "ext_usage",
				email: "usage@test.com",
				name: "Usage User",
				aiUsageCents: 500,
				aiUsageDate: "2026-01-01",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await t.query(internal.streamJobs.getPersistedDailyUsageForDateInternal, {
			userId,
			dateKey: "2026-02-21",
		});

		expect(result).toBe(0);
	});

	test("returns aiUsageCents when dateKey matches", async () => {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "ext_usage2",
				email: "usage2@test.com",
				name: "Usage User 2",
				aiUsageCents: 350,
				aiUsageDate: "2026-02-21",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await t.query(internal.streamJobs.getPersistedDailyUsageForDateInternal, {
			userId,
			dateKey: "2026-02-21",
		});

		expect(result).toBe(350);
	});

	test("returns 0 when aiUsageCents is not set but date matches", async () => {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "ext_usage3",
				email: "usage3@test.com",
				name: "Usage User 3",
				aiUsageDate: "2026-02-21",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await t.query(internal.streamJobs.getPersistedDailyUsageForDateInternal, {
			userId,
			dateKey: "2026-02-21",
		});

		expect(result).toBe(0);
	});
});

describe("streamJobs.cleanupStaleJobs", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("cleans up old running jobs (older than 5 minutes)", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		const oldJobId = await t.run(async (ctx) =>
			ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_old_running",
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now() - 10 * 60 * 1000,
			}),
		);

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.streamJobs.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(1);
		const job = await t.run(async (ctx) => ctx.db.get(oldJobId));
		expect(job?.status).toBe("error");
		expect(job?.error).toBe("Cleaned up stale job");
		expect(job?.completedAt).toBeDefined();
	});

	test("cleans up old pending jobs (older than 5 minutes)", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		const oldJobId = await t.run(async (ctx) =>
			ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_old_pending",
				status: "pending",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now() - 6 * 60 * 1000,
			}),
		);

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.streamJobs.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(1);
		const job = await t.run(async (ctx) => ctx.db.get(oldJobId));
		expect(job?.status).toBe("error");
	});

	test("skips recent jobs (created less than 5 minutes ago)", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		const recentJobId = await t.run(async (ctx) =>
			ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_recent",
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now() - 60 * 1000,
			}),
		);

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.streamJobs.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(0);
		expect(result.total).toBe(1);
		const job = await t.run(async (ctx) => ctx.db.get(recentJobId));
		expect(job?.status).toBe("running");
	});

	test("skips completed and error jobs", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		await t.run(async (ctx) => {
			await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_completed",
				status: "completed",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "Done",
				createdAt: Date.now() - 10 * 60 * 1000,
			});
			await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_error",
				status: "error",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				error: "Previous error",
				createdAt: Date.now() - 10 * 60 * 1000,
			});
		});

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.streamJobs.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(0);
		expect(result.total).toBe(0);
	});

	test("handles mixed old and recent jobs correctly", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		await t.run(async (ctx) => {
			await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_stale",
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now() - 10 * 60 * 1000,
			});
			await ctx.db.insert("streamJobs", {
				userId,
				chatId,
				messageId: "msg_fresh",
				status: "running",
				model: "openai/gpt-4o",
				provider: "openai",
				messages: [],
				content: "",
				createdAt: Date.now() - 60 * 1000,
			});
		});

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.streamJobs.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(1);
		expect(result.total).toBe(2);
	});

	test("returns zero counts when no stale jobs exist", async () => {
		const userId = await seedUser(t);

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.streamJobs.cleanupStaleJobs,
			{ userId },
		);

		expect(result.cleaned).toBe(0);
		expect(result.total).toBe(0);
	});

	test("requires authentication", async () => {
		const userId = await seedUser(t);

		await expect(
			t.mutation(api.streamJobs.cleanupStaleJobs, { userId }),
		).rejects.toThrow();
	});
});
