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
	role: v.union(v.literal("user"), v.literal("assistant")),
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
type SharedMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
};

function makeShareId() {
	const token = crypto.randomUUID().replace(/-/g, "");
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
	const shares = await ctx.db
		.query("chatShares")
		.withIndex("by_user_chat_revoked_updated", (q) => q.eq("userId", userId).eq("chatId", chatId))
		.order("desc")
		.collect();
	return shares.find((share) => !share.revokedAt) ?? null;
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

async function getSharedMessages(ctx: QueryCtx, chatId: Id<"chats">) {
	const messagesPage = await ctx.db
		.query("messages")
		.withIndex("by_chat_not_deleted", (q) =>
			q.eq("chatId", chatId).eq("deletedAt", undefined),
		)
		.order("asc")
		.paginate({ cursor: null, numItems: MAX_PUBLIC_MESSAGES });

	return messagesPage.page.flatMap<SharedMessage>((message) => {
		if (message.role !== "user" && message.role !== "assistant") {
			return [];
		}

		return [
			{
				id: message._id,
				role: message.role,
				content: message.content,
				createdAt: message.createdAt,
			},
		];
	});
}

export const getByChat = query({
	args: {
		chatId: v.id("chats"),
	},
	returns: v.union(shareDoc, v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) return null;
		return getActiveShareForChat(ctx, userId, args.chatId);
	},
});

export const createOrGet = mutation({
	args: {
		chatId: v.id("chats"),
	},
	returns: v.object({
		shareId: v.string(),
		createdAt: v.number(),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx);
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
	},
	returns: v.object({ revoked: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx);
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

		const messages = await getSharedMessages(ctx, chat._id);
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

		const messages = await getSharedMessages(ctx, chat._id);
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
