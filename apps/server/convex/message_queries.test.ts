import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter } from "./testSetup.test";

const extendedModules = {
	...modules,
	"./message_queries.ts": () => import("./message_queries"),
};

function makeConvexTest() {
	const t = convexTest(schema, extendedModules);
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

async function seedChat(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">, title = "Test Chat") {
	return t.run(async (ctx) =>
		ctx.db.insert("chats", {
			userId,
			title,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedMessage(
	t: ReturnType<typeof makeConvexTest>,
	chatId: Id<"chats">,
	userId: Id<"users">,
	role: "user" | "assistant" = "user",
	status = "completed",
	content = "Hello",
	extra: Record<string, unknown> = {},
) {
	return t.run(async (ctx) =>
		ctx.db.insert("messages", {
			chatId,
			userId,
			role,
			content,
			status,
			createdAt: Date.now(),
			...extra,
		}),
	);
}

describe("message_queries", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("list", () => {
		test("returns empty array for chat with no messages", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toEqual([]);
		});

		test("returns messages in ascending order", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			vi.setSystemTime(1000);
			await seedMessage(t, chatId, userId, "user", "completed", "First");
			vi.setSystemTime(2000);
			await seedMessage(t, chatId, userId, "assistant", "completed", "Second");

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(2);
			expect(result[0].content).toBe("First");
			expect(result[0].role).toBe("user");
			expect(result[1].content).toBe("Second");
			expect(result[1].role).toBe("assistant");
		});

		test("returns empty for wrong user's chat", async () => {
			const userId1 = await seedUser(t, "ext_1");
			const userId2 = await seedUser(t, "ext_2");
			const chatId = await seedChat(t, userId1);
			await seedMessage(t, chatId, userId1);

			const result = await t
				.withIdentity({ subject: "ext_2" })
				.query(api.message_queries.list, { chatId, userId: userId2 });

			expect(result).toEqual([]);
		});

		test("does not return deleted messages", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "user", "completed", "Visible");
			await seedMessage(t, chatId, userId, "user", "completed", "Deleted", {
				deletedAt: Date.now(),
			});

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].content).toBe("Visible");
		});

		test("requires authentication", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			await expect(
				t.query(api.message_queries.list, { chatId, userId }),
			).rejects.toThrow();
		});

		test("returns messages without attachments unchanged", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "user", "completed", "No attachments");

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].attachments).toBeUndefined();
		});

		test("returns correct message fields", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "assistant", "completed", "AI response", {
				modelId: "gpt-4o",
				provider: "openai",
			});

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result[0]).toMatchObject({
				role: "assistant",
				content: "AI response",
				status: "completed",
			});
		});

		test("returns message with attachment url as undefined when not verified", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["test"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "With unverified attachment",
					status: "completed",
					createdAt: Date.now(),
					attachments: [
						{
							storageId,
							filename: "test.txt",
							contentType: "text/plain",
							size: 4,
							uploadedAt: Date.now(),
						},
					],
				})
			);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].attachments).toHaveLength(1);
			expect(result[0].attachments![0].url).toBeUndefined();
		});

		test("returns message with attachment url when verified via fileUpload record", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["test content"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await t.run(async (ctx) =>
				ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId,
					filename: "file.txt",
					contentType: "text/plain",
					size: 12,
					uploadedAt: Date.now(),
				})
			);

			await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "With verified attachment",
					status: "completed",
					createdAt: Date.now(),
					attachments: [
						{
							storageId,
							filename: "file.txt",
							contentType: "text/plain",
							size: 12,
							uploadedAt: Date.now(),
						},
					],
				})
			);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].attachments).toHaveLength(1);
		});

		test("processes multiple attachments across multiple messages (lines 30-31, 38-55, 64-66)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId1 = await t.run(async (ctx) => {
				const blob = new Blob(["file1"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});
			const storageId2 = await t.run(async (ctx) => {
				const blob = new Blob(["file2"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await t.run(async (ctx) =>
				ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId: storageId1,
					filename: "verified.txt",
					contentType: "text/plain",
					size: 5,
					uploadedAt: Date.now(),
				})
			);

			vi.setSystemTime(1000);
			await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "Message with two attachments",
					status: "completed",
					createdAt: Date.now(),
					attachments: [
						{
							storageId: storageId1,
							filename: "verified.txt",
							contentType: "text/plain",
							size: 5,
							uploadedAt: Date.now(),
						},
						{
							storageId: storageId2,
							filename: "unverified.txt",
							contentType: "text/plain",
							size: 5,
							uploadedAt: Date.now(),
						},
					],
				})
			);

			vi.setSystemTime(2000);
			await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "assistant",
					content: "No attachment message",
					status: "completed",
					createdAt: Date.now(),
				})
			);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(2);
			expect(result[0].attachments).toHaveLength(2);
			expect(result[1].attachments).toBeUndefined();
			expect(result[0].attachments![1].url).toBeUndefined();
		});

		test("handles message with multiple attachments when all are verified (lines 38-55, 64-66)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId1 = await t.run(async (ctx) => {
				const blob = new Blob(["data1"], { type: "image/png" });
				return ctx.storage.store(blob);
			});
			const storageId2 = await t.run(async (ctx) => {
				const blob = new Blob(["data2"], { type: "image/png" });
				return ctx.storage.store(blob);
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId: storageId1,
					filename: "img1.png",
					contentType: "image/png",
					size: 5,
					uploadedAt: Date.now(),
				});
				await ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId: storageId2,
					filename: "img2.png",
					contentType: "image/png",
					size: 5,
					uploadedAt: Date.now(),
				});
			});

			await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "Two verified attachments",
					status: "completed",
					createdAt: Date.now(),
					attachments: [
						{
							storageId: storageId1,
							filename: "img1.png",
							contentType: "image/png",
							size: 5,
							uploadedAt: Date.now(),
						},
						{
							storageId: storageId2,
							filename: "img2.png",
							contentType: "image/png",
							size: 5,
							uploadedAt: Date.now(),
						},
					],
				})
			);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].attachments).toHaveLength(2);
		});

		test("handles ctx.storage.getUrl throwing gracefully (line 49 catch)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const id = await ctx.storage.store(new Blob(["content"], { type: "text/plain" }));
				await ctx.storage.delete(id);
				return id;
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId,
					filename: "deleted.txt",
					contentType: "text/plain",
					size: 7,
					uploadedAt: Date.now(),
				});
				await ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "Message with deleted storage",
					status: "completed",
					createdAt: Date.now(),
					attachments: [
						{
							storageId,
							filename: "deleted.txt",
							contentType: "text/plain",
							size: 7,
							uploadedAt: Date.now(),
						},
					],
				});
			});

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].attachments).toHaveLength(1);
			expect(result[0].attachments![0].url).toBeUndefined();
		});

	test("deduplicates storage IDs when same attachment referenced multiple times (line 38)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["shared"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await t.run(async (ctx) =>
				ctx.db.insert("fileUploads", {
					userId,
					chatId,
					storageId,
					filename: "shared.txt",
					contentType: "text/plain",
					size: 6,
					uploadedAt: Date.now(),
				})
			);

			await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "Same file referenced twice",
					status: "completed",
					createdAt: Date.now(),
					attachments: [
						{
							storageId,
							filename: "shared.txt",
							contentType: "text/plain",
							size: 6,
							uploadedAt: Date.now(),
						},
						{
							storageId,
							filename: "shared.txt",
							contentType: "text/plain",
							size: 6,
							uploadedAt: Date.now(),
						},
					],
				})
			);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.list, { chatId, userId });

			expect(result).toHaveLength(1);
			expect(result[0].attachments).toHaveLength(2);
		});
	});

	describe("getFirstUserMessage", () => {
		test("returns null when no messages", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getFirstUserMessage, { chatId, userId });

			expect(result).toBeNull();
		});

		test("returns first user message content", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			vi.setSystemTime(1000);
			await seedMessage(t, chatId, userId, "user", "completed", "First user msg");
			vi.setSystemTime(2000);
			await seedMessage(t, chatId, userId, "assistant", "completed", "Assistant reply");
			vi.setSystemTime(3000);
			await seedMessage(t, chatId, userId, "user", "completed", "Second user msg");

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getFirstUserMessage, { chatId, userId });

			expect(result).toBe("First user msg");
		});

		test("returns null for assistant-only chat", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "assistant", "completed", "Only assistant");

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getFirstUserMessage, { chatId, userId });

			expect(result).toBeNull();
		});

		test("returns null for wrong user's chat", async () => {
			const userId1 = await seedUser(t, "ext_1");
			const userId2 = await seedUser(t, "ext_2");
			const chatId = await seedChat(t, userId1);
			await seedMessage(t, chatId, userId1, "user", "completed", "Hello");

			const result = await t
				.withIdentity({ subject: "ext_2" })
				.query(api.message_queries.getFirstUserMessage, { chatId, userId: userId2 });

			expect(result).toBeNull();
		});

		test("requires authentication", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			await expect(
				t.query(api.message_queries.getFirstUserMessage, { chatId, userId }),
			).rejects.toThrow();
		});
	});

	describe("getActiveStream", () => {
		test("returns null when no messages", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getActiveStream, { chatId, userId });

			expect(result).toBeNull();
		});

		test("returns null when all messages are completed", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "assistant", "completed", "Done");

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getActiveStream, { chatId, userId });

			expect(result).toBeNull();
		});

		test("returns streamId when a message has status=streaming", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "assistant", "streaming", "...", {
				streamId: "stream_abc123",
			});

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getActiveStream, { chatId, userId });

			expect(result).toBe("stream_abc123");
		});

		test("returns null when streamId is not set on streaming message", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			await seedMessage(t, chatId, userId, "assistant", "streaming", "...");

			const result = await t
				.withIdentity({ subject: "ext_1" })
				.query(api.message_queries.getActiveStream, { chatId, userId });

			expect(result).toBeNull();
		});

		test("returns null for wrong user's chat", async () => {
			const userId1 = await seedUser(t, "ext_1");
			const userId2 = await seedUser(t, "ext_2");
			const chatId = await seedChat(t, userId1);
			await seedMessage(t, chatId, userId1, "assistant", "streaming", "...", {
				streamId: "stream_xyz",
			});

			const result = await t
				.withIdentity({ subject: "ext_2" })
				.query(api.message_queries.getActiveStream, { chatId, userId: userId2 });

			expect(result).toBeNull();
		});

		test("requires authentication", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			await expect(
				t.query(api.message_queries.getActiveStream, { chatId, userId }),
			).rejects.toThrow();
		});
	});
});
