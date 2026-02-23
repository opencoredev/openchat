import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

async function seedChat(
	t: ReturnType<typeof makeConvexTest>,
	userId: Id<"users">,
	title = "New Chat",
) {
	return t.run(async (ctx) =>
		ctx.db.insert("chats", {
			userId,
			title,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

describe("chatTitle.updateTitle", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("updates title when current title is 'New Chat'", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "New Chat");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.updateTitle, {
			chatId,
			userId,
			title: "My Real Title",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("My Real Title");
	});

	test("updates title when current title is empty", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.updateTitle, {
			chatId,
			userId,
			title: "Filled Title",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Filled Title");
	});

	test("does NOT update when title is already set to something custom", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "Custom Title");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.updateTitle, {
			chatId,
			userId,
			title: "Attempted Override",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Custom Title");
	});

	test("returns null and does nothing for a chat belonging to another user", async () => {
		const userId = await seedUser(t, "ext_1");
		const otherId = await seedUser(t, "ext_2");
		const chatId = await seedChat(t, otherId, "New Chat");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.updateTitle, {
			chatId,
			userId,
			title: "Should Not Apply",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("New Chat");
	});

	test("returns null gracefully for a deleted chat", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "New Chat",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: Date.now(),
			}),
		);

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.chatTitle.updateTitle,
			{ chatId, userId, title: "Ghost Title" },
		);

		expect(result).toBeNull();
	});

	test("requires authentication", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		await expect(
			t.mutation(api.chatTitle.updateTitle, { chatId, userId, title: "X" }),
		).rejects.toThrow();
	});
});

describe("chatTitle.setGeneratedTitle", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("sets title when current title is 'New Chat'", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "New Chat");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setGeneratedTitle, {
			chatId,
			userId,
			title: "Generated Title",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Generated Title");
	});

	test("skips when title is already set to something custom", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "Custom Title");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setGeneratedTitle, {
			chatId,
			userId,
			title: "Should Not Override",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Custom Title");
	});

	test("force=true overrides an existing custom title", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "Old Custom Title");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setGeneratedTitle, {
			chatId,
			userId,
			title: "Force New Title",
			force: true,
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Force New Title");
	});

	test("returns null (no-op) when sanitized title is empty", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "New Chat");

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.chatTitle.setGeneratedTitle,
			{ chatId, userId, title: "\x00\x01" },
		);

		expect(result).toBeNull();
		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("New Chat");
	});

	test("returns null for chat belonging to another user", async () => {
		const userId = await seedUser(t, "ext_1");
		const otherId = await seedUser(t, "ext_2");
		const chatId = await seedChat(t, otherId, "New Chat");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setGeneratedTitle, {
			chatId,
			userId,
			title: "Should Not Apply",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("New Chat");
	});

	test("requires authentication", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		await expect(
			t.mutation(api.chatTitle.setGeneratedTitle, { chatId, userId, title: "X" }),
		).rejects.toThrow();
	});
});

describe("chatTitle.setTitle", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("always sets title regardless of existing title", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "Custom Title");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setTitle, {
			chatId,
			userId,
			title: "Forced Override",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Forced Override");
	});

	test("updateUpdatedAt=false preserves existing timestamp", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "Old Title",
				createdAt: 1000,
				updatedAt: 1000,
			}),
		);

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setTitle, {
			chatId,
			userId,
			title: "New Title",
			updateUpdatedAt: false,
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("New Title");
		expect(chat?.updatedAt).toBe(1000);
	});

	test("updateUpdatedAt=true (default) bumps timestamp", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "Old Title",
				createdAt: 1000,
				updatedAt: 1000,
			}),
		);

		vi.setSystemTime(5000);

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setTitle, {
			chatId,
			userId,
			title: "New Title",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.updatedAt).toBeGreaterThan(1000);
	});

	test("returns null for chat belonging to another user", async () => {
		const userId = await seedUser(t, "ext_1");
		const otherId = await seedUser(t, "ext_2");
		const chatId = await seedChat(t, otherId, "Other Chat");

		await t.withIdentity({ subject: "ext_1" }).mutation(api.chatTitle.setTitle, {
			chatId,
			userId,
			title: "Should Not Apply",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Other Chat");
	});

	test("returns null for deleted chat", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "Old Title",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: Date.now(),
			}),
		);

		const result = await t.withIdentity({ subject: "ext_1" }).mutation(
			api.chatTitle.setTitle,
			{ chatId, userId, title: "New Title" },
		);

		expect(result).toBeNull();
	});

	test("requires authentication", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId);

		await expect(
			t.mutation(api.chatTitle.setTitle, { chatId, userId, title: "X" }),
		).rejects.toThrow();
	});
});

