import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const DELETE_BATCH_SIZE_DEFAULT = 100;
const DELETE_BATCH_SIZE_MAX = 500;

export function normalizeBatchSize(value?: number): number {
	if (!value || !Number.isFinite(value) || value <= 0) {
		return DELETE_BATCH_SIZE_DEFAULT;
	}
	return Math.min(Math.floor(value), DELETE_BATCH_SIZE_MAX);
}

export const deletionBatchResult = v.object({
	deleted: v.number(),
	hasMore: v.boolean(),
});

export const deleteUserStreamJobs = internalMutation({
	args: {
		userId: v.id("users"),
		batchSize: v.optional(v.number()),
	},
	returns: deletionBatchResult,
	handler: async (ctx, args) => {
		const batchSize = normalizeBatchSize(args.batchSize);
		const streamJobs = await ctx.db
			.query("streamJobs")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.take(batchSize);

		for (const job of streamJobs) {
			await ctx.db.delete(job._id);
		}

		return {
			deleted: streamJobs.length,
			hasMore: streamJobs.length === batchSize,
		};
	},
});

export const deleteUserMessages = internalMutation({
	args: {
		userId: v.id("users"),
		batchSize: v.optional(v.number()),
	},
	returns: deletionBatchResult,
	handler: async (ctx, args) => {
		const batchSize = normalizeBatchSize(args.batchSize);
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.take(batchSize);

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		return {
			deleted: messages.length,
			hasMore: messages.length === batchSize,
		};
	},
});

export const deleteUserChats = internalMutation({
	args: {
		userId: v.id("users"),
		batchSize: v.optional(v.number()),
	},
	returns: deletionBatchResult,
	handler: async (ctx, args) => {
		const batchSize = normalizeBatchSize(args.batchSize);
		const chats = await ctx.db
			.query("chats")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.take(batchSize);

		for (const chat of chats) {
			await ctx.db.delete(chat._id);
		}

		return {
			deleted: chats.length,
			hasMore: chats.length === batchSize,
		};
	},
});

export const deleteUserFiles = internalMutation({
	args: {
		userId: v.id("users"),
		batchSize: v.optional(v.number()),
	},
	returns: deletionBatchResult,
	handler: async (ctx, args) => {
		const batchSize = normalizeBatchSize(args.batchSize);
		const files = await ctx.db
			.query("fileUploads")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.take(batchSize);

		for (const file of files) {
			try {
				await ctx.storage.delete(file.storageId);
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				if (!message.toLowerCase().includes("not found")) {
					console.error("Unexpected error deleting storage file:", file.storageId, message);
				}
			}
			await ctx.db.delete(file._id);
		}

		return {
			deleted: files.length,
			hasMore: files.length === batchSize,
		};
	},
});

export const deleteUserChatReadStatuses = internalMutation({
	args: {
		userId: v.id("users"),
		batchSize: v.optional(v.number()),
	},
	returns: deletionBatchResult,
	handler: async (ctx, args) => {
		const batchSize = normalizeBatchSize(args.batchSize);
		const statuses = await ctx.db
			.query("chatReadStatus")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.take(batchSize);

		for (const status of statuses) {
			await ctx.db.delete(status._id);
		}

		return {
			deleted: statuses.length,
			hasMore: statuses.length === batchSize,
		};
	},
});

export const deleteUserPromptTemplates = internalMutation({
	args: {
		userId: v.id("users"),
		batchSize: v.optional(v.number()),
	},
	returns: deletionBatchResult,
	handler: async (ctx, args) => {
		const batchSize = normalizeBatchSize(args.batchSize);
		const templates = await ctx.db
			.query("promptTemplates")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.take(batchSize);

		for (const template of templates) {
			await ctx.db.delete(template._id);
		}

		return {
			deleted: templates.length,
			hasMore: templates.length === batchSize,
		};
	},
});
