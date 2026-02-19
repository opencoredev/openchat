/**
 * Barrel module — re-exports from focused user modules for backward compatibility.
 *
 * All `api.users.*` and `internal.users.*` references across the codebase
 * continue to work without changes.
 *
 * Focused modules:
 *   userAuth.ts    — ensure, getCurrentAuthUser, getByExternalId, getById
 *   userProfile.ts — updateName, getFavoriteModels, toggleFavoriteModel, setFavoriteModels
 *   userApiKeys.ts — saveOpenRouterKey, getOpenRouterKey, hasOpenRouterKey, removeOpenRouterKey
 */

// ── Auth (user sync, lookup) ────────────────────────────────────────────────
export {
	ensure,
	getCurrentAuthUser,
	getByExternalId,
	getByExternalIdInternal,
	getById,
} from "./userAuth";

// ── Profile ─────────────────────────────────────────────────────────────────
export {
	updateName,
	getFavoriteModels,
	toggleFavoriteModel,
	setFavoriteModels,
} from "./userProfile";

// ── API Keys ────────────────────────────────────────────────────────────────
export {
	saveOpenRouterKey,
	getOpenRouterKey,
	hasOpenRouterKey,
	getOpenRouterKeyInternal,
	removeOpenRouterKey,
} from "./userApiKeys";

// ── Billing / AI usage (kept here — referenced as internal.users.*) ─────────
import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { decrementStat, STAT_KEYS } from "./lib/dbStats";
import { components, internal } from "./_generated/api";
import { requireAuthUserId, requireAuthUserIdFromAction } from "./lib/auth";
import { DAILY_AI_LIMIT_CENTS, getCurrentDateKey } from "./lib/billingUtils";
import { createLogger } from "./lib/logger";

const logger = createLogger("users");

const MAX_SINGLE_REQUEST_CENTS = DAILY_AI_LIMIT_CENTS * 10; // 100¢ = $1

export const incrementAiUsage = internalMutation({
	args: {
		userId: v.id("users"),
		usageCents: v.number(),
	},
	returns: v.object({
		usedCents: v.number(),
		remainingCents: v.number(),
		overLimit: v.boolean(),
	}),
	handler: async (ctx, args) => {
		if (args.usageCents <= 0) {
			return {
				usedCents: 0,
				remainingCents: DAILY_AI_LIMIT_CENTS,
				overLimit: false,
			};
		}

		if (args.usageCents > MAX_SINGLE_REQUEST_CENTS) {
		void logger.error(
			`[Usage] Rejected suspiciously high usage: ${args.usageCents}¢`,
			undefined,
			{ userId: args.userId, usageCents: args.usageCents },
		);
			return {
				usedCents: 0,
				remainingCents: DAILY_AI_LIMIT_CENTS,
				overLimit: false,
			};
		}

		const user = await ctx.db.get(args.userId);
		if (!user) {
		void logger.warn(
			`[Usage] User not found for usage recording, usage: ${args.usageCents}¢`,
			{ userId: args.userId, usageCents: args.usageCents },
		);
			return {
				usedCents: 0,
				remainingCents: DAILY_AI_LIMIT_CENTS,
				overLimit: false,
			};
		}

		const currentDate = getCurrentDateKey();
		const previousCents =
			user.aiUsageDate === currentDate ? (user.aiUsageCents ?? 0) : 0;

		const alreadyOverLimit = previousCents >= DAILY_AI_LIMIT_CENTS;

		const nextCents = Math.max(0, previousCents + args.usageCents);

		await ctx.db.patch(args.userId, {
			aiUsageCents: nextCents,
			aiUsageDate: currentDate,
			updatedAt: Date.now(),
		});

		return {
			usedCents: nextCents,
			remainingCents: Math.max(0, DAILY_AI_LIMIT_CENTS - nextCents),
			overLimit: alreadyOverLimit,
		};
	},
});

// ── Account deletion ────────────────────────────────────────────────────────

const DELETE_BATCH_SIZE_DEFAULT = 100;
const DELETE_BATCH_SIZE_MAX = 500;

function normalizeBatchSize(value?: number): number {
	if (!value || !Number.isFinite(value) || value <= 0) {
		return DELETE_BATCH_SIZE_DEFAULT;
	}
	return Math.min(Math.floor(value), DELETE_BATCH_SIZE_MAX);
}

const deletionBatchResult = v.object({
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
					void logger.error("Unexpected error deleting storage file", e, { storageId: file.storageId, errorMessage: message });
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

export const deleteUserRecord = internalMutation({
	args: {
		userId: v.id("users"),
		externalId: v.string(),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user || user.externalId !== args.externalId) {
			return { success: false };
		}

		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "session",
				where: [{ field: "userId", operator: "eq", value: args.externalId }],
			},
			paginationOpts: { cursor: null, numItems: 1000 },
		});

		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "account",
				where: [{ field: "userId", operator: "eq", value: args.externalId }],
			},
			paginationOpts: { cursor: null, numItems: 100 },
		});

		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "user",
				where: [{ field: "_id", operator: "eq", value: args.externalId }],
			},
			paginationOpts: { cursor: null, numItems: 1 },
		});

		const profile = await ctx.db
			.query("profiles")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.unique();
		if (profile) {
			await ctx.db.delete(profile._id);
		}

		await ctx.db.delete(args.userId);
		await decrementStat(ctx, STAT_KEYS.USERS_TOTAL);

		return { success: true };
	},
});

export const deleteAccountWorkflowStep = action({
	args: {
		userId: v.id("users"),
		externalId: v.string(),
		step: v.union(
			v.literal("delete-stream-jobs"),
			v.literal("delete-messages"),
			v.literal("delete-chats"),
			v.literal("delete-files"),
			v.literal("delete-chat-read-statuses"),
			v.literal("delete-prompt-templates"),
			v.literal("delete-user"),
		),
		batchSize: v.optional(v.number()),
	},
	returns: v.object({
		deleted: v.number(),
		hasMore: v.boolean(),
		success: v.optional(v.boolean()),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{ deleted: number; hasMore: boolean; success?: boolean }> => {
		const userId = await requireAuthUserIdFromAction(ctx, args.userId);

		switch (args.step) {
			case "delete-stream-jobs":
				return await ctx.runMutation(internal.users.deleteUserStreamJobs, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-messages":
				return await ctx.runMutation(internal.users.deleteUserMessages, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-chats":
				return await ctx.runMutation(internal.users.deleteUserChats, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-files":
				return await ctx.runMutation(internal.users.deleteUserFiles, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-chat-read-statuses":
				return await ctx.runMutation(internal.users.deleteUserChatReadStatuses, {
					userId,
				});
			case "delete-prompt-templates":
				return await ctx.runMutation(internal.users.deleteUserPromptTemplates, {
					userId,
				});
			case "delete-user": {
				const result: { success: boolean } = await ctx.runMutation(
					internal.users.deleteUserRecord,
					{
						userId,
						externalId: args.externalId,
					},
				);
				return {
					deleted: result.success ? 1 : 0,
					hasMore: false,
					success: result.success,
				};
			}
		}
	},
});

export { deleteAccount } from "./userDeletion";
