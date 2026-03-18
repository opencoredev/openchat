import type { FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { sanitizeTitle } from "./lib/sanitize";
import { requireAuthUserId, requireAuthUserIdFromAction } from "./lib/auth";
import { decryptSecret } from "./lib/crypto";
import { createLogger } from "./lib/logger";
import { OSSCHAT_IO_URL, TITLE_GENERATION_MODEL_ID } from "./lib/constants";

const logger = createLogger("chatTitle");
const TITLE_MAX_LENGTH = 200;

const TITLE_STYLE_PROMPTS: Record<"short" | "standard" | "long", string> = {
	short: "Use 2-4 words.",
	standard: "Use 4-6 words.",
	long: "Use 7-10 words.",
};

type TitleLength = "short" | "standard" | "long";
type TitleProvider = "osschat" | "openrouter";

const getOpenRouterKeyInternalRef =
	"users:getOpenRouterKeyInternal" as unknown as FunctionReference<
		"query",
		"internal",
		{ userId: Id<"users"> },
		string | null
	>;

const enforceTitleRateLimitRef =
	"chatTitle:enforceTitleRateLimit" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: Id<"users"> },
		null
	>;

const getChatForTitleGenerationInternalRef =
	"chatTitle:getChatForTitleGenerationInternal" as unknown as FunctionReference<
		"query",
		"internal",
		{ chatId: Id<"chats">; userId: Id<"users"> },
		{ title?: string | null } | null
	>;

const setGeneratedTitleInternalRef =
	"chatTitle:setGeneratedTitleInternal" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ chatId: Id<"chats">; userId: Id<"users">; title: string; force?: boolean },
		null
	>;

async function resolveOpenRouterKey(
	ctx: ActionCtx,
	userId: Id<"users">,
	provider: TitleProvider,
): Promise<string | null> {
	if (provider === "osschat") {
		return process.env.OPENROUTER_API_KEY ?? null;
	}

	const encryptedKey = await ctx.runQuery(getOpenRouterKeyInternalRef, {
		userId,
	});
	return encryptedKey ? await decryptSecret(encryptedKey) : null;
}

