/**
 * Database Migrations
 *
 * One-time scripts to migrate existing data to new schema or fix data inconsistencies.
 * These are typically run manually via the Convex dashboard or CLI.
 *
 * IMPORTANT: These are not automatic migrations - they must be triggered manually.
 * Run them once during deployment when schema changes require data updates.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { setStat, STAT_KEYS } from "./lib/dbStats";
import { components } from "./_generated/api";

/**
 * Clear Better Auth JWKS table
 * 
 * Use this when BETTER_AUTH_SECRET has changed and old keys are causing
 * "Failed to decrypt private key" errors.
 * 
 * @example
 * ```bash
 * npx convex run --prod migrations:clearJwks
 * ```
 */
export const clearJwks = internalMutation({
	args: {},
	handler: async (ctx) => {
		console.log("[Migration] Clear JWKS - Started");
		
		try {
			// First find all JWKS records using the correct input format
			const jwksRecords = await ctx.runQuery(components.betterAuth.adapter.findMany, {
				model: "jwks",
				where: [],
				paginationOpts: { numItems: 100, cursor: null },
			});
			
			console.log(`[Migration] Found ${jwksRecords.page.length} JWKS records`);
			
			// Delete each one using deleteMany
			const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
				input: {
					model: "jwks",
					where: [],
				},
				paginationOpts: { numItems: 100, cursor: null },
			});
			
			console.log("[Migration] Clear JWKS - Completed", result);
			return { success: true, count: jwksRecords.page.length };
		} catch (error) {
			console.error("[Migration] Clear JWKS - Failed", error);
			throw error;
		}
	},
});

/**
 * Initialize database statistics counters
 *
 * PERFORMANCE OPTIMIZATION: Populates the dbStats table with initial counts.
 * This is a one-time migration to backfill stats for existing data.
 *
 * Run this after deploying the new schema with dbStats table.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:initializeStats
 * ```
 */
export const initializeStats = internalMutation({
	args: {
		// Allow re-running to fix inconsistencies
		force: v.optional(v.boolean()),
	},
	handler: async (ctx, _args) => {
		console.log("[Migration] Initialize stats - Started");

		try {
			// Count all records in each table
			console.log("[Migration] Counting chats...");
			const allChats = await ctx.db.query("chats").collect();
			const chatsTotal = allChats.length;
			const chatsSoftDeleted = allChats.filter((c) => c.deletedAt !== undefined).length;

			console.log("[Migration] Counting messages...");
			const allMessages = await ctx.db.query("messages").collect();
			const messagesTotal = allMessages.length;
			const messagesSoftDeleted = allMessages.filter((m) => m.deletedAt !== undefined).length;

			console.log("[Migration] Counting users...");
			const allUsers = await ctx.db.query("users").collect();
			const usersTotal = allUsers.length;

			// Set all stats
			await setStat(ctx, STAT_KEYS.CHATS_TOTAL, chatsTotal, {
				description: "Total number of chats (including soft-deleted)",
				category: "chats",
			});
			await setStat(ctx, STAT_KEYS.CHATS_SOFT_DELETED, chatsSoftDeleted, {
				description: "Number of soft-deleted chats",
				category: "chats",
			});
			await setStat(ctx, STAT_KEYS.MESSAGES_TOTAL, messagesTotal, {
				description: "Total number of messages (including soft-deleted)",
				category: "messages",
			});
			await setStat(ctx, STAT_KEYS.MESSAGES_SOFT_DELETED, messagesSoftDeleted, {
				description: "Number of soft-deleted messages",
				category: "messages",
			});
			await setStat(ctx, STAT_KEYS.USERS_TOTAL, usersTotal, {
				description: "Total number of users",
				category: "users",
			});

			const results = {
				chatsTotal,
				chatsSoftDeleted,
				messagesTotal,
				messagesSoftDeleted,
				usersTotal,
			};

			console.log("[Migration] Initialize stats - Completed", results);

			return {
				success: true,
				results,
			};
		} catch (error) {
			console.error("[Migration] Initialize stats - Failed", error);
			throw error;
		}
	},
});

/**
 * Backfill messageCount field for existing chats
 *
 * PERFORMANCE OPTIMIZATION: Populates the messageCount field for all existing chats.
 * This is a one-time migration to backfill counts for existing data.
 *
 * Run this after deploying the new schema with messageCount field.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:backfillMessageCounts
 * ```
 */
