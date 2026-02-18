import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { chainOfThoughtPartValidator } from "./streamJobs";

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

		if (args.reasoning !== undefined) {
			updates.reasoning = args.reasoning;
		}
		if (args.chainOfThoughtParts !== undefined) {
			updates.chainOfThoughtParts = args.chainOfThoughtParts;
		}
		if (args.thinkingTimeMs !== undefined) {
			updates.thinkingTimeMs = args.thinkingTimeMs;
		}
		if (args.thinkingTimeSec !== undefined) {
			updates.thinkingTimeSec = args.thinkingTimeSec;
		}
		if (args.reasoningCharCount !== undefined) {
			updates.reasoningCharCount = args.reasoningCharCount;
		}
		if (args.reasoningChunkCount !== undefined) {
			updates.reasoningChunkCount = args.reasoningChunkCount;
		}
		if (args.reasoningTokenCount !== undefined) {
			updates.reasoningTokenCount = args.reasoningTokenCount;
		}
		if (args.reasoningRequested !== undefined) {
			updates.reasoningRequested = args.reasoningRequested;
		}
		if (args.webSearchUsed !== undefined) {
			updates.webSearchUsed = args.webSearchUsed;
		}
		if (args.webSearchCallCount !== undefined) {
			updates.webSearchCallCount = args.webSearchCallCount;
		}
		if (args.toolCallCount !== undefined) {
			updates.toolCallCount = args.toolCallCount;
		}
		if (args.status !== undefined) {
			updates.status = args.status;
			if (args.status === "running" && !job.startedAt) {
				updates.startedAt = Date.now();
			}
			if (args.status === "completed" || args.status === "error") {
				updates.completedAt = Date.now();
			}
		}
		if (args.error !== undefined) {
			updates.error = args.error;
		}

		await ctx.db.patch(args.jobId, updates);
	},
});
