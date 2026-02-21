import type { Id } from "./_generated/dataModel";
import { assertOwnsChat } from "./chats";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { requireAuthUserId } from "./lib/auth";
import {
	toolInvocationValidator,
	chainOfThoughtPartValidator,
	errorValidator,
	messageTypeValidator,
} from "./message_validators";
import { insertOrUpdateMessage } from "./message_helpers";

export { list, getFirstUserMessage, getActiveStream } from "./message_queries";

export const send = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		userMessage: v.object({
			content: v.string(),
			createdAt: v.optional(v.number()),
			clientMessageId: v.optional(v.string()),
			attachments: v.optional(
				v.array(
					v.object({
						storageId: v.id("_storage"),
						filename: v.string(),
						contentType: v.string(),
						size: v.number(),
						url: v.optional(v.string()),
					})
				)
			),
		}),
		assistantMessage: v.optional(
			v.object({
				content: v.string(),
				createdAt: v.optional(v.number()),
				clientMessageId: v.optional(v.string()),
				modelId: v.optional(v.string()),
				provider: v.optional(v.string()),
				reasoningEffort: v.optional(v.string()),
				webSearchEnabled: v.optional(v.boolean()),
				webSearchUsed: v.optional(v.boolean()),
				webSearchCallCount: v.optional(v.number()),
				toolCallCount: v.optional(v.number()),
				maxSteps: v.optional(v.number()),
				reasoning: v.optional(v.string()),
				thinkingTimeMs: v.optional(v.number()),
				thinkingTimeSec: v.optional(v.number()),
				reasoningCharCount: v.optional(v.number()),
				reasoningChunkCount: v.optional(v.number()),
				reasoningTokenCount: v.optional(v.number()),
				reasoningRequested: v.optional(v.boolean()),
				toolInvocations: v.optional(v.array(toolInvocationValidator)),
				chainOfThoughtParts: v.optional(v.array(chainOfThoughtPartValidator)),
				error: v.optional(errorValidator),
				messageType: messageTypeValidator,
			}),
		),
	},
	returns: v.object({
		ok: v.boolean(),
		userMessageId: v.optional(v.id("messages")),
		assistantMessageId: v.optional(v.id("messages")),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "messageSend", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("messages sent", retryAfter);
		}

		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) {
			return { ok: false as const, userMessageId: undefined, assistantMessageId: undefined };
		}

		const userCreatedAt = args.userMessage.createdAt ?? Date.now();
		const userMessageId = await insertOrUpdateMessage(ctx, {
			chatId: args.chatId,
			role: "user",
			content: args.userMessage.content,
			createdAt: userCreatedAt,
			clientMessageId: args.userMessage.clientMessageId,
			status: "completed",
			userId,
			attachments: args.userMessage.attachments?.map(a => ({
				...a,
				uploadedAt: Date.now(),
			})),
		});

		let assistantMessageId: Id<"messages"> | null = null;
		const assistantCreatedAt =
			args.assistantMessage?.createdAt ?? userCreatedAt + 1;
		if (args.assistantMessage) {
			assistantMessageId = await insertOrUpdateMessage(ctx, {
				chatId: args.chatId,
				role: "assistant",
				content: args.assistantMessage.content,
				modelId: args.assistantMessage.modelId,
				provider: args.assistantMessage.provider,
				reasoningEffort: args.assistantMessage.reasoningEffort,
				webSearchEnabled: args.assistantMessage.webSearchEnabled,
				webSearchUsed: args.assistantMessage.webSearchUsed,
				webSearchCallCount: args.assistantMessage.webSearchCallCount,
				toolCallCount: args.assistantMessage.toolCallCount,
				maxSteps: args.assistantMessage.maxSteps,
				reasoning: args.assistantMessage.reasoning,
				thinkingTimeMs: args.assistantMessage.thinkingTimeMs,
				thinkingTimeSec: args.assistantMessage.thinkingTimeSec,
				reasoningCharCount: args.assistantMessage.reasoningCharCount,
				reasoningChunkCount: args.assistantMessage.reasoningChunkCount,
				reasoningTokenCount: args.assistantMessage.reasoningTokenCount,
				reasoningRequested: args.assistantMessage.reasoningRequested,
				toolInvocations: args.assistantMessage.toolInvocations,
				chainOfThoughtParts: args.assistantMessage.chainOfThoughtParts,
				createdAt: assistantCreatedAt,
				clientMessageId: args.assistantMessage.clientMessageId,
				status: "completed",
				userId,
				error: args.assistantMessage.error,
				messageType: args.assistantMessage.messageType,
			});
		}

		await ctx.db.patch(args.chatId, {
			updatedAt: assistantCreatedAt ?? userCreatedAt,
			lastMessageAt: assistantCreatedAt ?? userCreatedAt,
		});

		return {
			ok: true as const,
			userMessageId,
			assistantMessageId: assistantMessageId ?? undefined,
		};
	},
});

