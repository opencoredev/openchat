import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { chainOfThoughtPartValidator, streamOptionsValidator } from "./streamJobs";

export const getActiveStreamJob = query({
	args: {
		chatId: v.id("chats"),
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
		const jobs = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) =>
				q.eq("chatId", args.chatId).eq("status", "running")
			)
			.first();

		if (!jobs || jobs.userId !== userId) {
			const pending = await ctx.db
				.query("streamJobs")
				.withIndex("by_chat", (q) =>
					q.eq("chatId", args.chatId).eq("status", "pending")
				)
				.first();

			if (!pending || pending.userId !== userId) return null;

			return {
				_id: pending._id,
				status: pending.status,
				model: pending.model,
				provider: pending.provider,
				options: pending.options,
				content: pending.content,
				reasoning: pending.reasoning,
				chainOfThoughtParts: pending.chainOfThoughtParts,
				thinkingTimeMs: pending.thinkingTimeMs,
				thinkingTimeSec: pending.thinkingTimeSec,
				reasoningCharCount: pending.reasoningCharCount,
				reasoningChunkCount: pending.reasoningChunkCount,
				reasoningTokenCount: pending.reasoningTokenCount,
				reasoningRequested: pending.reasoningRequested,
				webSearchUsed: pending.webSearchUsed,
				webSearchCallCount: pending.webSearchCallCount,
				toolCallCount: pending.toolCallCount,
				error: pending.error,
				messageId: pending.messageId,
			};
		}

		return {
			_id: jobs._id,
			status: jobs.status,
			model: jobs.model,
			provider: jobs.provider,
			options: jobs.options,
			content: jobs.content,
			reasoning: jobs.reasoning,
			chainOfThoughtParts: jobs.chainOfThoughtParts,
			thinkingTimeMs: jobs.thinkingTimeMs,
			thinkingTimeSec: jobs.thinkingTimeSec,
			reasoningCharCount: jobs.reasoningCharCount,
			reasoningChunkCount: jobs.reasoningChunkCount,
			reasoningTokenCount: jobs.reasoningTokenCount,
			reasoningRequested: jobs.reasoningRequested,
			webSearchUsed: jobs.webSearchUsed,
			webSearchCallCount: jobs.webSearchCallCount,
			toolCallCount: jobs.toolCallCount,
			error: jobs.error,
			messageId: jobs.messageId,
		};
	},
});
