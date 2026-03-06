import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import type { ChainOfThoughtPart } from "./streamUtils";
import { chainOfThoughtPartValidator } from "./streamContent";

export {
	chainOfThoughtPartValidator,
	updateStreamContent,
	completeStream,
	failStream,
} from "./streamContent";

export const streamOptionsValidator = v.object({
	enableReasoning: v.optional(v.boolean()),
	reasoningEffort: v.optional(v.string()),
	enableWebSearch: v.optional(v.boolean()),
	supportsToolCalls: v.optional(v.boolean()),
	maxSteps: v.optional(v.number()),
});

const streamJobOptionsReturnValidator = v.record(v.string(), v.any());

const executeStreamRef = "streamExecution:executeStream" as unknown as FunctionReference<
	"action",
	"internal",
	{ jobId: Id<"streamJobs"> },
	unknown
>;

const generateAndSetTitleRef =
	"chatTitle:generateAndSetTitleInternal" as unknown as FunctionReference<
		"action",
		"internal",
		{
			chatId: Id<"chats">;
			userId: Id<"users">;
			seedText: string;
			length: "short" | "standard" | "long";
			provider: "openrouter" | "osschat";
			force?: boolean;
		},
		unknown
	>;

function getLatestUserSeedText(messages: Array<{ role: string; content: string }>): string | null {
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

const streamJobReturnShape = v.union(
	v.object({
		_id: v.id("streamJobs"),
		status: v.string(),
		model: v.string(),
		provider: v.string(),
		options: v.optional(streamJobOptionsReturnValidator),
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

		const existingActiveStream = await ctx.db
			.query("streamJobs")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "running"))
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

		await ctx.scheduler.runAfter(0, executeStreamRef, { jobId });

		const shouldGenerateAutoTitle = (chat.title === "New Chat" || !chat.title) && (chat.messageCount ?? 0) <= 1;
		const seedText = shouldGenerateAutoTitle ? getLatestUserSeedText(args.messages) : null;
		if (seedText) {
			await ctx.scheduler.runAfter(0, generateAndSetTitleRef, {
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
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "running"))
			.first();

		if (!running || running.userId !== userId) {
			const pending = await ctx.db
				.query("streamJobs")
				.withIndex("by_chat", (q) => q.eq("chatId", args.chatId).eq("status", "pending"))
				.first();

			if (!pending || pending.userId !== userId) return null;
			return pickJobFields(pending);
		}

		return pickJobFields(running);
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
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
		const collectActiveJobs = async (status: "running" | "pending") => {
			const staleJobs = [];
			let total = 0;

			for await (const job of ctx.db
				.query("streamJobs")
				.withIndex("by_user_status_created", (q) =>
					q.eq("userId", userId).eq("status", status)
				)
				.order("asc")) {
				total++;
				if (job.createdAt < fiveMinutesAgo) {
					staleJobs.push(job);
				}
			}

			return { staleJobs, total };
		};
		const [runningJobs, pendingJobs] = await Promise.all([
			collectActiveJobs("running"),
			collectActiveJobs("pending"),
		]);
		const staleJobs = [...runningJobs.staleJobs, ...pendingJobs.staleJobs];
		let cleaned = 0;

		for (const job of staleJobs) {
			await ctx.db.patch(job._id, {
				status: "error",
				error: "Cleaned up stale job",
				completedAt: Date.now(),
			});
			cleaned++;
		}

		return {
			cleaned,
			total: runningJobs.total + pendingJobs.total,
		};
	},
});
