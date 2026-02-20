import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { incrementStat, STAT_KEYS } from "./lib/dbStats";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { sanitizeTitle } from "./lib/sanitize";
import { requireAuthUserId } from "./lib/auth";

const chatDoc = v.object({
	_id: v.id("chats"),
	_creationTime: v.number(),
	userId: v.id("users"),
	title: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	lastMessageAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	messageCount: v.optional(v.number()),
	status: v.optional(v.union(v.literal("idle"), v.literal("streaming"))),
	activeStreamId: v.optional(v.string()),
	forkedFromChatId: v.optional(v.id("chats")),
	forkedFromMessageId: v.optional(v.string()),
});

// Optimized chat list response: exclude redundant fields to reduce bandwidth
const chatListItemDoc = v.object({
	_id: v.id("chats"),
	title: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	lastMessageAt: v.optional(v.number()),
	// Chat status for streaming indicator in sidebar
	status: v.optional(v.string()),
	forkedFromChatId: v.optional(v.id("chats")),
});

// Security configuration: enforce maximum chat list limit
const MAX_CHAT_LIST_LIMIT = 200;
const DEFAULT_CHAT_LIST_LIMIT = 50;

export const list = query({
	args: {
		userId: v.id("users"),
		cursor: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		chats: v.array(chatListItemDoc),
		nextCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// SECURITY: Enforce maximum limit to prevent unbounded queries
		// Even if client requests more, cap at MAX_CHAT_LIST_LIMIT
		let limit = args.limit ?? DEFAULT_CHAT_LIST_LIMIT;

		// Validate and enforce maximum limit
		if (!Number.isFinite(limit) || limit <= 0) {
			limit = DEFAULT_CHAT_LIST_LIMIT;
		} else if (limit > MAX_CHAT_LIST_LIMIT) {
			limit = MAX_CHAT_LIST_LIMIT;
		}

		// PERFORMANCE OPTIMIZATION: Use by_user_not_deleted index to filter soft-deleted chats at index level
		// This is much faster than loading all chats and filtering in JavaScript
		// Index structure: [userId, deletedAt, updatedAt] allows efficient filtering
		const results = await ctx.db
			.query("chats")
			.withIndex("by_user_not_deleted", (q) =>
				q.eq("userId", userId).eq("deletedAt", undefined)
			)
			.order("desc")
			.paginate({
				cursor: args.cursor ?? null,
				numItems: limit,
			});

		// BANDWIDTH OPTIMIZATION: Filter out redundant fields (14% reduction per chat)
		// - userId: All chats belong to querying user (redundant)
		// - _creationTime: Duplicates createdAt field
		// - deletedAt: Always undefined (filtered at index level)
		// - messageCount: Not used in frontend chat list
		return {
			chats: results.page.map(chat => ({
				_id: chat._id,
				title: chat.title,
				createdAt: chat.createdAt,
				updatedAt: chat.updatedAt,
				lastMessageAt: chat.lastMessageAt,
				// Include status for streaming indicator in sidebar
				status: chat.status,
				forkedFromChatId: chat.forkedFromChatId,
			})),
			nextCursor: results.continueCursor ?? null,
		};
	},
});

export const get = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.union(chatDoc, v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) return null;
		return chat;
	},
});

export const create = mutation({
	args: {
		userId: v.id("users"),
		title: v.string(),
	},
	returns: v.object({ chatId: v.id("chats") }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const sanitizedTitle = sanitizeTitle(args.title);

		// Simple rate limiting with the package - returns { ok, retryAfter }
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "chatCreate", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("chats created", retryAfter);
		}

		const now = Date.now();
		const chatId = await ctx.db.insert("chats", {
			userId,
			title: sanitizedTitle,
			createdAt: now,
			updatedAt: now,
			lastMessageAt: now,
			messageCount: 0,
			status: "idle",
		});

		await incrementStat(ctx, STAT_KEYS.CHATS_TOTAL);

		return { chatId };
	},
});

export const remove = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.object({ ok: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Rate limit chat deletions to prevent abuse
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "chatDelete", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("deletions", retryAfter);
		}

		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return { ok: false } as const;
		}
		const now = Date.now();

		const messages = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined)
			)
			.collect();

		await Promise.all(
			messages.map((message) =>
				ctx.db.patch(message._id, {
					deletedAt: now,
				}),
			),
		);

		await ctx.db.patch(args.chatId, {
			deletedAt: now,
			messageCount: 0,
		});

		await incrementStat(ctx, STAT_KEYS.CHATS_SOFT_DELETED);
		await incrementStat(ctx, STAT_KEYS.MESSAGES_SOFT_DELETED, messages.length);

		return { ok: true } as const;
	},
});

// Maximum number of chats that can be deleted in a single bulk operation
const MAX_BULK_DELETE_SIZE = 50;