export const backfillMessageCounts = internalMutation({
	args: {
		// Process in batches to avoid overwhelming the database
		batchSize: v.optional(v.number()),
		// Skip chats that already have messageCount set
		skipExisting: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const skipExisting = args.skipExisting ?? true;

		console.log("[Migration] Backfill message counts - Started");
		console.log(`[Migration] Batch size: ${batchSize}, Skip existing: ${skipExisting}`);

		try {
			// Get all chats
			let chats = await ctx.db.query("chats").collect();

			// Filter out chats that already have messageCount if skipExisting is true
			if (skipExisting) {
				chats = chats.filter((c) => c.messageCount === undefined);
			}

			console.log(`[Migration] Processing ${chats.length} chats...`);

			let processed = 0;
			let updated = 0;

			// Process in batches
			let batchFailures = 0;
			for (let i = 0; i < chats.length; i += batchSize) {
				const batch = chats.slice(i, i + batchSize);

				const results = await Promise.allSettled(
					batch.map(async (chat) => {
						// Count non-deleted messages for this chat
						const messages = await ctx.db
							.query("messages")
							.withIndex("by_chat_not_deleted", (q) =>
								q.eq("chatId", chat._id).eq("deletedAt", undefined)
							)
							.collect();

						const messageCount = messages.length;

						// Update the chat with the message count
						await ctx.db.patch(chat._id, {
							messageCount,
						});

						return chat._id;
					})
				);

				const failures = results.filter(r => r.status === "rejected");
				const successes = results.filter(r => r.status === "fulfilled");
				updated += successes.length;
				batchFailures += failures.length;

				if (failures.length > 0) {
					console.log(`[Migration] ${failures.length} items failed in batch:`, failures.map(f => f.reason));
				}

				processed += batch.length;
				console.log(`[Migration] Processed ${processed}/${chats.length} chats...`);
			}

			if (batchFailures > 0) {
				console.log(`[Migration] Total failures: ${batchFailures}`);
			}

			console.log(`[Migration] Backfill message counts - Completed (${updated} chats updated)`);

			return {
				success: true,
				processed,
				updated,
			};
		} catch (error) {
			console.error("[Migration] Backfill message counts - Failed", error);
			throw error;
		}
	},
});

/**
 * Verify data consistency
 *
 * Checks that messageCount fields match actual message counts in the database.
 * Useful for debugging and ensuring migrations worked correctly.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:verifyMessageCounts
 * ```
 */
export const verifyMessageCounts = internalMutation({
	args: {},
	handler: async (ctx) => {
		console.log("[Migration] Verify message counts - Started");

		try {
			const chats = await ctx.db.query("chats").collect();
			const inconsistencies: Array<{
				chatId: string;
				storedCount: number | undefined;
				actualCount: number;
			}> = [];

			for (const chat of chats) {
				// Count non-deleted messages for this chat
				const messages = await ctx.db
					.query("messages")
					.withIndex("by_chat_not_deleted", (q) =>
						q.eq("chatId", chat._id).eq("deletedAt", undefined)
					)
					.collect();

				const actualCount = messages.length;
				const storedCount = chat.messageCount;

				if (storedCount !== actualCount) {
					inconsistencies.push({
						chatId: chat._id,
						storedCount,
						actualCount,
					});
				}
			}

			if (inconsistencies.length > 0) {
				console.log(
					`[Migration] Found ${inconsistencies.length} inconsistencies:`,
					inconsistencies.slice(0, 10) // Log first 10
				);
			} else {
				console.log("[Migration] All message counts are consistent!");
			}

			console.log("[Migration] Verify message counts - Completed");

			return {
				success: true,
				totalChats: chats.length,
				inconsistencies: inconsistencies.length,
				samples: inconsistencies.slice(0, 10),
			};
		} catch (error) {
			console.error("[Migration] Verify message counts - Failed", error);
			throw error;
		}
	},
});

/**
 * Fix message count inconsistencies
 *
 * Repairs any chats where messageCount doesn't match the actual number of messages.
 * Run this if verifyMessageCounts finds inconsistencies.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:fixMessageCounts
 * ```
 */
