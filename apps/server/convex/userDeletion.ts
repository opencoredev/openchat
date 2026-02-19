import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { decrementStat, STAT_KEYS } from "./lib/dbStats";
import { components, internal } from "./_generated/api";
import { requireAuthUserId } from "./lib/auth";

const DELETE_BATCH_SIZE_MAX = 500;
const MAX_DELETE_BATCH_LOOPS = 1_000;

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
		const user = await ctx.db.get(userId);
		if (!user || user.externalId !== identity.subject) {
			throw new Error("User not found or unauthorized");
		}

		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "session",
				where: [{ field: "userId", operator: "eq", value: identity.subject }],
			},
			paginationOpts: { cursor: null, numItems: 1000 },
		});

		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "account",
				where: [{ field: "userId", operator: "eq", value: identity.subject }],
			},
			paginationOpts: { cursor: null, numItems: 100 },
		});

		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: {
				model: "user",
				where: [{ field: "_id", operator: "eq", value: identity.subject }],
			},
			paginationOpts: { cursor: null, numItems: 1 },
		});

		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(internal.users.deleteUserStreamJobs, {
				userId,
			});
			if (!result.hasMore) break;
		}

		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(internal.users.deleteUserChatReadStatuses, {
				userId,
			});
			if (!result.hasMore) break;
		}

		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(internal.users.deleteUserFiles, {
				userId,
			});
			if (!result.hasMore) break;
		}

		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(internal.users.deleteUserMessages, {
				userId,
			});
			if (!result.hasMore) break;
		}

		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(internal.users.deleteUserChats, {
				userId,
			});
			if (!result.hasMore) break;
		}

		for (let batch = 0; batch < MAX_DELETE_BATCH_LOOPS; batch++) {
			const result = await ctx.runMutation(internal.users.deleteUserPromptTemplates, {
				userId,
			});
			if (!result.hasMore) break;
		}

		const profile = await ctx.db
			.query("profiles")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();
		if (profile) {
			await ctx.db.delete(profile._id);
		}

		await ctx.db.delete(userId);

		await decrementStat(ctx, STAT_KEYS.USERS_TOTAL);

		return { success: true };
	},
});
