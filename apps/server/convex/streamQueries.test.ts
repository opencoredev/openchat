import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter } from "./testSetup.test";

function makeConvexTest() {
	const t = convexTest(schema as unknown as Parameters<typeof convexTest>[0], modules);
	rateLimiter.register(t);
	return t;
}

async function seedUser(t: ReturnType<typeof makeConvexTest>, externalId = "ext_user_1") {
	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			externalId,
			email: `${externalId}@test.com`,
			name: "Test User",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
	return userId;
}

async function seedChat(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
	return t.run(async (ctx) => {
		return ctx.db.insert("chats", {
			userId,
			title: "Test Chat",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
}

async function seedStreamJob(
	t: ReturnType<typeof makeConvexTest>,
	userId: Id<"users">,
	chatId: Id<"chats">,
	status: "pending" | "running" | "completed" | "error" = "running",
) {
	return t.run(async (ctx) => {
		return ctx.db.insert("streamJobs", {
			userId,
			chatId,
			messageId: `msg_${Date.now()}_${Math.random()}`,
			status,
			model: "openai/gpt-4o",
			provider: "openai",
			messages: [],
			content: "",
			createdAt: Date.now(),
		});
	});
}

describe("streamQueries", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getStreamJob", () => {
		test("returns null when job does not exist", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const fakeJobId = await seedStreamJob(t, userId, chatId);

			await t.run(async (ctx) => {
				await ctx.db.delete(fakeJobId);
			});

		const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getStreamJob, {
				jobId: fakeJobId,
				userId,
			});
			expect(result).toBeNull();
		});

		test("returns job when it belongs to the user", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, userId, chatId, "running");

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getStreamJob, {
				jobId,
				userId,
			});

			expect(result).not.toBeNull();
			expect(result!._id).toBe(jobId);
			expect(result!.status).toBe("running");
			expect(result!.model).toBe("openai/gpt-4o");
		});

		test("returns null when job belongs to a different user", async () => {
			const userId1 = await seedUser(t, "ext_user_1");
			const userId2 = await seedUser(t, "ext_user_2");
			const chatId = await seedChat(t, userId1);
			const jobId = await seedStreamJob(t, userId1, chatId, "running");

			const result = await t.withIdentity({ subject: "ext_user_2" }).query(api.streamJobs.getStreamJob, {
				jobId,
				userId: userId2,
			});
			expect(result).toBeNull();
		});

		test("throws when unauthenticated", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, userId, chatId);

			await expect(
					t.query(api.streamJobs.getStreamJob, {
					jobId,
					userId,
				})
			).rejects.toThrow("Unauthorized");
		});

		test("returns correct job fields", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, userId, chatId, "completed");

			await t.run(async (ctx) => {
				await ctx.db.patch(jobId, {
					content: "Hello world",
					reasoning: "Some reasoning",
					webSearchUsed: true,
					webSearchCallCount: 2,
					toolCallCount: 3,
				});
			});

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getStreamJob, {
				jobId,
				userId,
			});

			expect(result!.content).toBe("Hello world");
			expect(result!.reasoning).toBe("Some reasoning");
			expect(result!.webSearchUsed).toBe(true);
			expect(result!.webSearchCallCount).toBe(2);
			expect(result!.toolCallCount).toBe(3);
		});
	});

	describe("getActiveStreamJob", () => {
		test("returns null when no active job for chat", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId,
			});
			expect(result).toBeNull();
		});

		test("returns running job", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, userId, chatId, "running");

			await t.run(async (ctx) => {
				await ctx.db.patch(chatId, { activeStreamId: jobId });
			});

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId,
			});
			expect(result).not.toBeNull();
			expect(result!._id).toBe(jobId);
			expect(result!.status).toBe("running");
		});

		test("returns pending job when no running job", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, userId, chatId, "pending");

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId,
			});
			expect(result).not.toBeNull();
			expect(result!._id).toBe(jobId);
			expect(result!.status).toBe("pending");
		});

		test("returns null when jobs belong to different user", async () => {
			const userId1 = await seedUser(t, "ext_user_1");
			const userId2 = await seedUser(t, "ext_user_2");
			const chatId = await seedChat(t, userId1);
			await seedStreamJob(t, userId1, chatId, "running");

			const result = await t.withIdentity({ subject: "ext_user_2" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId: userId2,
			});
			expect(result).toBeNull();
		});

		test("returns null for completed job", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedStreamJob(t, userId, chatId, "completed");

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId,
			});
			expect(result).toBeNull();
		});

		test("returns null for error job", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedStreamJob(t, userId, chatId, "error");

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId,
			});
			expect(result).toBeNull();
		});

		test("throws when unauthenticated", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			await expect(
					t.query(api.streamJobs.getActiveStreamJob, {
					chatId,
					userId,
				})
			).rejects.toThrow("Unauthorized");
		});

		test("prefers running over pending when both exist", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedStreamJob(t, userId, chatId, "pending");
			const runningJobId = await seedStreamJob(t, userId, chatId, "running");

			const result = await t.withIdentity({ subject: "ext_user_1" }).query(api.streamJobs.getActiveStreamJob, {
				chatId,
				userId,
			});
			expect(result!._id).toBe(runningJobId);
			expect(result!.status).toBe("running");
		});
	});
});