export const fixMessageCounts = internalMutation({
	args: {},
	handler: async (ctx) => {
		console.log("[Migration] Fix message counts - Started");

		try {
			const chats = await ctx.db.query("chats").collect();
			let fixed = 0;

			for (const chat of chats) {
				// Count non-deleted messages for this chat
				const messages = await ctx.db
					.query("messages")
					.withIndex("by_chat_not_deleted", (q) =>
						q.eq("chatId", chat._id).eq("deletedAt", undefined)
					)
					.collect();

				const actualCount = messages.length;
				const storedCount = chat.messageCount;

				if (storedCount !== actualCount) {
					await ctx.db.patch(chat._id, {
						messageCount: actualCount,
					});
					fixed++;
					console.log(
						`[Migration] Fixed chat ${chat._id}: ${storedCount} -> ${actualCount}`
					);
				}
			}

			console.log(`[Migration] Fix message counts - Completed (${fixed} chats fixed)`);

			return {
				success: true,
				totalChats: chats.length,
				fixed,
			};
		} catch (error) {
			console.error("[Migration] Fix message counts - Failed", error);
			throw error;
		}
	},
});

/**
 * Remove deprecated onboarding fields from users table
 *
 * Removes the following fields from all user records:
 * - onboardingCompletedAt
 * - displayName
 * - preferredTone
 * - customInstructions
 *
 * These fields were part of the initial onboarding flow but are no longer used.
 * This migration safely removes them from existing user records.
 *
 * IMPORTANT: This migration is idempotent - safe to run multiple times.
 * If a user already has these fields removed, they will be skipped.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:removeOnboardingFields
 * ```
 */
export const removeOnboardingFields = internalMutation({
	args: {
		// Process in batches to avoid overwhelming the database
		batchSize: v.optional(v.number()),
		// Dry run mode - log what would be changed without making changes
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		console.log("[Migration] Remove onboarding fields - Started");
		console.log(`[Migration] Batch size: ${batchSize}, Dry run: ${dryRun}`);

		try {
			// Get all users
			const users = await ctx.db.query("users").collect();

			console.log(`[Migration] Processing ${users.length} users...`);

			let processed = 0;
			let updated = 0;
			const errors: Array<{ userId: string; error: string }> = [];

			// Process in batches
			for (let i = 0; i < users.length; i += batchSize) {
				const batch = users.slice(i, i + batchSize);

				const results = await Promise.allSettled(
					batch.map(async (user) => {
						const hasOnboardingFields =
							"onboardingCompletedAt" in user ||
							"displayName" in user ||
							"preferredTone" in user ||
							"customInstructions" in user;

						if (hasOnboardingFields) {
							if (dryRun) {
								console.log(
									`[Migration] [DRY RUN] Would remove onboarding fields from user ${user._id}`
								);
							} else {
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
								console.log(
									`[Migration] Removed onboarding fields from user ${user._id}`
								);
							}
							return { userId: user._id, updated: true };
						}
						return { userId: user._id, updated: false };
					})
				);

				// Handle results
				for (const result of results) {
					if (result.status === "rejected") {
						const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
						console.error(`[Migration] Error processing user in batch:`, errorMessage);
						errors.push({
							userId: "unknown",
							error: errorMessage,
						});
					} else if (result.value.updated) {
						updated++;
					}
				}

				const batchFailures = results.filter(r => r.status === "rejected");
				if (batchFailures.length > 0) {
					console.log(`[Migration] ${batchFailures.length} items failed in batch`);
				}

				processed += batch.length;
				console.log(`[Migration] Processed ${processed}/${users.length} users...`);
			}

			const message = dryRun
				? `[Migration] Remove onboarding fields - Dry run completed (${updated} users would be updated)`
				: `[Migration] Remove onboarding fields - Completed (${updated} users updated)`;

			console.log(message);

			if (errors.length > 0) {
				console.error(`[Migration] Encountered ${errors.length} errors:`, errors);
			}

			return {
				success: true,
				dryRun,
				totalUsers: users.length,
				processed,
				updated,
				errors: errors.length,
				errorDetails: errors.slice(0, 10), // Return first 10 errors
			};
		} catch (error) {
			console.error("[Migration] Remove onboarding fields - Failed", error);
			throw error;
		}
	},
});

