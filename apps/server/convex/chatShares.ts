import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertOwnsChat } from "./chats";
import { requireAuthUserId } from "./lib/auth";

const shareDoc = v.object({
	_id: v.id("chatShares"),
	_creationTime: v.number(),
	userId: v.id("users"),
	chatId: v.id("chats"),
	shareId: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	revokedAt: v.optional(v.number()),
});

const sharedMessageDoc = v.object({
	id: v.string(),
	role: v.string(),
	content: v.string(),
	createdAt: v.number(),
});

const sharedPreviewDoc = v.object({
	shareId: v.string(),
	title: v.string(),
	firstUserPrompt: v.union(v.string(), v.null()),
	firstAssistantResponse: v.union(v.string(), v.null()),
});

const sharedChatDoc = v.object({
	shareId: v.string(),
	title: v.string(),
	firstUserPrompt: v.union(v.string(), v.null()),
	firstAssistantResponse: v.union(v.string(), v.null()),
	messages: v.array(sharedMessageDoc),
});

const MAX_PUBLIC_MESSAGES = 300;

function makeShareId() {
	const token = crypto.randomUUID().replaceAll("-", "");
	return token.slice(0, 22);
}

async function generateUniqueShareId(ctx: MutationCtx): Promise<string> {
	for (let i = 0; i < 5; i++) {
		const shareId = makeShareId();
		const existing = await ctx.db
			.query("chatShares")
			.withIndex("by_share_id", (q) => q.eq("shareId", shareId))
			.first();
		if (!existing) return shareId;
	}
	throw new Error("Unable to generate share token");
}

async function getActiveShareForChat(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	chatId: Id<"chats">,
) {
	return ctx.db
		.query("chatShares")
		.withIndex("by_user_chat_revoked_updated", (q) =>
			q.eq("userId", userId).eq("chatId", chatId).eq("revokedAt", undefined),
		)
		.order("desc")
		.first();
}

function normalizePreviewText(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

function buildPreview(messages: Array<{ role: string; content: string }>) {
	let firstUserPrompt: string | null = null;
	let firstAssistantResponse: string | null = null;

	for (const message of messages) {
		const content = normalizePreviewText(message.content);
		if (!content) continue;
		if (!firstUserPrompt && message.role === "user") {
			firstUserPrompt = content;
			continue;
		}
		if (!firstAssistantResponse && message.role === "assistant") {
			firstAssistantResponse = content;
		}
		if (firstUserPrompt && firstAssistantResponse) break;
	}

	return { firstUserPrompt, firstAssistantResponse };
}

export const getByChat = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.union(shareDoc, v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) return null;
		return getActiveShareForChat(ctx, userId, args.chatId);
	},
});

export const createOrGet = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.object({
		shareId: v.string(),
		createdAt: v.number(),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) {
			throw new Error("Chat not found");
		}

		const existing = await getActiveShareForChat(ctx, userId, args.chatId);
		if (existing) {
			return {
				shareId: existing.shareId,
				createdAt: existing.createdAt,
			};
		}

		const now = Date.now();
		const shareId = await generateUniqueShareId(ctx);

		await ctx.db.insert("chatShares", {
			userId,
			chatId: args.chatId,
			shareId,
			createdAt: now,
			updatedAt: now,
		});

		return {
			shareId,
			createdAt: now,
		};
	},
});

export const revoke = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.object({ revoked: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) return { revoked: false };

		const share = await getActiveShareForChat(ctx, userId, args.chatId);
		if (!share) return { revoked: false };

		const now = Date.now();
		await ctx.db.patch(share._id, {
			revokedAt: now,
			updatedAt: now,
		});

		return { revoked: true };
	},
});

export const getPreviewByShareId = query({
	args: {
		shareId: v.string(),
	},
	returns: v.union(sharedPreviewDoc, v.null()),
	handler: async (ctx, args) => {
		const share = await ctx.db
			.query("chatShares")
			.withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
			.first();
		if (!share || share.revokedAt) return null;

		const chat = await ctx.db.get(share.chatId);
		if (!chat || chat.deletedAt) return null;

		const messagesPage = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", chat._id).eq("deletedAt", undefined),
			)
			.order("asc")
			.paginate({ cursor: null, numItems: MAX_PUBLIC_MESSAGES });

		const messages = messagesPage.page
			.filter((message) => message.role === "user" || message.role === "assistant")
			.map((message) => ({
				role: message.role,
				content: message.content,
			}));
		const preview = buildPreview(messages);

		return {
			shareId: share.shareId,
			title: chat.title,
			firstUserPrompt: preview.firstUserPrompt,
			firstAssistantResponse: preview.firstAssistantResponse,
		};
	},
});

export const getPublicByShareId = query({
	args: {
		shareId: v.string(),
	},
	returns: v.union(sharedChatDoc, v.null()),
	handler: async (ctx, args) => {
		const share = await ctx.db
			.query("chatShares")
			.withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
			.first();
		if (!share || share.revokedAt) return null;

		const chat = await ctx.db.get(share.chatId);
		if (!chat || chat.deletedAt) return null;

		const messagesPage = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", chat._id).eq("deletedAt", undefined),
			)
			.order("asc")
			.paginate({ cursor: null, numItems: MAX_PUBLIC_MESSAGES });

		const messages = messagesPage.page
			.filter((message) => message.role === "user" || message.role === "assistant")
			.map((message) => ({
				id: message._id,
				role: message.role,
				content: message.content,
				createdAt: message.createdAt,
			}));
		const preview = buildPreview(messages);

		return {
			shareId: share.shareId,
			title: chat.title,
			firstUserPrompt: preview.firstUserPrompt,
			firstAssistantResponse: preview.firstAssistantResponse,
			messages,
		};
	},
});
