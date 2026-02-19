import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";

const MAX_READ_STATUS_LIMIT = 1000;
const DEFAULT_READ_STATUS_LIMIT = 500;

export const markChatAsRead = mutation({
	args: {
		userId: v.id("users"),
		chatId: v.id("chats"),
	},
	returns: v.object({ ok: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId || chat.deletedAt) {
			return { ok: false };
		}

		const now = Date.now();

		const existing = await ctx.db
			.query("chatReadStatus")
			.withIndex("by_user_chat", (q) =>
				q.eq("userId", userId).eq("chatId", args.chatId)
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, { lastReadAt: now });
		} else {
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
			.paginate({
				cursor: args.cursor ?? null,
				numItems: limit,
			});

		return {
			statuses: results.page.map((s) => ({
				chatId: s.chatId,
				lastReadAt: s.lastReadAt,
			})),
			nextCursor: results.continueCursor ?? null,
		};
	},
});
