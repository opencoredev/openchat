import { v } from "convex/values";
import { mutation, internalQuery } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";

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
		const staleJobs = await ctx.db
			.query("streamJobs")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.filter((q) =>
				q.or(
					q.eq(q.field("status"), "running"),
					q.eq(q.field("status"), "pending")
				)
			)
			.collect();

		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
		let cleaned = 0;

		for (const job of staleJobs) {
			if (job.createdAt < fiveMinutesAgo) {
				await ctx.db.patch(job._id, {
					status: "error",
					error: "Cleaned up stale job",
					completedAt: Date.now(),
				});
				cleaned++;
			}
		}

		return { cleaned, total: staleJobs.length };
	},
});
