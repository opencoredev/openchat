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

		await logger.info("Remove onboarding fields started", { batchSize, dryRun });

		try {
			const usersPage = await ctx.db.query("users").order("asc").paginate({
				numItems: batchSize,
				cursor: args.cursor ?? null,
			});
			const users = usersPage.page;
			await logger.info("Processing users", { count: users.length });

			let processed = 0;
			let updated = 0;
			const errors: Array<{ userId: string; error: string }> = [];

			for (const user of users) {
				const hasOnboardingFields =
					"onboardingCompletedAt" in user
					|| "displayName" in user
					|| "preferredTone" in user
					|| "customInstructions" in user;

				if (!hasOnboardingFields) {
					continue;
				}

				if (dryRun) {
					await logger.info("Dry run would remove onboarding fields", {
						userId: user._id,
					});
					updated++;
					continue;
				}

				try {
					await ctx.db.replace(user._id, buildReplacementUser(user));
					await logger.info("Removed onboarding fields", { userId: user._id });
					updated++;
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					errors.push({
						userId: user._id,
						error: errorMessage,
					});
					await logger.error("Error processing user in batch", error, {
						userId: user._id,
						errorMessage,
					});
					throw error;
				}
			}

			processed += users.length;
			await logger.info("Processed users", { processed, total: users.length });

			const message = dryRun
				? `[Migration] Remove onboarding fields - Dry run completed (${updated} users would be updated)`
				: `[Migration] Remove onboarding fields - Completed (${updated} users updated)`;
			await logger.info(message);

			if (errors.length > 0) {
				await logger.error("Encountered migration errors", errors, { count: errors.length });
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
			await logger.error("Remove onboarding fields failed", error);
			throw error;
		}
	},
});
