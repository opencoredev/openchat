import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { chainOfThoughtPartValidator, streamOptionsValidator } from "./streamJobs";
import type { ChainOfThoughtPart } from "./streamUtils";

const streamJobReturnShape = v.union(
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
);

function pickJobFields(job: {
	_id: Id<"streamJobs">;
	status: string;
	model: string;
	provider: string;
	options?: Record<string, unknown>;
	content: string;
	reasoning?: string;
	chainOfThoughtParts?: ChainOfThoughtPart[];
	thinkingTimeMs?: number;
	thinkingTimeSec?: number;
	reasoningCharCount?: number;
	reasoningChunkCount?: number;
	reasoningTokenCount?: number;
	reasoningRequested?: boolean;
	webSearchUsed?: boolean;
	webSearchCallCount?: number;
	toolCallCount?: number;
	error?: string;
	messageId: string;
}) {
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
}

export const getStreamJob = query({
	args: {
		jobId: v.id("streamJobs"),
		userId: v.id("users"),
	},
	returns: streamJobReturnShape,
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.userId !== userId) return null;
		return pickJobFields(job);
	},
});

export const getActiveStreamJob = query({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
	},
	returns: streamJobReturnShape,
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const running = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) =>
				q.eq("chatId", args.chatId).eq("status", "running")
			)
			.first();

		if (!running || running.userId !== userId) {
			const pending = await ctx.db
				.query("streamJobs")
				.withIndex("by_chat", (q) =>
					q.eq("chatId", args.chatId).eq("status", "pending")
				)
				.first();

			if (!pending || pending.userId !== userId) return null;
			return pickJobFields(pending);
		}

		return pickJobFields(running);
	},
});
