import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import { decrementStat, STAT_KEYS } from "./lib/dbStats";
import { components } from "./_generated/api";
import { requireAuthUserId, requireAuthUserIdFromAction } from "./lib/auth";

const MAX_DELETE_BATCH_LOOPS = 1_000;

type DeleteBatchResult = {
	deleted: number;
	hasMore: boolean;
};

const deleteUserStreamJobsRef =
	"users:deleteUserStreamJobs" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string; batchSize?: number },
		DeleteBatchResult
	>;

const deleteUserMessagesRef =
	"users:deleteUserMessages" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string; batchSize?: number },
		DeleteBatchResult
	>;

const deleteUserChatsRef =
	"users:deleteUserChats" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string; batchSize?: number },
		DeleteBatchResult
	>;

const deleteUserFilesRef =
	"users:deleteUserFiles" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string; batchSize?: number },
		DeleteBatchResult
	>;

const deleteUserChatReadStatusesRef =
	"users:deleteUserChatReadStatuses" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string },
		DeleteBatchResult
	>;

const deleteUserPromptTemplatesRef =
	"users:deleteUserPromptTemplates" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string },
		DeleteBatchResult
	>;

const deleteUserRecordRef =
	"users:deleteUserRecord" as unknown as FunctionReference<
		"mutation",
		"internal",
		{ userId: string; externalId: string },
		{ success: boolean }
	>;

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

		// chatReadStatuses and promptTemplates are now deleted in separate
		// workflow steps (delete-chat-read-statuses / delete-prompt-templates)
		// via deleteAccountWorkflowStep, ensuring each batch runs in its own
		// transaction and avoids hitting Convex per-transaction write limits.

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
				return await ctx.runMutation(deleteUserStreamJobsRef, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-messages":
				return await ctx.runMutation(deleteUserMessagesRef, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-chats":
				return await ctx.runMutation(deleteUserChatsRef, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-files":
				return await ctx.runMutation(deleteUserFilesRef, {
					userId,
					batchSize: args.batchSize,
				});
			case "delete-chat-read-statuses":
				return await ctx.runMutation(deleteUserChatReadStatusesRef, {
					userId,
				});
			case "delete-prompt-templates":
				return await ctx.runMutation(deleteUserPromptTemplatesRef, {
					userId,
				});
			case "delete-user": {
				const result: { success: boolean } = await ctx.runMutation(
					deleteUserRecordRef,
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

/**
 * @deprecated Use deleteAccountWorkflowStep (action) instead.
 * This mutation runs all deletes in a single transaction, which can hit
 * Convex per-transaction write limits for users with large amounts of data.
 * The workflow-based approach (deleteAccountWorkflowStep) isolates each
 * deletion step into its own transaction.
 */
export const deleteAccount = mutation({
	args: {
		userId: v.id("users"),
		externalId: v.string(),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const identity = await ctx.auth.getUserIdentity();
		if (!identity || identity.subject !== args.externalId) {
			throw new Error("User not found or unauthorized");
		}
		// Verify user exists and externalId matches (authorization check)
		const user = await ctx.db.get(userId);
		if (!user || user.externalId !== identity.subject) {
			throw new Error("User not found or unauthorized");
		}

		// 1. Delete Better Auth sessions (invalidates all user sessions across devices)
		// The externalId is the Better Auth user ID
		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "session",
				where: [{ field: "userId", operator: "eq", value: identity.subject }],
			},
			paginationOpts: { cursor: null, numItems: 1000 },
		});

		// 2. Delete Better Auth accounts (OAuth provider links)
		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "account",
				where: [{ field: "userId", operator: "eq", value: identity.subject }],
			},
			paginationOpts: { cursor: null, numItems: 100 },
		});

		// 3. Delete Better Auth user record
		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "user",
				where: [{ field: "_id", operator: "eq", value: identity.subject }],
			},
			paginationOpts: { cursor: null, numItems: 1 },
		});

		// 4. Delete streamJobs
		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(deleteUserStreamJobsRef, {
				userId,
			});
			if (!result.hasMore) break;
		}

		// 5. Delete chatReadStatus
		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(deleteUserChatReadStatusesRef, {
				userId,
			});
			if (!result.hasMore) break;
		}

		// 6. Delete fileUploads AND storage blobs
		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(deleteUserFilesRef, {
				userId,
			});
			if (!result.hasMore) break;
		}

		// 7. Delete messages (all messages for all user's chats)
		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(deleteUserMessagesRef, {
				userId,
			});
			if (!result.hasMore) break;
		}

		// 8. Delete chats
		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(deleteUserChatsRef, {
				userId,
			});
			if (!result.hasMore) break;
		}

		// 9. Delete promptTemplates
		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(deleteUserPromptTemplatesRef, {
				userId,
			});
			if (!result.hasMore) break;
		}

		// 10. Delete profile
		const profile = await ctx.db
			.query("profiles")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();
		if (profile) {
			await ctx.db.delete(profile._id);
		}

		// 11. Delete user record last
		await ctx.db.delete(userId);

		// 12. Update stats
		await decrementStat(ctx, STAT_KEYS.USERS_TOTAL);

		return { success: true };
	},
});
