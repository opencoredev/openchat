import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { streamOptionsValidator } from "./streamJobs";
import { requireAuthUserId } from "./lib/auth";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";

export {
	updateStreamContent,
	completeStream,
	failStream,
	getJobInternal,
	getPersistedDailyUsageForDateInternal,
	cleanupStaleJobs,
} from "./streamJobs";

export { getStreamJob, getActiveStreamJob, getActiveCompareStreamJobs } from "./streamQueries";
export { executeStream } from "./streamExecution";

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

/**
 * Start multiple parallel streams for model comparison.
 * Each model gets its own stream job, grouped by a shared compareGroup ID.
 * The chat status is set to "streaming" and only reset when ALL jobs complete.
 */
export const startCompareStreams = mutation({
	args: {
		chatId: v.id("chats"),
		userId: v.id("users"),
		models: v.array(v.object({
			messageId: v.string(),
			model: v.string(),
			provider: v.string(),
		})),
		messages: v.array(v.object({
			role: v.string(),
			content: v.string(),
		})),
		options: v.optional(streamOptionsValidator),
		compareGroup: v.string(),
	},
	returns: v.array(v.id("streamJobs")),
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

		const hasOsschatProvider = args.models.some((m) => m.provider === "osschat");
		if (hasOsschatProvider) {
			const user = await ctx.db.get(userId);
			if (!user) {
				throw new Error("User not found");
			}
		}

		// Clean up any existing active streams
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
		}

		const jobIds = [];

		for (const modelConfig of args.models) {
			const jobId = await ctx.db.insert("streamJobs", {
				chatId: args.chatId,
				userId,
				messageId: modelConfig.messageId,
				status: "pending",
				model: modelConfig.model,
				provider: modelConfig.provider,
				messages: args.messages,
				options: args.options,
				content: "",
				createdAt: Date.now(),
				compareGroup: args.compareGroup,
			});
			jobIds.push(jobId);
		}

		// Set chat to streaming with the compare group as the active stream identifier
		await ctx.db.patch(args.chatId, {
			activeStreamId: `compare-${args.compareGroup}`,
			status: "streaming",
			updatedAt: Date.now(),
		});

		// Schedule execution for each job
		for (const jobId of jobIds) {
			await ctx.scheduler.runAfter(0, internal.backgroundStream.executeStream, {
				jobId,
			});
		}

		// Generate auto-title if needed
		const shouldGenerateAutoTitle =
			(chat.title === "New Chat" || !chat.title) &&
			(chat.messageCount ?? 0) <= 1;
		const seedText = shouldGenerateAutoTitle ? getLatestUserSeedText(args.messages) : null;
		if (seedText) {
			const firstProvider = args.models[0]?.provider ?? "osschat";
			await ctx.scheduler.runAfter(0, internal.chatTitle.generateAndSetTitleInternal, {
				chatId: args.chatId,
				userId,
				seedText,
				length: "standard",
				provider: firstProvider === "openrouter" ? "openrouter" : "osschat",
				force: false,
			});
		}

		return jobIds;
	},
});