/**
 * Migrate profile data from users table to profiles table
 *
 * Phase 4 of Auth/Profile Separation: Creates profile records for all existing users
 * by copying profile-related fields (name, avatarUrl, encryptedOpenRouterKey, fileUploadCount)
 * from the users table to the new profiles table.
 *
 * IMPORTANT: This migration is idempotent - safe to run multiple times.
 * It checks if a profile already exists for each user before creating a new one.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:migrateProfilesToNewTable
 *
 * # With cursor for pagination (for large datasets):
 * npx convex run migrations:migrateProfilesToNewTable '{"cursor": "last_user_id"}'
 * ```
 */
export const migrateProfilesToNewTable = internalMutation({
	args: {
		// Cursor for pagination - pass the last user ID from previous batch
		cursor: v.optional(v.id("users")),
		// Number of users to process per batch
		batchSize: v.optional(v.number()),
		// Dry run mode - log what would be changed without making changes
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		console.log("[Migration] Migrate profiles to new table - Started");
		console.log(`[Migration] Batch size: ${batchSize}, Dry run: ${dryRun}`);

		try {
			// Get users, starting from cursor if provided
			let usersQuery = ctx.db.query("users").order("asc");

			// If cursor is provided, we need to filter to users after the cursor
			const allUsers = await usersQuery.take(batchSize + 1);

			// Filter to users after cursor if provided
			let users = args.cursor
				? allUsers.filter((u) => u._id > args.cursor!)
				: allUsers;

			// Check if there are more users after this batch
			const hasMore = users.length > batchSize;
			const batch = hasMore ? users.slice(0, batchSize) : users;

			console.log(`[Migration] Processing ${batch.length} users...`);

			let migrated = 0;
			let skipped = 0;
			const errors: Array<{ userId: string; error: string }> = [];

			for (const user of batch) {
				try {
					// Check if profile already exists for this user
					const existingProfile = await ctx.db
						.query("profiles")
						.withIndex("by_user", (q) => q.eq("userId", user._id))
						.first();

					if (existingProfile) {
						skipped++;
						continue;
					}

					if (dryRun) {
						console.log(
							`[Migration] [DRY RUN] Would create profile for user ${user._id}`
						);
						migrated++;
					} else {
						// Create profile with data from user
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
						console.log(`[Migration] Created profile for user ${user._id}`);
					}
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					console.error(
						`[Migration] Error creating profile for user ${user._id}:`,
						errorMessage
					);
					errors.push({
						userId: user._id,
						error: errorMessage,
					});
				}
			}

			const message = dryRun
				? `[Migration] Migrate profiles - Dry run completed (${migrated} profiles would be created, ${skipped} skipped)`
				: `[Migration] Migrate profiles - Batch completed (${migrated} profiles created, ${skipped} skipped)`;

			console.log(message);

			if (errors.length > 0) {
				console.error(`[Migration] Encountered ${errors.length} errors:`, errors);
			}

			return {
				success: true,
				dryRun,
				migrated,
				skipped,
				hasMore,
				nextCursor: hasMore ? batch[batch.length - 1]._id : null,
				errors: errors.length,
				errorDetails: errors.slice(0, 10),
			};
		} catch (error) {
			console.error("[Migration] Migrate profiles to new table - Failed", error);
			throw error;
		}
	},
});

/**
 * Verify profile migration consistency
 *
 * Checks that all users have corresponding profiles and that the data matches.
 * Useful for debugging and ensuring migration worked correctly.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:verifyProfileMigration
 * ```
 */
export const verifyProfileMigration = internalMutation({
	args: {},
	handler: async (ctx) => {
		console.log("[Migration] Verify profile migration - Started");

		try {
			const users = await ctx.db.query("users").collect();
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

				// Check data consistency
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
			}

			if (missingProfiles.length > 0) {
				console.log(
					`[Migration] Found ${missingProfiles.length} users without profiles:`,
					missingProfiles.slice(0, 10)
				);
			}

			if (dataMismatches.length > 0) {
				console.log(
					`[Migration] Found ${dataMismatches.length} data mismatches:`,
					dataMismatches.slice(0, 10)
				);
			}

			if (missingProfiles.length === 0 && dataMismatches.length === 0) {
				console.log("[Migration] All profiles are consistent!");
			}

			console.log("[Migration] Verify profile migration - Completed");

			return {
				success: true,
				totalUsers: users.length,
				missingProfiles: missingProfiles.length,
				dataMismatches: dataMismatches.length,
				missingSamples: missingProfiles.slice(0, 10),
				mismatchSamples: dataMismatches.slice(0, 10),
			};
		} catch (error) {
			console.error("[Migration] Verify profile migration - Failed", error);
			throw error;
		}
	},
});