export const removeBulk = mutation({
	args: {
		chatIds: v.array(v.id("chats")),
		userId: v.id("users"),
	},
	returns: v.object({
		ok: v.boolean(),
		deleted: v.number(),
		failed: v.number(),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Validate bulk size to prevent abuse
		if (args.chatIds.length === 0) {
			return { ok: true, deleted: 0, failed: 0 };
		}

		if (args.chatIds.length > MAX_BULK_DELETE_SIZE) {
			throw new Error(`Cannot delete more than ${MAX_BULK_DELETE_SIZE} chats at once`);
		}

		// Rate limit: consume one token per chat being deleted
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "chatBulkDelete", {
			key: userId,
			count: args.chatIds.length,
		});

		if (!ok) {
			throwRateLimitError("bulk deletions", retryAfter);
		}

		const now = Date.now();
		let deleted = 0;
		let failed = 0;
		let totalMessages = 0;

		// First pass: validate all chats and collect valid ones
		const validChats: Array<{ chatId: Id<"chats"> }> = [];
		for (const chatId of args.chatIds) {
			const chat = await ctx.db.get(chatId);

			// Skip if chat doesn't exist, doesn't belong to user, or is already deleted
			if (!chat || chat.userId !== userId || chat.deletedAt) {
				failed++;
				continue;
			}

			validChats.push({ chatId });
		}

		// Second pass: fetch all messages for valid chats in parallel
		const messagesByChat = await Promise.all(
			validChats.map(async ({ chatId }) => {
				const messages = await ctx.db
					.query("messages")
					.withIndex("by_chat_not_deleted", (q) =>
						q.eq("chatId", chatId).eq("deletedAt", undefined)
					)
					.collect();
				return { chatId, messages };
			})
		);

		// Third pass: soft-delete all messages and chats
		for (const { chatId, messages } of messagesByChat) {
			// Soft-delete all messages for this chat
			await Promise.all(
				messages.map((message) =>
					ctx.db.patch(message._id, {
						deletedAt: now,
					}),
				),
			);

			// Soft-delete the chat
			await ctx.db.patch(chatId, {
				deletedAt: now,
				messageCount: 0,
			});

			deleted++;
			totalMessages += messages.length;
		}

		// Update stats
		if (deleted > 0) {
			await incrementStat(ctx, STAT_KEYS.CHATS_SOFT_DELETED, deleted);
		}
		if (totalMessages > 0) {
			await incrementStat(ctx, STAT_KEYS.MESSAGES_SOFT_DELETED, totalMessages);
		}

		return { ok: deleted > 0, deleted, failed };
	},
});

export async function assertOwnsChat(
	ctx: MutationCtx | QueryCtx,
	chatId: Id<"chats">,
	userId: Id<"users">,
) {
	const chat = await ctx.db.get(chatId);
	if (!chat || chat.userId !== userId || chat.deletedAt) {
		return null;
	}
	return chat;
}

export const checkExportRateLimit = mutation({
	args: {
		userId: v.id("users"),
	},
	returns: v.object({ ok: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Rate limit chat exports to prevent abuse
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "chatExport", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("exports", retryAfter);
		}

		return { ok: true } as const;
	},
});

// ============================================================================
// Chat Read Status Functions
// ============================================================================

// Security configuration: enforce maximum read status list limit
const MAX_READ_STATUS_LIMIT = 1000;
const DEFAULT_READ_STATUS_LIMIT = 500;

/**
 * Mark a chat as read by updating the lastReadAt timestamp.
 * Creates a new record if one doesn't exist, otherwise updates the existing one.
 */
export const markChatAsRead = mutation({
	args: {
		userId: v.id("users"),
		chatId: v.id("chats"),
	},
	returns: v.object({ ok: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Verify user owns the chat
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return { ok: false };
		}

		const now = Date.now();

		// Check if a read status record already exists
		const existing = await ctx.db
			.query("chatReadStatus")
			.withIndex("by_user_chat", (q) =>
				q.eq("userId", userId).eq("chatId", args.chatId)
			)
			.unique();

		if (existing) {
			// Update existing record
			await ctx.db.patch(existing._id, { lastReadAt: now });
		} else {
			// Create new record
			await ctx.db.insert("chatReadStatus", {
				userId,
				chatId: args.chatId,
				lastReadAt: now,
			});
		}

		return { ok: true };
	},
});

export const getChatReadStatuses = query({
	args: {
		userId: v.id("users"),
		cursor: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		statuses: v.array(
			v.object({
				chatId: v.id("chats"),
				lastReadAt: v.number(),
			})
		),
		nextCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		let limit = args.limit ?? DEFAULT_READ_STATUS_LIMIT;
		if (!Number.isFinite(limit) || limit <= 0) {
			limit = DEFAULT_READ_STATUS_LIMIT;
		} else if (limit > MAX_READ_STATUS_LIMIT) {
			limit = MAX_READ_STATUS_LIMIT;
		}

		const results = await ctx.db
			.query("chatReadStatus")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.paginate({ cursor: args.cursor ?? null, numItems: limit });

		return {
			statuses: results.page.map((s) => ({
				chatId: s.chatId,
				lastReadAt: s.lastReadAt,
			})),
			nextCursor: results.continueCursor ?? null,
		};
	},
});

export const setActiveStream = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		streamId: v.union(v.string(), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return null;
		}

		await ctx.db.patch(args.chatId, {
			activeStreamId: args.streamId ?? undefined,
			status: args.streamId ? "streaming" : "idle",
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const getActiveStream = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return null;
		}
		return chat.activeStreamId ?? null;
	},
});
