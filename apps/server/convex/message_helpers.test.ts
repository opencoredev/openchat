import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter } from "./testSetup.test";
import { getVerifiedStorageIds, insertOrUpdateMessage } from "./message_helpers";

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

async function seedFileUpload(
	t: ReturnType<typeof makeConvexTest>,
	userId: Id<"users">,
	chatId: Id<"chats">,
	storageId: Id<"_storage">,
	extra: Record<string, unknown> = {},
) {
	return t.run(async (ctx) =>
		ctx.db.insert("fileUploads", {
			userId,
			chatId,
			storageId,
			filename: "file.txt",
			contentType: "text/plain",
			size: 100,
			uploadedAt: Date.now(),
			...extra,
		}),
	);
}

describe("message_helpers", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getVerifiedStorageIds", () => {
		test("returns empty set when no storageIds provided", async () => {
			const userId = await seedUser(t);
			await seedChat(t, userId);
			const resultArr = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(ctx, [], userId);
				return Array.from(set);
			});
			expect(resultArr).toHaveLength(0);
		});

		test("returns empty set for multiple storage IDs when none found", async () => {
			await seedUser(t);
			const userId2 = await seedUser(t, "ext_2");
			const resultArr = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(ctx, [], userId2);
				return Array.from(set);
			});
			expect(resultArr).toHaveLength(0);
		});
	});

	describe("insertOrUpdateMessage", () => {
		test("inserts a new message", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const messageId = await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "user",
					content: "Hello",
					createdAt: Date.now(),
					status: "completed",
					userId,
				}),
			);

			const message = await t.run(async (ctx) => ctx.db.get(messageId));
			expect(message).not.toBeNull();
			expect(message?.content).toBe("Hello");
			expect(message?.role).toBe("user");
		});

		test("throws for invalid role", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			await expect(
				t.run(async (ctx) =>
					insertOrUpdateMessage(ctx, {
						chatId,
						role: "system",
						content: "Invalid",
						createdAt: Date.now(),
						status: "completed",
					}),
				),
			).rejects.toThrow("Invalid message role");
		});

		test("throws for content exceeding 100KB", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const hugeContent = "x".repeat(100 * 1024 + 1);

			await expect(
				t.run(async (ctx) =>
					insertOrUpdateMessage(ctx, {
						chatId,
						role: "user",
						content: hugeContent,
						createdAt: Date.now(),
						status: "completed",
					}),
				),
			).rejects.toThrow("exceeds maximum length");
		});

		test("updates existing message by overrideId", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const originalId = await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "Original",
					status: "streaming",
					createdAt: Date.now(),
				}),
			);

			await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "assistant",
					content: "Updated",
					createdAt: Date.now(),
					status: "completed",
					overrideId: originalId,
				}),
			);

			const message = await t.run(async (ctx) => ctx.db.get(originalId));
			expect(message?.content).toBe("Updated");
			expect(message?.role).toBe("assistant");
		});

		test("deduplicates by clientMessageId", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const id1 = await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "user",
					content: "First",
					createdAt: Date.now(),
					status: "completed",
					clientMessageId: "client_msg_1",
				}),
			);

			const id2 = await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "user",
					content: "Updated via clientMessageId",
					createdAt: Date.now(),
					status: "completed",
					clientMessageId: "client_msg_1",
				}),
			);

			expect(id1).toBe(id2);
			const message = await t.run(async (ctx) => ctx.db.get(id1));
			expect(message?.content).toBe("Updated via clientMessageId");
		});

		test("increments chat messageCount on new insert", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "user",
					content: "Hello",
					createdAt: Date.now(),
					status: "completed",
				}),
			);

			const chat = await t.run(async (ctx) => ctx.db.get(chatId));
			expect(chat?.messageCount).toBe(1);
		});

		test("does not increment messageCount on update", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const msgId = await t.run(async (ctx) =>
				ctx.db.insert("messages", {
					chatId,
					userId,
					role: "user",
					content: "Original",
					status: "streaming",
					createdAt: Date.now(),
				}),
			);

			await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "assistant",
					content: "Updated",
					createdAt: Date.now(),
					status: "completed",
					overrideId: msgId,
				}),
			);

			const chat = await t.run(async (ctx) => ctx.db.get(chatId));
			expect(chat?.messageCount ?? 0).toBe(0);
		});

		test("stores optional fields", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const msgId = await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "assistant",
					content: "Response",
					createdAt: Date.now(),
					status: "completed",
					modelId: "gpt-4o",
					provider: "openai",
					reasoning: "Let me think...",
					webSearchEnabled: true,
					webSearchUsed: false,
				}),
			);

			const message = await t.run(async (ctx) => ctx.db.get(msgId));
			expect(message?.modelId).toBe("gpt-4o");
			expect(message?.provider).toBe("openai");
			expect(message?.reasoning).toBe("Let me think...");
			expect(message?.webSearchEnabled).toBe(true);
			expect(message?.webSearchUsed).toBe(false);
		});

		test("inserts with valid attachment and userId (line 134 — validateAttachmentOwnership called)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["attachment data"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId, chatId, storageId);

			const msgId = await t.run(async (ctx) =>
				insertOrUpdateMessage(ctx, {
					chatId,
					role: "user",
					content: "With valid attachment",
					createdAt: Date.now(),
					status: "completed",
					userId,
					attachments: [
						{
							storageId,
							filename: "attachment.txt",
							contentType: "text/plain",
							size: 15,
							uploadedAt: Date.now(),
						},
					],
				}),
			);

			const message = await t.run(async (ctx) => ctx.db.get(msgId));
			expect(message?.attachments).toHaveLength(1);
		});

		test("throws when attachment references non-existent file (lines 43-46)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["data"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await expect(
				t.run(async (ctx) =>
					insertOrUpdateMessage(ctx, {
						chatId,
						role: "user",
						content: "With missing file",
						createdAt: Date.now(),
						status: "completed",
						userId,
						attachments: [
							{
								storageId,
								filename: "ghost.txt",
								contentType: "text/plain",
								size: 4,
								uploadedAt: Date.now(),
							},
						],
					}),
				),
			).rejects.toThrow("does not exist in your uploads");
		});

		test("throws when attachment owned by different user (lines 49-52)", async () => {
			const userId = await seedUser(t, "ext_1");
			const userId2 = await seedUser(t, "ext_2");
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["data"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId2, chatId, storageId);

			await expect(
				t.run(async (ctx) =>
					insertOrUpdateMessage(ctx, {
						chatId,
						role: "user",
						content: "Wrong owner",
						createdAt: Date.now(),
						status: "completed",
						userId,
						attachments: [
							{
								storageId,
								filename: "other-user-file.txt",
								contentType: "text/plain",
								size: 4,
								uploadedAt: Date.now(),
							},
						],
					}),
				),
			).rejects.toThrow("you do not own the referenced attachment file");
		});

		test("throws when attachment is deleted (lines 55-58)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["data"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId, chatId, storageId, { deletedAt: Date.now() });

			await expect(
				t.run(async (ctx) =>
					insertOrUpdateMessage(ctx, {
						chatId,
						role: "user",
						content: "Deleted file",
						createdAt: Date.now(),
						status: "completed",
						userId,
						attachments: [
							{
								storageId,
								filename: "deleted.txt",
								contentType: "text/plain",
								size: 4,
								uploadedAt: Date.now(),
							},
						],
					}),
				),
			).rejects.toThrow("file that has been deleted");
		});

		test("throws when too many attachments provided (lines 31-35)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["x"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			const tooMany = Array.from({ length: 21 }, (_, i) => ({
				storageId,
				filename: `file${i}.txt`,
				contentType: "text/plain",
				size: 1,
				uploadedAt: Date.now(),
			}));

			await expect(
				t.run(async (ctx) =>
					insertOrUpdateMessage(ctx, {
						chatId,
						role: "user",
						content: "Too many attachments",
						createdAt: Date.now(),
						status: "completed",
						userId,
						attachments: tooMany,
					}),
				),
			).rejects.toThrow("Too many attachments");
		});
	});

	describe("getVerifiedStorageIds — loop body (lines 71-77)", () => {
		test("verifies storage ID when fileUpload exists and userId matches (line 77)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["content"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId, chatId, storageId);

			const result = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(ctx, [storageId], userId);
				return Array.from(set);
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toBe(storageId);
		});

		test("excludes storage ID when fileUpload not found (line 76 — condition false)", async () => {
			const userId = await seedUser(t);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["content"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			const result = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(ctx, [storageId], userId);
				return Array.from(set);
			});

			expect(result).toHaveLength(0);
		});

		test("excludes storage ID when fileUpload owned by different user (line 76 — userId mismatch)", async () => {
			const userId1 = await seedUser(t, "ext_1");
			const userId2 = await seedUser(t, "ext_2");
			const chatId = await seedChat(t, userId1);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["content"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId2, chatId, storageId);

			const result = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(ctx, [storageId], userId1);
				return Array.from(set);
			});

			expect(result).toHaveLength(0);
		});

		test("excludes storage ID when fileUpload is deleted (line 76 — deletedAt set)", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const storageId = await t.run(async (ctx) => {
				const blob = new Blob(["content"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId, chatId, storageId, { deletedAt: Date.now() });

			const result = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(ctx, [storageId], userId);
				return Array.from(set);
			});

			expect(result).toHaveLength(0);
		});

		test("verifies only matching IDs from a mixed batch", async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			const ownedId = await t.run(async (ctx) => {
				const blob = new Blob(["owned"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});
			const unownedId = await t.run(async (ctx) => {
				const blob = new Blob(["unowned"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});
			const deletedId = await t.run(async (ctx) => {
				const blob = new Blob(["deleted"], { type: "text/plain" });
				return ctx.storage.store(blob);
			});

			await seedFileUpload(t, userId, chatId, ownedId);
			await seedFileUpload(t, userId, chatId, deletedId, { deletedAt: Date.now() });

			const result = await t.run(async (ctx) => {
				const set = await getVerifiedStorageIds(
					ctx,
					[ownedId, unownedId, deletedId],
					userId,
				);
				return Array.from(set);
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toBe(ownedId);
		});
	});
});