async function generateTitleFromSeed(
	seedText: string,
	length: TitleLength,
	openRouterKey: string,
): Promise<string | null> {
	const normalizedSeed = seedText.trim().slice(0, 500);
	if (!normalizedSeed) return null;

	const systemPrompt = [
		"Create a specific, useful chat title.",
		"Return only the title in Title Case; no quotes, no trailing punctuation.",
		"Focus on the core topic or task; avoid filler words like 'and', 'with', 'about'.",
		TITLE_STYLE_PROMPTS[length],
	].join(" ");

	try {
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${openRouterKey}`,
			"HTTP-Referer": process.env.CONVEX_SITE_URL || OSSCHAT_IO_URL,
			"X-Title": "OSSChat",
		},
		body: JSON.stringify({
			model: TITLE_GENERATION_MODEL_ID,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: normalizedSeed },
			],
			temperature: 0.2,
			max_tokens: 32,
		}),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			void logger.warn("OpenRouter error", { status: response.status, errorBody });
			return null;
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) return null;

		let title = content.trim();
		if (
			(title.startsWith("\"") && title.endsWith("\"")) ||
			(title.startsWith("'") && title.endsWith("'"))
		) {
			title = title.slice(1, -1).trim();
		}

		const sanitizedTitle = sanitizeTitle(title, TITLE_MAX_LENGTH);
		return sanitizedTitle || null;
	} catch (error) {
		void logger.error("Failed to generate title", error);
		return null;
	}
}

export const generateTitle = action({
	args: {
		userId: v.id("users"),
		seedText: v.string(),
		length: v.union(v.literal("short"), v.literal("standard"), v.literal("long")),
		provider: v.union(v.literal("osschat"), v.literal("openrouter")),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (_ctx, args) => {
		const userId = await requireAuthUserIdFromAction(_ctx, args.userId);
		await _ctx.runMutation(enforceTitleRateLimitRef, {
			userId,
		});

		const seedText = args.seedText.trim();
		if (!seedText) return null;

		const openRouterKey = await resolveOpenRouterKey(_ctx, userId, args.provider);
		if (!openRouterKey) return null;

		return generateTitleFromSeed(seedText, args.length, openRouterKey);
	},
});

export const generateAndSetTitleInternal = internalAction({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		seedText: v.string(),
		length: v.union(v.literal("short"), v.literal("standard"), v.literal("long")),
		provider: v.union(v.literal("osschat"), v.literal("openrouter")),
		force: v.optional(v.boolean()),
	},
	returns: v.object({
		saved: v.boolean(),
		title: v.optional(v.string()),
		reason: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const chat = await ctx.runQuery(getChatForTitleGenerationInternalRef, {
			chatId: args.chatId,
			userId: args.userId,
		});
		if (!chat) {
			return { saved: false, reason: "chat_not_found" };
		}

		if (!args.force && chat.title && chat.title !== "New Chat") {
			return { saved: false, reason: "title_already_set" };
		}

		const seedText = args.seedText.trim();
		if (!seedText) {
			return { saved: false, reason: "empty_seed" };
		}

		await ctx.runMutation(enforceTitleRateLimitRef, {
			userId: args.userId,
		});

		const openRouterKey = await resolveOpenRouterKey(ctx, args.userId, args.provider);
		if (!openRouterKey) {
			return { saved: false, reason: "missing_openrouter_key" };
		}

		const generatedTitle = await generateTitleFromSeed(
			seedText,
			args.length,
			openRouterKey,
		);
		if (!generatedTitle) {
			return { saved: false, reason: "generation_failed" };
		}

		await ctx.runMutation(setGeneratedTitleInternalRef, {
			chatId: args.chatId,
			userId: args.userId,
			title: generatedTitle,
			force: args.force,
		});

		return {
			saved: true,
			title: generatedTitle,
		};
	},
});

export const enforceTitleRateLimit = internalMutation({
	args: {
		userId: v.id("users"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "chatTitleGenerate", {
			key: args.userId,
		});

		if (!ok) {
			throwRateLimitError("title generations", retryAfter);
		}

		return null;
	},
});

/**
 * Update a chat's title if it's still the default "New Chat" or empty.
 * Used to automatically generate titles from the first user message.
 */
export const updateTitle = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		title: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return null;
		}

		if (chat.title === "New Chat" || !chat.title) {
			const sanitizedTitle = sanitizeTitle(args.title, TITLE_MAX_LENGTH);
			await ctx.db.patch(args.chatId, {
				title: sanitizedTitle,
				updatedAt: Date.now(),
			});
		}

		return null;
	},
});

export const setGeneratedTitle = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		title: v.string(),
		force: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return null;
		}

		const sanitizedTitle = sanitizeTitle(args.title, TITLE_MAX_LENGTH);
		if (!sanitizedTitle) return null;

		const shouldForce = args.force === true;
		if (!shouldForce && chat.title !== "New Chat" && chat.title) {
			return null;
		}

		await ctx.db.patch(args.chatId, {
			title: sanitizedTitle,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const getChatForTitleGenerationInternal = internalQuery({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.union(
		v.object({
			_id: v.id("chats"),
			userId: v.id("users"),
			title: v.string(),
			deletedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== args.userId || chat.deletedAt) {
			return null;
		}

		return {
			_id: chat._id,
			userId: chat.userId,
			title: chat.title,
			deletedAt: chat.deletedAt,
		};
	},
});

export const setGeneratedTitleInternal = internalMutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		title: v.string(),
		force: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== args.userId || chat.deletedAt) {
			return null;
		}

		const sanitizedTitle = sanitizeTitle(args.title, TITLE_MAX_LENGTH);
		if (!sanitizedTitle) return null;

		const shouldForce = args.force === true;
		if (!shouldForce && chat.title !== "New Chat" && chat.title) {
			return null;
		}

		await ctx.db.patch(args.chatId, {
			title: sanitizedTitle,
			updatedAt: Date.now(),
		});

		return null;
	},
});

/**
 * Force set a chat title (used for manual regeneration).
 */
export const setTitle = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		title: v.string(),
		updateUpdatedAt: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return null;
		}

		const sanitizedTitle = sanitizeTitle(args.title, TITLE_MAX_LENGTH);
		const shouldUpdateTimestamp = args.updateUpdatedAt ?? true;
		await ctx.db.patch(args.chatId, {
			title: sanitizedTitle,
			updatedAt: shouldUpdateTimestamp ? Date.now() : chat.updatedAt,
		});

		return null;
	},
});
