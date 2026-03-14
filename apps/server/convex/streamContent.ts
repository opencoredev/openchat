import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { chainOfThoughtPartValidator } from "./message_validators";
import { insertOrUpdateMessage } from "./message_helpers";
import { isWebSearchToolName } from "./streamUtils";

export { chainOfThoughtPartValidator } from "./message_validators";

function classifyStreamError(
	error: string,
	provider: string,
): {
	code: string;
	message: string;
	details?: string;
	provider?: string;
	retryable?: boolean;
} {
	const lower = error.toLowerCase();
	const normalizedProvider = provider === "osschat" ? "osschat" : "openrouter";

	if (lower.includes("insufficient credits")) {
		return {
			code: "model_error",
			message: error,
			provider: normalizedProvider,
			retryable: false,
		};
	}

	if (
		lower.includes("settings/privacy") ||
		lower.includes("guardrail restrictions") ||
		lower.includes("data policy")
	) {
		return {
			code: "auth_error",
			message: error,
			provider: normalizedProvider,
			retryable: false,
		};
	}

	if (lower.includes("rate limit")) {
		return {
			code: "rate_limit",
			message: error,
			provider: normalizedProvider,
			retryable: true,
		};
	}

	if (lower.includes("authentication") || lower.includes("unauthorized") || lower.includes("api key")) {
		return {
			code: "auth_error",
			message: error,
			provider: normalizedProvider,
			retryable: false,
		};
	}

	if (lower.includes("network") || lower.includes("connection") || lower.includes("temporarily unavailable")) {
		return {
			code: "network_error",
			message: error,
			provider: normalizedProvider,
			retryable: true,
		};
	}

	return {
		code: "model_error",
		message: error,
		provider: normalizedProvider,
		retryable: false,
	};
}

export const updateStreamContent = internalMutation({
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
		status: v.optional(v.union(
			v.literal("pending"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("error")
		)),
		error: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return null;

		const updates: Record<string, unknown> = {
			content: args.content,
		};

		if (args.reasoning !== undefined) updates.reasoning = args.reasoning;
		if (args.chainOfThoughtParts !== undefined) updates.chainOfThoughtParts = args.chainOfThoughtParts;
		if (args.thinkingTimeMs !== undefined) updates.thinkingTimeMs = args.thinkingTimeMs;
		if (args.thinkingTimeSec !== undefined) updates.thinkingTimeSec = args.thinkingTimeSec;
		if (args.reasoningCharCount !== undefined) updates.reasoningCharCount = args.reasoningCharCount;
		if (args.reasoningChunkCount !== undefined) updates.reasoningChunkCount = args.reasoningChunkCount;
		if (args.reasoningTokenCount !== undefined) updates.reasoningTokenCount = args.reasoningTokenCount;
		if (args.reasoningRequested !== undefined) updates.reasoningRequested = args.reasoningRequested;
		if (args.webSearchUsed !== undefined) updates.webSearchUsed = args.webSearchUsed;
		if (args.webSearchCallCount !== undefined) updates.webSearchCallCount = args.webSearchCallCount;
		if (args.toolCallCount !== undefined) updates.toolCallCount = args.toolCallCount;
		if (args.status !== undefined) {
			updates.status = args.status;
			if (args.status === "running" && !job.startedAt) {
				updates.startedAt = Date.now();
			}
			if (args.status === "completed" || args.status === "error") {
				updates.completedAt = Date.now();
			}
		}
		if (args.error !== undefined) updates.error = args.error;

		await ctx.db.patch(args.jobId, updates);
		return null;
	},
});

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
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return null;

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
		return null;
	},
});

export const failStream = internalMutation({
	args: {
		jobId: v.id("streamJobs"),
		error: v.string(),
		partialContent: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return null;

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

		await insertOrUpdateMessage(ctx, {
			chatId: job.chatId,
			clientMessageId: job.messageId,
			role: "assistant",
			content: args.partialContent || job.content || "",
			modelId: job.model,
			provider: job.provider,
			createdAt: Date.now(),
			status: "error",
			userId: job.userId,
			messageType: "error",
			error: classifyStreamError(args.error, job.provider),
		});
		return null;
	},
});
