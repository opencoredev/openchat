import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuthUserId } from "./lib/auth";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";

// ---------------------------------------------------------------------------
// Shared validators & types (re-exported for sibling modules)
// ---------------------------------------------------------------------------

export const chainOfThoughtPartValidator = v.object({
	type: v.union(v.literal("reasoning"), v.literal("tool")),
	index: v.number(),
	text: v.optional(v.string()),
	toolName: v.optional(v.string()),
	toolCallId: v.optional(v.string()),
	state: v.optional(v.string()),
	input: v.optional(v.any()),
	output: v.optional(v.any()),
	errorText: v.optional(v.string()),
});

export const streamOptionsValidator = v.object({
	enableReasoning: v.optional(v.boolean()),
	reasoningEffort: v.optional(v.string()),
	enableWebSearch: v.optional(v.boolean()),
	supportsToolCalls: v.optional(v.boolean()),
	maxSteps: v.optional(v.number()),
});

export type ChainOfThoughtPart = {
	type: "reasoning" | "tool";
	index: number;
	text?: string;
	toolName?: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function isWebSearchToolName(toolName: string | undefined): boolean {
	if (!toolName) return false;
	const normalized = toolName.toLowerCase();
	return normalized === "websearch" || normalized === "web_search";
}

function getLatestUserSeedText(
	messages: Array<{ role: string; content: string }>,
): string | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "user") continue;
		const normalized = message.content.trim().slice(0, 300);
		if (normalized.length > 0) {
			return normalized;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// startStream
// ---------------------------------------------------------------------------

export const startStream = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		messageId: v.string(),
		model: v.string(),
		provider: v.string(),
		messages: v.array(v.object({
			role: v.string(),
			content: v.string(),
		})),
		options: v.optional(streamOptionsValidator),
	},
	returns: v.id("streamJobs"),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "messageSend", {
			key: userId,
		});
		if (!ok) {
			throwRateLimitError("streams started", retryAfter);
		}

		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.userId !== userId) {
			throw new Error("Chat not found or unauthorized");
		}

		if (args.provider === "osschat") {
			const user = await ctx.db.get(userId);
			if (!user) {
				throw new Error("User not found");
			}
		}

		const existingActiveStream = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) =>
				q.eq("chatId", args.chatId).eq("status", "running")
			)
			.first();

		if (existingActiveStream) {
			const STREAM_STALE_MS = 2 * 60 * 1000;
			const isStale = Date.now() - existingActiveStream.createdAt > STREAM_STALE_MS;
			if (!isStale) {
				throw new Error("Stream already in progress for this chat");
			}
			await ctx.db.patch(existingActiveStream._id, {
				status: "error",
				error: "Auto-cleaned stale running stream",
				completedAt: Date.now(),
			});
			await ctx.db.patch(args.chatId, {
				activeStreamId: undefined,
				status: "idle",
				updatedAt: Date.now(),
			});
		}

		const jobId = await ctx.db.insert("streamJobs", {
			chatId: args.chatId,
			userId,
			messageId: args.messageId,
			status: "pending",
			model: args.model,
			provider: args.provider,
			messages: args.messages,
			options: args.options,
			content: "",
			createdAt: Date.now(),
		});

		await ctx.db.patch(args.chatId, {
			activeStreamId: `job-${jobId}`,
			status: "streaming",
			updatedAt: Date.now(),
		});

		await ctx.scheduler.runAfter(0, internal.backgroundStream.executeStream, {
			jobId,
		});

		const shouldGenerateAutoTitle =
			(chat.title === "New Chat" || !chat.title) &&
			(chat.messageCount ?? 0) <= 1;
		const seedText = shouldGenerateAutoTitle ? getLatestUserSeedText(args.messages) : null;
		if (seedText) {
			await ctx.scheduler.runAfter(0, internal.chatTitle.generateAndSetTitleInternal, {
				chatId: args.chatId,
				userId,
				seedText,
				length: "standard",
				provider: args.provider === "openrouter" ? "openrouter" : "osschat",
				force: false,
			});
		}

		return jobId;
	},
});