export const editAndRegenerate = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		messageId: v.id("messages"),
		newContent: v.string(),
	},
	returns: v.object({
		messageId: v.id("messages"),
		softDeletedCount: v.number(),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "messageSend", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("messages edited", retryAfter);
		}

		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) {
			throw new Error("Chat not found");
		}

		const newContent = args.newContent.trim();
		if (!newContent) {
			throw new Error("Message content cannot be empty");
		}

		const message = await ctx.db.get(args.messageId);
		if (!message || message.chatId !== args.chatId || message.role !== "user" || message.deletedAt) {
			throw new Error("Message not found or not a user message");
		}

		const now = Date.now();

		const activeStreams = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "running"))
			.collect();
		const pendingStreams = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "pending"))
			.collect();

		for (const stream of [...activeStreams, ...pendingStreams]) {
			await ctx.db.patch(stream._id, {
				status: "completed",
				completedAt: now,
			});
		}

		await ctx.db.patch(args.messageId, {
			content: newContent,
		});

		const messagesToDelete = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined)
			)
			.order("asc")
			.filter((q) => q.gt(q.field("createdAt"), message.createdAt))
			.collect();

		for (const msg of messagesToDelete) {
			await ctx.db.patch(msg._id, { deletedAt: now });
		}

		const softDeletedCount = messagesToDelete.length;
		const currentCount = chat.messageCount ?? 0;
		await ctx.db.patch(args.chatId, {
			messageCount: Math.max(0, currentCount - softDeletedCount),
			activeStreamId: undefined,
			status: "idle",
			updatedAt: now,
		});

		return { messageId: args.messageId, softDeletedCount };
	},
});

export const retryMessage = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		messageId: v.id("messages"),
	},
	returns: v.object({
		userContent: v.string(),
		softDeletedCount: v.number(),
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
			throwRateLimitError("messages retried", retryAfter);
		}

		const message = await ctx.db.get(args.messageId);
		if (
			!message ||
			message.chatId !== args.chatId ||
			message.role !== "user" ||
			message.deletedAt
		) {
			throw new Error("Message not found");
		}

		const now = Date.now();

		const activeStreams = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "running"))
			.collect();
		const pendingStreams = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "pending"))
			.collect();
		for (const stream of [...activeStreams, ...pendingStreams]) {
			await ctx.db.patch(stream._id, {
				status: "completed",
				completedAt: now,
			});
		}

		const allMessages = await ctx.db
			.query("messages")
			.withIndex("by_chat_not_deleted", (q) =>
				q.eq("chatId", args.chatId).eq("deletedAt", undefined)
			)
			.order("asc")
			.collect();

		let softDeletedCount = 0;
		for (const msg of allMessages) {
			if (msg.createdAt > message.createdAt) {
				await ctx.db.patch(msg._id, { deletedAt: now });
				softDeletedCount += 1;
			}
		}

		const currentCount = chat.messageCount ?? 0;
		await ctx.db.patch(args.chatId, {
			messageCount: Math.max(0, currentCount - softDeletedCount),
			activeStreamId: undefined,
			status: "idle",
			updatedAt: now,
		});

		return { userContent: message.content, softDeletedCount };
	},
});

export const streamUpsert = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		messageId: v.optional(v.id("messages")),
		clientMessageId: v.optional(v.string()),
		role: v.string(),
		content: v.string(),
		modelId: v.optional(v.string()),
		provider: v.optional(v.string()),
		reasoningEffort: v.optional(v.string()),
		webSearchEnabled: v.optional(v.boolean()),
		webSearchUsed: v.optional(v.boolean()),
		webSearchCallCount: v.optional(v.number()),
		toolCallCount: v.optional(v.number()),
		maxSteps: v.optional(v.number()),
		reasoning: v.optional(v.string()),
		thinkingTimeMs: v.optional(v.number()),
		thinkingTimeSec: v.optional(v.number()),
		reasoningCharCount: v.optional(v.number()),
		reasoningChunkCount: v.optional(v.number()),
		reasoningTokenCount: v.optional(v.number()),
		reasoningRequested: v.optional(v.boolean()),
		toolInvocations: v.optional(v.array(toolInvocationValidator)),
		chainOfThoughtParts: v.optional(v.array(chainOfThoughtPartValidator)),
		createdAt: v.optional(v.number()),
		status: v.optional(v.string()),
		attachments: v.optional(
			v.array(
				v.object({
					storageId: v.id("_storage"),
					filename: v.string(),
					contentType: v.string(),
					size: v.number(),
					uploadedAt: v.number(),
					url: v.optional(v.string()),
				})
			)
		),
	},
	returns: v.object({
		ok: v.boolean(),
		messageId: v.optional(v.id("messages")),
	}),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "messageStreamUpsert", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("stream updates", retryAfter);
		}

		const chat = await assertOwnsChat(ctx, args.chatId, userId);
		if (!chat) {
			return { ok: false as const, messageId: undefined };
		}
		const timestamp = args.createdAt ?? Date.now();
		const messageId = await insertOrUpdateMessage(ctx, {
			chatId: args.chatId,
			role: args.role,
			content: args.content,
			modelId: args.modelId,
			provider: args.provider,
			reasoningEffort: args.reasoningEffort,
			webSearchEnabled: args.webSearchEnabled,
			webSearchUsed: args.webSearchUsed,
			webSearchCallCount: args.webSearchCallCount,
			toolCallCount: args.toolCallCount,
			maxSteps: args.maxSteps,
			reasoning: args.reasoning,
			thinkingTimeMs: args.thinkingTimeMs,
			thinkingTimeSec: args.thinkingTimeSec,
			reasoningCharCount: args.reasoningCharCount,
			reasoningChunkCount: args.reasoningChunkCount,
			reasoningTokenCount: args.reasoningTokenCount,
			reasoningRequested: args.reasoningRequested,
			toolInvocations: args.toolInvocations,
			chainOfThoughtParts: args.chainOfThoughtParts,
			createdAt: timestamp,
			status: args.status ?? "streaming",
			clientMessageId: args.clientMessageId,
			overrideId: args.messageId ?? undefined,
			userId,
			attachments: args.attachments,
		});

		if (args.status === "completed" && (args.role === "assistant" || args.role === "user")) {
			const patchTimestamp = args.role === "assistant" ? Date.now() : timestamp;
			await ctx.db.patch(args.chatId, {
				lastMessageAt: patchTimestamp,
				updatedAt: patchTimestamp,
			});
		}

		return { ok: true as const, messageId };
	},
});