describe("chatTitle.getChatForTitleGenerationInternal", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("returns chat for correct user+chat pair", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "New Chat");

		const result = await t.query(internal.chatTitle.getChatForTitleGenerationInternal, {
			chatId,
			userId,
		});

		expect(result).not.toBeNull();
		expect(result?._id).toBe(chatId);
		expect(result?.userId).toBe(userId);
		expect(result?.title).toBe("New Chat");
	});

	test("returns null for wrong user", async () => {
		const userId = await seedUser(t, "ext_1");
		const otherId = await seedUser(t, "ext_2");
		const chatId = await seedChat(t, otherId);

		const result = await t.query(internal.chatTitle.getChatForTitleGenerationInternal, {
			chatId,
			userId,
		});

		expect(result).toBeNull();
	});

	test("returns null for deleted chat", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "New Chat",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: Date.now(),
			}),
		);

		const result = await t.query(internal.chatTitle.getChatForTitleGenerationInternal, {
			chatId,
			userId,
		});

		expect(result).toBeNull();
	});

	test("returns null for non-existent chat", async () => {
		const userId = await seedUser(t);
		const fakeChatId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("chats", {
				userId,
				title: "Temp",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		const result = await t.query(internal.chatTitle.getChatForTitleGenerationInternal, {
			chatId: fakeChatId,
			userId,
		});

		expect(result).toBeNull();
	});
});

describe("chatTitle.setGeneratedTitleInternal", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("sets title on 'New Chat' chats", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "New Chat");

		await t.mutation(internal.chatTitle.setGeneratedTitleInternal, {
			chatId,
			userId,
			title: "AI Generated",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("AI Generated");
	});

	test("skips when title is already set (not 'New Chat')", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "Existing Custom Title");

		await t.mutation(internal.chatTitle.setGeneratedTitleInternal, {
			chatId,
			userId,
			title: "Should Not Apply",
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Existing Custom Title");
	});

	test("force=true overrides existing title", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "Existing Custom Title");

		await t.mutation(internal.chatTitle.setGeneratedTitleInternal, {
			chatId,
			userId,
			title: "Force Replaced",
			force: true,
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("Force Replaced");
	});

	test("returns null for chat belonging to wrong user", async () => {
		const userId = await seedUser(t, "ext_1");
		const otherId = await seedUser(t, "ext_2");
		const chatId = await seedChat(t, otherId, "New Chat");

		const result = await t.mutation(internal.chatTitle.setGeneratedTitleInternal, {
			chatId,
			userId,
			title: "Should Not Apply",
		});

		expect(result).toBeNull();
		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("New Chat");
	});

	test("returns null for deleted chat", async () => {
		const userId = await seedUser(t);
		const chatId = await t.run(async (ctx) =>
			ctx.db.insert("chats", {
				userId,
				title: "New Chat",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: Date.now(),
			}),
		);

		const result = await t.mutation(internal.chatTitle.setGeneratedTitleInternal, {
			chatId,
			userId,
			title: "Ghost Title",
		});

		expect(result).toBeNull();
	});

	test("no-op when sanitized title is empty", async () => {
		const userId = await seedUser(t);
		const chatId = await seedChat(t, userId, "New Chat");

		const result = await t.mutation(internal.chatTitle.setGeneratedTitleInternal, {
			chatId,
			userId,
			title: "\x00\x01",
		});

		expect(result).toBeNull();
		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.title).toBe("New Chat");
	});
});

describe("chatTitle.enforceTitleRateLimit", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("succeeds for the first call (rate limiter is fresh each test)", async () => {
		const userId = await seedUser(t);

		const result = await t.mutation(internal.chatTitle.enforceTitleRateLimit, { userId });

		expect(result).toBeNull();
	});

	test("throws rate limit error after capacity is exhausted", async () => {
		const userId = await seedUser(t);

		for (let i = 0; i < 5; i++) {
			await t.mutation(internal.chatTitle.enforceTitleRateLimit, { userId });
		}

		await expect(
			t.mutation(internal.chatTitle.enforceTitleRateLimit, { userId }),
		).rejects.toThrow();
	});
});