// ---------------------------------------------------------------------------
// getStreamJob
// ---------------------------------------------------------------------------

export const getStreamJob = query({
	args: {
		jobId: v.id("streamJobs"),
		userId: v.id("users"),
	},
	returns: v.union(
		v.object({
			_id: v.id("streamJobs"),
			status: v.string(),
			model: v.string(),
			provider: v.string(),
			options: v.optional(streamOptionsValidator),
			content: v.string(),
			reasoning: v.optional(v.string()),
			chainOfThoughtParts: v.optional(v.array(chainOfThoughtPartValidator)),
			thinkingTimeMs: v.optional(v.number()),
			thinkingTimeSec: v.optional(v.number()),
				reasoningCharCount: v.optional(v.number()),
				reasoningChunkCount: v.optional(v.number()),
				reasoningTokenCount: v.optional(v.number()),
				reasoningRequested: v.optional(v.boolean()),
			webSearchUsed: v.optional(v.boolean()),
			webSearchCallCount: v.optional(v.number()),
			toolCallCount: v.optional(v.number()),
			error: v.optional(v.string()),
			messageId: v.string(),
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.userId !== userId) return null;

		return {
			_id: job._id,
			status: job.status,
			model: job.model,
			provider: job.provider,
			options: job.options,
			content: job.content,
			reasoning: job.reasoning,
			chainOfThoughtParts: job.chainOfThoughtParts,
			thinkingTimeMs: job.thinkingTimeMs,
			thinkingTimeSec: job.thinkingTimeSec,
				reasoningCharCount: job.reasoningCharCount,
				reasoningChunkCount: job.reasoningChunkCount,
				reasoningTokenCount: job.reasoningTokenCount,
				reasoningRequested: job.reasoningRequested,
			webSearchUsed: job.webSearchUsed,
			webSearchCallCount: job.webSearchCallCount,
			toolCallCount: job.toolCallCount,
			error: job.error,
			messageId: job.messageId,
		};
	},
});

export { getActiveStreamJob } from "./streamQueries";

// ---------------------------------------------------------------------------
// completeStream
// ---------------------------------------------------------------------------

export const completeStream = internalMutation({
	args: {
		jobId: v.id("streamJobs"),
		content: v.string(),
		reasoning: v.optional(v.string()),
		chainOfThoughtParts: v.optional(v.array(chainOfThoughtPartValidator)),
		thinkingTimeMs: v.optional(v.number()),
		thinkingTimeSec: v.optional(v.number()),
			reasoningCharCount: v.optional(v.number()),
			reasoningChunkCount: v.optional(v.number()),
			reasoningTokenCount: v.optional(v.number()),
			reasoningRequested: v.optional(v.boolean()),
		webSearchUsed: v.optional(v.boolean()),
		webSearchCallCount: v.optional(v.number()),
		toolCallCount: v.optional(v.number()),
		tokensPerSecond: v.optional(v.number()),
		timeToFirstTokenMs: v.optional(v.number()),
		totalDurationMs: v.optional(v.number()),
		tokenUsage: v.optional(v.object({
			promptTokens: v.number(),
			completionTokens: v.number(),
			totalTokens: v.number(),
		})),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return;

		const derivedToolParts = (args.chainOfThoughtParts ?? []).filter(
			(part) => part.type === "tool",
		);
		const derivedWebSearchCallCount = derivedToolParts.filter((part) =>
			isWebSearchToolName(part.toolName),
		).length;
		const toolCallCount = args.toolCallCount ?? derivedToolParts.length;
		const webSearchCallCount = args.webSearchCallCount ?? derivedWebSearchCallCount;
		const webSearchUsed = args.webSearchUsed ?? webSearchCallCount > 0;
		const reasoningEffort = job.options?.reasoningEffort;
		const webSearchEnabled = Boolean(job.options?.enableWebSearch);
		const maxSteps = job.options?.maxSteps;

		await ctx.db.patch(args.jobId, {
			status: "completed",
			content: args.content,
			reasoning: args.reasoning,
			chainOfThoughtParts: args.chainOfThoughtParts,
			thinkingTimeMs: args.thinkingTimeMs,
			thinkingTimeSec: args.thinkingTimeSec,
			reasoningCharCount: args.reasoningCharCount,
			reasoningChunkCount: args.reasoningChunkCount,
			reasoningTokenCount: args.reasoningTokenCount,
			reasoningRequested: args.reasoningRequested,
			webSearchUsed,
			webSearchCallCount,
			toolCallCount,
			completedAt: Date.now(),
		});

		await ctx.db.patch(job.chatId, {
			activeStreamId: undefined,
			status: "idle",
			updatedAt: Date.now(),
		});

		const existingMessage = await ctx.db
			.query("messages")
			.withIndex("by_client_id", (q) =>
				q.eq("chatId", job.chatId).eq("clientMessageId", job.messageId)
			)
			.first();

		if (!existingMessage) {
			await ctx.db.insert("messages", {
				chatId: job.chatId,
				clientMessageId: job.messageId,
				role: "assistant",
				content: args.content,
				modelId: job.model,
				provider: job.provider,
				reasoningEffort,
				webSearchEnabled,
				webSearchUsed,
				webSearchCallCount,
				toolCallCount,
				maxSteps,
				reasoning: args.reasoning,
				thinkingTimeMs: args.thinkingTimeMs,
				thinkingTimeSec: args.thinkingTimeSec,
					reasoningCharCount: args.reasoningCharCount,
					reasoningChunkCount: args.reasoningChunkCount,
					reasoningTokenCount: args.reasoningTokenCount,
					reasoningRequested: args.reasoningRequested,
				chainOfThoughtParts: args.chainOfThoughtParts,
				tokensPerSecond: args.tokensPerSecond,
				timeToFirstTokenMs: args.timeToFirstTokenMs,
				totalDurationMs: args.totalDurationMs,
				tokenUsage: args.tokenUsage,
				messageMetadata: {
					modelId: job.model,
					provider: job.provider,
					reasoningEffort,
					maxSteps,
					webSearchEnabled,
				},
				status: "completed",
				userId: job.userId,
				createdAt: Date.now(),
			});
		} else {
			await ctx.db.patch(existingMessage._id, {
				content: args.content,
				modelId: job.model,
				provider: job.provider,
				reasoningEffort,
				webSearchEnabled,
				webSearchUsed,
				webSearchCallCount,
				toolCallCount,
				maxSteps,
				reasoning: args.reasoning,
				thinkingTimeMs: args.thinkingTimeMs,
				thinkingTimeSec: args.thinkingTimeSec,
					reasoningCharCount: args.reasoningCharCount,
					reasoningChunkCount: args.reasoningChunkCount,
					reasoningTokenCount: args.reasoningTokenCount,
					reasoningRequested: args.reasoningRequested,
				chainOfThoughtParts: args.chainOfThoughtParts,
				tokensPerSecond: args.tokensPerSecond,
				timeToFirstTokenMs: args.timeToFirstTokenMs,
				totalDurationMs: args.totalDurationMs,
				tokenUsage: args.tokenUsage,
				messageMetadata: {
					modelId: job.model,
					provider: job.provider,
					reasoningEffort,
					maxSteps,
					webSearchEnabled,
				},
				status: "completed",
			});
		}
	},
});

// ---------------------------------------------------------------------------
// failStream
// ---------------------------------------------------------------------------

export const failStream = internalMutation({
	args: {
		jobId: v.id("streamJobs"),
		error: v.string(),
		partialContent: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return;

		await ctx.db.patch(args.jobId, {
			status: "error",
			error: args.error,
			content: args.partialContent || job.content,
			completedAt: Date.now(),
		});

		await ctx.db.patch(job.chatId, {
			activeStreamId: undefined,
			status: "idle",
			updatedAt: Date.now(),
		});
	},
});

// ---------------------------------------------------------------------------
// getJobInternal
// ---------------------------------------------------------------------------

export const getJobInternal = internalQuery({
	args: {
		jobId: v.id("streamJobs"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.jobId);
	},
});

export { getPersistedDailyUsageForDateInternal, cleanupStaleJobs } from "./streamMaintenance";
