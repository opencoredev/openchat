import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { chainOfThoughtPartValidator, streamOptionsValidator } from "./streamJobs";

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
	_id: any;
	status: string;
	model: string;
	provider: string;
	options?: any;
	content: string;
	reasoning?: string;
	chainOfThoughtParts?: any[];
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
	const rawOptions = job.options as Record<string, unknown> | undefined;
	const sanitizedOptions = rawOptions
		? {
				enableReasoning: rawOptions["enableReasoning"] as boolean | undefined,
				reasoningEffort: rawOptions["reasoningEffort"] as string | undefined,
				enableWebSearch: rawOptions["enableWebSearch"] as boolean | undefined,
				supportsToolCalls: rawOptions["supportsToolCalls"] as boolean | undefined,
				maxSteps: rawOptions["maxSteps"] as number | undefined,
			}
		: undefined;

	return {
		_id: job._id,
		status: job.status,
		model: job.model,
		provider: job.provider,
		options: sanitizedOptions,
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
