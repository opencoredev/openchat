import type { Id } from "./_generated/dataModel";
import { assertOwnsChat } from "./chats";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthUserId } from "./lib/auth";
import { messageDoc } from "./message_validators";
import { getVerifiedStorageIds } from "./message_helpers";

export const list = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.array(messageDoc),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) return [];
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined)
			)
			.order("asc")
			.collect();

		const allStorageIds: Id<"_storage">[] = [];
		for (const message of messages) {
			if (message.attachments) {
				for (const attachment of message.attachments) {
					allStorageIds.push(attachment.storageId);
				}
			}
		}

		let urlMap = new Map<Id<"_storage">, string | null>();
		if (allStorageIds.length > 0) {
			const uniqueStorageIds = Array.from(new Set(allStorageIds));
			const verifiedIds = await getVerifiedStorageIds(ctx, uniqueStorageIds, userId);

			const urlPromises = uniqueStorageIds.map(async (storageId) => {
				if (!verifiedIds.has(storageId)) {
					return { storageId, url: null };
				}
				try {
					const url = await ctx.storage.getUrl(storageId);
					return { storageId, url };
				} catch {
					return { storageId, url: null };
				}
			});

			const urlResults = await Promise.all(urlPromises);
			for (const { storageId, url } of urlResults) {
				urlMap.set(storageId, url);
			}
		}

		const messagesWithUrls = messages.map((message) => {
			if (!message.attachments || message.attachments.length === 0) {
				return message;
			}

			return {
				...message,
				attachments: message.attachments.map((attachment) => ({
					...attachment,
					url: urlMap.get(attachment.storageId) ?? undefined,
				})),
			};
		});

		return messagesWithUrls.map((msg) => ({
			_id: msg._id,
			clientMessageId: msg.clientMessageId,
			role: msg.role,
			content: msg.content,
			modelId: msg.modelId,
			provider: msg.provider,
			reasoningEffort: msg.reasoningEffort,
			webSearchEnabled: msg.webSearchEnabled,
			webSearchUsed: msg.webSearchUsed,
			webSearchCallCount: msg.webSearchCallCount,
			toolCallCount: msg.toolCallCount,
			maxSteps: msg.maxSteps,
			reasoning: msg.reasoning,
			thinkingTimeMs: msg.thinkingTimeMs,
			thinkingTimeSec: msg.thinkingTimeSec,
			reasoningCharCount: msg.reasoningCharCount,
			reasoningChunkCount: msg.reasoningChunkCount,
			reasoningTokenCount: msg.reasoningTokenCount,
			reasoningRequested: msg.reasoningRequested,
			toolInvocations: msg.toolInvocations,
			chainOfThoughtParts: msg.chainOfThoughtParts,
			status: msg.status,
			streamId: msg.streamId,
			attachments: msg.attachments,
			error: msg.error,
			messageType: msg.messageType,
			createdAt: msg.createdAt,
			deletedAt: msg.deletedAt,
			tokenUsage: msg.tokenUsage,
			tokensPerSecond: msg.tokensPerSecond,
			timeToFirstTokenMs: msg.timeToFirstTokenMs,
			totalDurationMs: msg.totalDurationMs,
		}));
	},
});

export const getFirstUserMessage = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) return null;

		const message = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted_role", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined).eq("role", "user"),
			)
			.order("asc")
			.first();

		return message?.content ?? null;
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
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) return null;

		const streamingMessage = await ctx.db
			.query("messages")
			.withIndex("by_chat_status", (q) =>
				q.eq("chatId", args.chatId)
					.eq("status", "streaming")
					.eq("deletedAt", undefined)
			)
			.first();

		return streamingMessage?.streamId ?? null;
	},
});
