import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { createLogger } from "../lib/logger";

const logger = createLogger("migrations.profiles");

export const migrateProfilesToNewTable = internalMutation({
	args: {
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		await logger.info("Migrate profiles to new table started", { batchSize, dryRun });

		try {
			const usersPage = await ctx.db.query("users").order("asc").paginate({
				numItems: batchSize,
				cursor: args.cursor ?? null,
			});
			const batch = usersPage.page;
			const hasMore = !usersPage.isDone;

			await logger.info("Processing users", { count: batch.length });

			let migrated = 0;
			let skipped = 0;
			const errors: Array<{ userId: string; error: string }> = [];

			for (const user of batch) {
				try {
					const existingProfile = await ctx.db
						.query("profiles")
						.withIndex("by_user", (q) => q.eq("userId", user._id))
						.first();

					if (existingProfile) {
						skipped++;
						continue;
					}

					if (dryRun) {
						await logger.info("Dry run would create profile", { userId: user._id });
						migrated++;
						continue;
					}

					const now = Date.now();
					await ctx.db.insert("profiles", {
						userId: user._id,
						name: user.name,
						avatarUrl: user.avatarUrl,
						encryptedOpenRouterKey: user.encryptedOpenRouterKey,
						fileUploadCount: user.fileUploadCount ?? 0,
						createdAt: user.createdAt ?? now,
						updatedAt: user.updatedAt ?? now,
					});
					migrated++;
					await logger.info("Created profile", { userId: user._id });
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					errors.push({
						userId: user._id,
						error: errorMessage,
					});
					await logger.error("Error creating profile", error, { userId: user._id, errorMessage });
				}
			}

			const message = dryRun
				? `[Migration] Migrate profiles - Dry run completed (${migrated} profiles would be created, ${skipped} skipped)`
				: `[Migration] Migrate profiles - Batch completed (${migrated} profiles created, ${skipped} skipped)`;
			await logger.info(message);

			if (errors.length > 0) {
				await logger.error("Encountered migration errors", errors, { count: errors.length });
			}

			return {
				success: true,
				dryRun,
				migrated,
				skipped,
				hasMore,
				nextCursor: hasMore ? usersPage.continueCursor : null,
				errors: errors.length,
				errorDetails: errors.slice(0, 10),
			};
		} catch (error) {
			await logger.error("Migrate profiles to new table failed", error);
			throw error;
		}
	},
});

export const verifyProfileMigration = internalMutation({
	args: {
		cursor: v.optional(v.string()),
		batchSize: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		await logger.info("Verify profile migration started");

		try {
			const usersPage = await ctx.db.query("users").order("asc").paginate({
				numItems: batchSize,
				cursor: args.cursor ?? null,
			});
			const users = usersPage.page;
			const missingProfiles: string[] = [];
			const dataMismatches: Array<{
				userId: string;
				field: string;
				userValue: unknown;
				profileValue: unknown;
			}> = [];

			for (const user of users) {
				const profile = await ctx.db
					.query("profiles")
					.withIndex("by_user", (q) => q.eq("userId", user._id))
					.first();

				if (!profile) {
					missingProfiles.push(user._id);
					continue;
				}

				if (user.name !== profile.name) {
					dataMismatches.push({
						userId: user._id,
						field: "name",
						userValue: user.name,
						profileValue: profile.name,
					});
				}
				if (user.avatarUrl !== profile.avatarUrl) {
					dataMismatches.push({
						userId: user._id,
						field: "avatarUrl",
						userValue: user.avatarUrl,
						profileValue: profile.avatarUrl,
					});
				}
				if (user.encryptedOpenRouterKey !== profile.encryptedOpenRouterKey) {
					dataMismatches.push({
						userId: user._id,
						field: "encryptedOpenRouterKey",
						userValue: user.encryptedOpenRouterKey,
						profileValue: profile.encryptedOpenRouterKey,
					});
				}
				if ((user.fileUploadCount ?? 0) !== (profile.fileUploadCount ?? 0)) {
					dataMismatches.push({
						userId: user._id,
						field: "fileUploadCount",
						userValue: user.fileUploadCount ?? 0,
						profileValue: profile.fileUploadCount ?? 0,
					});
				}
			}

			if (missingProfiles.length > 0) {
				await logger.info("Found users without profiles", {
					count: missingProfiles.length,
					sample: missingProfiles.slice(0, 10),
				});
			}

			if (dataMismatches.length > 0) {
				await logger.info("Found profile data mismatches", {
					count: dataMismatches.length,
					sample: dataMismatches.slice(0, 10),
				});
			}

			if (missingProfiles.length === 0 && dataMismatches.length === 0) {
				await logger.info("All profiles are consistent");
			}

			await logger.info("Verify profile migration completed");

			return {
				success: true,
				totalUsers: users.length,
				hasMore: !usersPage.isDone,
				nextCursor: usersPage.isDone ? null : usersPage.continueCursor,
				missingProfiles: missingProfiles.length,
				dataMismatches: dataMismatches.length,
				missingSamples: missingProfiles.slice(0, 10),
				mismatchSamples: dataMismatches.slice(0, 10),
			};
		} catch (error) {
			await logger.error("Verify profile migration failed", error);
			throw error;
		}
	},
});
