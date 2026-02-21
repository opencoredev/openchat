import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { isWebSearchToolName } from "./streamUtils";

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
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) return;

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

export const getJobInternal = internalQuery({
	args: {
		jobId: v.id("streamJobs"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.jobId);
	},
});

export const getPersistedDailyUsageForDateInternal = internalQuery({
	args: {
		userId: v.id("users"),
		dateKey: v.string(),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user || user.aiUsageDate !== args.dateKey) {
			return 0;
		}
		return user.aiUsageCents ?? 0;
	},
});

export const cleanupStaleJobs = mutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const staleJobs = await ctx.db
			.query("streamJobs")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.filter((q) =>
				q.or(
					q.eq(q.field("status"), "running"),
					q.eq(q.field("status"), "pending")
				)
			)
			.collect();

		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
		let cleaned = 0;

		for (const job of staleJobs) {
			if (job.createdAt < fiveMinutesAgo) {
				const now = Date.now();
				await ctx.db.patch(job._id, {
					status: "error",
					error: "Cleaned up stale job",
					completedAt: now,
				});
				await ctx.db.patch(job.chatId, {
					activeStreamId: undefined,
					status: "idle",
					updatedAt: now,
				});
				cleaned++;
			}
		}

		return { cleaned, total: staleJobs.length };
	},
});
