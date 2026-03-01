import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { createLogger } from "../lib/logger";

const logger = createLogger("migrations.chainOfThought");

export const migrateChainOfThoughtParts = internalMutation({
	args: {
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;
		const dryRun = args.dryRun ?? false;

		void logger.info("Migrate chainOfThoughtParts started", { batchSize, dryRun });

		try {
			const messages = await ctx.db
				.query("messages")
				.filter((q) => q.eq(q.field("role"), "assistant"))
				.collect();

			const messagesToMigrate = messages.filter(
				(message) =>
					(message.reasoning || (message.toolInvocations && message.toolInvocations.length > 0)) &&
					(!message.chainOfThoughtParts || message.chainOfThoughtParts.length === 0),
			);

			void logger.info("Found messages to migrate", { count: messagesToMigrate.length });

			let migrated = 0;
			let errors = 0;

			for (let i = 0; i < messagesToMigrate.length; i += batchSize) {
				const batch = messagesToMigrate.slice(i, i + batchSize);

				for (const message of batch) {
					try {
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

						if (message.reasoning) {
							parts.push({
								type: "reasoning",
								index: currentIndex,
								text: message.reasoning,
							});
							currentIndex += 1;
						}

						if (message.toolInvocations) {
							for (const tool of message.toolInvocations) {
								parts.push({
									type: "tool",
									index: currentIndex,
									toolName: tool.toolName,
									toolCallId: tool.toolCallId,
									state: tool.state,
									input: tool.input,
									output: tool.output,
									errorText: tool.errorText,
								});
								currentIndex += 1;
							}
						}

						if (parts.length > 0) {
							if (dryRun) {
								void logger.info("Dry run would migrate message", {
									messageId: message._id,
									partsCount: parts.length,
								});
							} else {
								await ctx.db.patch(message._id, {
									chainOfThoughtParts: parts,
								});
								void logger.info("Migrated message", {
									messageId: message._id,
									partsCount: parts.length,
								});
							}
							migrated += 1;
						}
					} catch (error) {
						errors += 1;
						void logger.error("Error migrating message", error, { messageId: message._id });
					}
				}

				void logger.info("Processed migration batch", {
					processed: Math.min(i + batchSize, messagesToMigrate.length),
					total: messagesToMigrate.length,
				});
			}

			const doneMessage = dryRun
				? `[Migration] Migrate chainOfThoughtParts - Dry run completed (${migrated} messages would be migrated)`
				: `[Migration] Migrate chainOfThoughtParts - Completed (${migrated} messages migrated)`;
			void logger.info(doneMessage);

			if (errors > 0) {
				void logger.error("Encountered migration errors", { count: errors });
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
			void logger.error("Migrate chainOfThoughtParts failed", error);
			throw error;
		}
	},
});
