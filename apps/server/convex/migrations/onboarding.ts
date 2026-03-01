import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { createLogger } from "../lib/logger";

const logger = createLogger("migrations.onboarding");

const ONBOARDING_FIELDS_TO_REMOVE = new Set([
	"onboardingCompletedAt",
	"displayName",
	"preferredTone",
	"customInstructions",
]);

function buildReplacementUser(user: Doc<"users">) {
	const entries = Object.entries(user).filter(
		([key]) =>
			key !== "_id"
			&& key !== "_creationTime"
			&& !ONBOARDING_FIELDS_TO_REMOVE.has(key),
	);

	return {
		...(Object.fromEntries(entries) as Omit<Doc<"users">, "_id" | "_creationTime">),
		updatedAt: Date.now(),
	};
}

export const removeOnboardingFields = internalMutation({
	args: {
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		void logger.info("Remove onboarding fields started", { batchSize, dryRun });

		try {
			const usersPage = await ctx.db.query("users").order("asc").paginate({
				numItems: batchSize,
				cursor: args.cursor ?? null,
			});
			const users = usersPage.page;
			void logger.info("Processing users", { count: users.length });

			let processed = 0;
			let updated = 0;
			const errors: Array<{ userId: string; error: string }> = [];

			const results = await Promise.allSettled(
				users.map(async (user) => {
					const hasOnboardingFields =
						"onboardingCompletedAt" in user
						|| "displayName" in user
						|| "preferredTone" in user
						|| "customInstructions" in user;

					if (!hasOnboardingFields) {
						return { userId: user._id, updated: false };
					}

					if (dryRun) {
						void logger.info("Dry run would remove onboarding fields", {
							userId: user._id,
						});
						return { userId: user._id, updated: true };
					}

					await ctx.db.replace(user._id, buildReplacementUser(user));

					void logger.info("Removed onboarding fields", { userId: user._id });
					return { userId: user._id, updated: true };
				}),
			);

			for (const result of results) {
				if (result.status === "rejected") {
					const errorMessage =
						result.reason instanceof Error ? result.reason.message : String(result.reason);
					errors.push({
						userId: "unknown",
						error: errorMessage,
					});
					void logger.error("Error processing user in batch", errorMessage);
				} else if (result.value.updated) {
					updated++;
				}
			}

			processed += users.length;
			void logger.info("Processed users", { processed, total: users.length });

			const message = dryRun
				? `[Migration] Remove onboarding fields - Dry run completed (${updated} users would be updated)`
				: `[Migration] Remove onboarding fields - Completed (${updated} users updated)`;
			void logger.info(message);

			if (errors.length > 0) {
				void logger.error("Encountered migration errors", errors, { count: errors.length });
			}

			return {
				success: true,
				dryRun,
				totalUsers: users.length,
				hasMore: !usersPage.isDone,
				nextCursor: usersPage.isDone ? null : usersPage.continueCursor,
				processed,
				updated,
				errors: errors.length,
				errorDetails: errors.slice(0, 10),
			};
		} catch (error) {
			void logger.error("Remove onboarding fields failed", error);
			throw error;
		}
	},
});