describe("chatTitle.generateAndSetTitleInternal", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("returns chat_not_found when chat does not exist (line 148)", async () => {
		const userId = await seedUser(t, "ext_gen_1");
		const chatId = await seedChat(t, userId, "New Chat");
		await t.run(async (ctx) => ctx.db.delete(chatId));

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "Hello world",
			length: "standard",
			provider: "osschat",
		});

		expect(result.saved).toBe(false);
		expect(result.reason).toBe("chat_not_found");
	});

	test("returns empty_seed when seedText is whitespace only (line 157)", async () => {
		const userId = await seedUser(t, "ext_gen_2");
		const chatId = await seedChat(t, userId, "New Chat");

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "   ",
			length: "standard",
			provider: "osschat",
		});

		expect(result.saved).toBe(false);
		expect(result.reason).toBe("empty_seed");
	});

	test("returns missing_openrouter_key when provider=openrouter and no key stored (line 166)", async () => {
		const userId = await seedUser(t, "ext_gen_3");
		const chatId = await seedChat(t, userId, "New Chat");

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "Hello world test seed",
			length: "standard",
			provider: "openrouter",
		});

		expect(result.saved).toBe(false);
		expect(result.reason).toBe("missing_openrouter_key");
	});

	test("returns generation_failed when OpenRouter returns null content (line 175)", async () => {
		const userId = await seedUser(t, "ext_gen_4");
		const chatId = await seedChat(t, userId, "New Chat");

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "" } }] }),
		}));

		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "Hello world test seed",
			length: "standard",
			provider: "osschat",
		});

		expect(result.saved).toBe(false);
		expect(result.reason).toBe("generation_failed");
	});

	test("saves generated title successfully", async () => {
		const userId = await seedUser(t, "ext_gen_5");
		const chatId = await seedChat(t, userId, "New Chat");

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "My Generated Title" } }] }),
		}));

		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "Hello world test seed",
			length: "standard",
			provider: "osschat",
		});

		expect(result.saved).toBe(true);
		expect(result.title).toBe("My Generated Title");
	});

	test("returns generation_failed when OpenRouter fetch throws (lines 99-100 catch path)", async () => {
		const userId = await seedUser(t, "ext_gen_6");
		const chatId = await seedChat(t, userId, "New Chat");

		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "Hello world test seed",
			length: "standard",
			provider: "osschat",
		});

		expect(result.saved).toBe(false);
		expect(result.reason).toBe("generation_failed");
	});

	test("returns title_already_set when chat has existing custom title", async () => {
		const userId = await seedUser(t, "ext_gen_7");
		const chatId = await seedChat(t, userId, "Existing Custom Title");

		const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
			chatId,
			userId,
			seedText: "Hello world",
			length: "standard",
			provider: "osschat",
			force: false,
		});

		expect(result.saved).toBe(false);
		expect(result.reason).toBe("title_already_set");
	});
});

describe("chatTitle.generateTitle action", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("returns null when seedText is empty", async () => {
		const userId = await seedUser(t, "ext_gentitle_1");

		const result = await t.withIdentity({ subject: "ext_gentitle_1" }).action(api.chatTitle.generateTitle, {
			userId,
			seedText: "   ",
			length: "standard",
			provider: "osschat",
		});

		expect(result).toBeNull();
	});

	test("returns null when provider=openrouter and no key stored", async () => {
		const userId = await seedUser(t, "ext_gentitle_2");

		const result = await t.withIdentity({ subject: "ext_gentitle_2" }).action(api.chatTitle.generateTitle, {
			userId,
			seedText: "Hello world test",
			length: "standard",
			provider: "openrouter",
		});

		expect(result).toBeNull();
	});

	test("returns generated title when successful", async () => {
		const userId = await seedUser(t, "ext_gentitle_3");

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "Generated Title" } }] }),
		}));
		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.withIdentity({ subject: "ext_gentitle_3" }).action(api.chatTitle.generateTitle, {
			userId,
			seedText: "Hello world test",
			length: "standard",
			provider: "osschat",
		});

		expect(result).toBe("Generated Title");
	});

	test("returns null when OpenRouter returns non-ok response (lines 77-79)", async () => {
		const userId = await seedUser(t, "ext_gentitle_4");

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => "rate limit exceeded",
		}));
		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.withIdentity({ subject: "ext_gentitle_4" }).action(api.chatTitle.generateTitle, {
			userId,
			seedText: "Hello world test",
			length: "standard",
			provider: "osschat",
		});

		expect(result).toBeNull();
	});

	test("strips surrounding double quotes from title (line 93)", async () => {
		const userId = await seedUser(t, "ext_gentitle_5");

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: '"My Quoted Title"' } }] }),
		}));
		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.withIdentity({ subject: "ext_gentitle_5" }).action(api.chatTitle.generateTitle, {
			userId,
			seedText: "Hello world test",
			length: "standard",
			provider: "osschat",
		});

		expect(result).toBe("My Quoted Title");
	});

	test("strips surrounding single quotes from title (line 90-93)", async () => {
		const userId = await seedUser(t, "ext_gentitle_6");

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: "'Single Quoted Title'" } }] }),
		}));
		vi.stubEnv("OPENROUTER_API_KEY", "fake-key");

		const result = await t.withIdentity({ subject: "ext_gentitle_6" }).action(api.chatTitle.generateTitle, {
			userId,
			seedText: "Hello world test",
			length: "standard",
			provider: "osschat",
		});

		expect(result).toBe("Single Quoted Title");
	});
});
