import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { createLogger } from "../lib/logger";

const logger = createLogger("migrations.onboarding");

export const removeOnboardingFields = internalMutation({
	args: {
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		void logger.info("Remove onboarding fields started", { batchSize, dryRun });

		try {
			const users = await ctx.db.query("users").collect();
			void logger.info("Processing users", { count: users.length });

			let processed = 0;
			let updated = 0;
			const errors: Array<{ userId: string; error: string }> = [];

			for (let i = 0; i < users.length; i += batchSize) {
				const batch = users.slice(i, i + batchSize);

				const results = await Promise.allSettled(
					batch.map(async (user) => {
						const hasOnboardingFields =
							"onboardingCompletedAt" in user ||
							"displayName" in user ||
							"preferredTone" in user ||
							"customInstructions" in user;

						if (!hasOnboardingFields) {
							return { userId: user._id, updated: false };
						}

						if (dryRun) {
							void logger.info("Dry run would remove onboarding fields", {
								userId: user._id,
							});
							return { userId: user._id, updated: true };
						}

						await ctx.db.replace(user._id, {
							externalId: user.externalId,
							email: user.email,
							name: user.name,
							avatarUrl: user.avatarUrl,
							encryptedOpenRouterKey: user.encryptedOpenRouterKey,
							fileUploadCount: user.fileUploadCount,
							searchUsageCount: user.searchUsageCount,
							searchUsageDate: user.searchUsageDate,
							aiUsageCents: user.aiUsageCents,
							aiUsageDate: user.aiUsageDate,
							banned: user.banned,
							bannedAt: user.bannedAt,
							banReason: user.banReason,
							banExpiresAt: user.banExpiresAt,
							createdAt: user.createdAt,
							updatedAt: Date.now(),
						});

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

				processed += batch.length;
				void logger.info("Processed users", { processed, total: users.length });
			}

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
