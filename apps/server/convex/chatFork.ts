import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { incrementStat, STAT_KEYS } from "./lib/dbStats";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { requireAuthUserId } from "./lib/auth";
import { assertOwnsChat } from "./chats";

const MAX_FORK_MESSAGE_COPY = 200;

export const fork = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		messageId: v.string(),
	},
	returns: v.object({
		newChatId: v.id("chats"),
		messagesCopied: v.number(),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) {
			throw new Error("Chat not found");
		}

		const { ok, retryAfter } = await rateLimiter.limit(ctx, "messageSend", {
			key: userId,
		});
		if (!ok) {
			throwRateLimitError("messages forked", retryAfter);
		}

		const allMessages = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined)
			)
			.order("asc")
			.collect();

		const forkIndex = allMessages.findIndex(
			(message) =>
				String(message._id) === args.messageId ||
				message.clientMessageId === args.messageId,
		);
		if (forkIndex === -1) {
			throw new Error("Fork point message not found");
		}

		const messagesToCopy = allMessages
			.slice(0, forkIndex + 1)
			.slice(-MAX_FORK_MESSAGE_COPY);

		const now = Date.now();
		const newChatId = await ctx.db.insert("chats", {
			userId,
			title: `Fork of ${chat.title}`,
			createdAt: now,
			updatedAt: now,
			lastMessageAt: now,
			messageCount: messagesToCopy.length,
			status: "idle",
			forkedFromChatId: args.chatId,
			forkedFromMessageId: args.messageId,
		});

		await Promise.all(
			messagesToCopy.map((message) =>
				ctx.db.insert("messages", {
					chatId: newChatId,
					clientMessageId: message.clientMessageId,
					role: message.role,
					content: message.content,
					modelId: message.modelId,
					provider: message.provider,
					reasoningEffort: message.reasoningEffort,
					webSearchEnabled: message.webSearchEnabled,
					webSearchUsed: message.webSearchUsed,
					webSearchCallCount: message.webSearchCallCount,
					toolCallCount: message.toolCallCount,
					maxSteps: message.maxSteps,
					reasoning: message.reasoning,
					thinkingTimeMs: message.thinkingTimeMs,
					thinkingTimeSec: message.thinkingTimeSec,
					reasoningCharCount: message.reasoningCharCount,
					reasoningChunkCount: message.reasoningChunkCount,
					reasoningTokenCount: message.reasoningTokenCount,
					reasoningRequested: message.reasoningRequested,
					toolInvocations: message.toolInvocations,
					chainOfThoughtParts: message.chainOfThoughtParts,
					tokenUsage: message.tokenUsage,
					tokensPerSecond: message.tokensPerSecond,
					timeToFirstTokenMs: message.timeToFirstTokenMs,
					totalDurationMs: message.totalDurationMs,
					attachments: message.attachments,
					error: message.error,
					messageType: message.messageType,
					createdAt: message.createdAt,
					status: "completed",
					userId: message.userId,
				})
			)
		);

		await incrementStat(ctx, STAT_KEYS.CHATS_TOTAL, 1);
		await incrementStat(ctx, STAT_KEYS.MESSAGES_TOTAL, messagesToCopy.length);

		return {
			newChatId,
			messagesCopied: messagesToCopy.length,
		};
	},
});