/**
 * Migrate legacy reasoning/toolInvocations to chainOfThoughtParts
 *
 * Converts messages using the old separate reasoning and toolInvocations fields
 * to the new unified chainOfThoughtParts format that preserves stream order.
 *
 * IMPORTANT: This migration is idempotent - safe to run multiple times.
 * Messages that already have chainOfThoughtParts will be skipped.
 *
 * @example
 * ```bash
 * # Run via Convex CLI:
 * npx convex run migrations:migrateChainOfThoughtParts
 *
 * # Dry run first:
 * npx convex run migrations:migrateChainOfThoughtParts '{"dryRun": true}'
 * ```
 */
export const migrateChainOfThoughtParts = internalMutation({
	args: {
		// Process in batches to avoid overwhelming the database
		batchSize: v.optional(v.number()),
		// Dry run mode - log what would be changed without making changes
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		console.log("[Migration] Migrate chainOfThoughtParts - Started");
		console.log(`[Migration] Batch size: ${batchSize}, Dry run: ${dryRun}`);

		try {
			// Get all assistant messages that have reasoning or toolInvocations but no chainOfThoughtParts
			const messages = await ctx.db
				.query("messages")
				.filter((q) => q.eq(q.field("role"), "assistant"))
				.collect();

			// Filter to only messages needing migration
			const messagesToMigrate = messages.filter(
				(m) =>
					// Has legacy data
					(m.reasoning || (m.toolInvocations && m.toolInvocations.length > 0)) &&
					// But no new format data
					(!m.chainOfThoughtParts || m.chainOfThoughtParts.length === 0)
			);

			console.log(`[Migration] Found ${messagesToMigrate.length} messages to migrate...`);

			let migrated = 0;
			let errors = 0;

			// Process in batches
			for (let i = 0; i < messagesToMigrate.length; i += batchSize) {
				const batch = messagesToMigrate.slice(i, i + batchSize);

				for (const message of batch) {
					try {
						// Build chainOfThoughtParts from legacy fields
						// Order: reasoning first (index 0), then tools (index 1+)
						const parts: Array<{
							type: "reasoning" | "tool";
							index: number;
							text?: string;
							toolName?: string;
							toolCallId?: string;
							state?: string;
							input?: unknown;
							output?: unknown;
							errorText?: string;
						}> = [];

						let currentIndex = 0;

						// Add reasoning as first part (if present)
						if (message.reasoning) {
							parts.push({
								type: "reasoning",
								index: currentIndex++,
								text: message.reasoning,
							});
						}

						// Add tool invocations (if present)
						if (message.toolInvocations) {
							for (const tool of message.toolInvocations) {
								parts.push({
									type: "tool",
									index: currentIndex++,
									toolName: tool.toolName,
									toolCallId: tool.toolCallId,
									state: tool.state,
									input: tool.input,
									output: tool.output,
									errorText: tool.errorText,
								});
							}
						}

						if (parts.length > 0) {
							if (dryRun) {
								console.log(
									`[Migration] [DRY RUN] Would migrate message ${message._id} with ${parts.length} parts`
								);
							} else {
								await ctx.db.patch(message._id, {
									chainOfThoughtParts: parts,
								});
								console.log(
									`[Migration] Migrated message ${message._id} with ${parts.length} parts`
								);
							}
							migrated++;
						}
					} catch (error) {
						console.error(
							`[Migration] Error migrating message ${message._id}:`,
							error
						);
						errors++;
					}
				}

				console.log(
					`[Migration] Processed ${Math.min(i + batchSize, messagesToMigrate.length)}/${messagesToMigrate.length} messages...`
				);
			}

			const message = dryRun
				? `[Migration] Migrate chainOfThoughtParts - Dry run completed (${migrated} messages would be migrated)`
				: `[Migration] Migrate chainOfThoughtParts - Completed (${migrated} messages migrated)`;

			console.log(message);

			if (errors > 0) {
				console.error(`[Migration] Encountered ${errors} errors`);
			}

			return {
				success: true,
				dryRun,
				totalMessages: messages.length,
				needingMigration: messagesToMigrate.length,
				migrated,
				errors,
			};
		} catch (error) {
			console.error("[Migration] Migrate chainOfThoughtParts - Failed", error);
			throw error;
		}
	},
});
