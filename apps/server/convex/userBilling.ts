import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DAILY_AI_LIMIT_CENTS, getCurrentDateKey } from "./lib/billingUtils";
import { createLogger } from "./lib/logger";

const logger = createLogger("userBilling");

const MAX_SINGLE_REQUEST_CENTS = DAILY_AI_LIMIT_CENTS * 10;

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
			void logger.error("Rejected suspiciously high usage", null, { usageCents: args.usageCents, userId: args.userId });
			return {
				usedCents: 0,
				remainingCents: DAILY_AI_LIMIT_CENTS,
				overLimit: false,
			};
		}

		const user = await ctx.db.get(args.userId);
		if (!user) {
			void logger.warn("User not found for usage recording", { userId: args.userId, usageCents: args.usageCents });
			return {
				usedCents: 0,
				remainingCents: DAILY_AI_LIMIT_CENTS,
				overLimit: false,
			};
		}

		const currentDate = getCurrentDateKey();
		const previousCents =
			user.aiUsageDate === currentDate ? (user.aiUsageCents ?? 0) : 0;

		const nextCents = Math.max(0, previousCents + args.usageCents);
		const overLimit = nextCents >= DAILY_AI_LIMIT_CENTS;

		await ctx.db.patch(args.userId, {
			aiUsageCents: nextCents,
			aiUsageDate: currentDate,
			updatedAt: Date.now(),
		});

		return {
			usedCents: nextCents,
			remainingCents: Math.max(0, DAILY_AI_LIMIT_CENTS - nextCents),
			overLimit,
		};
	},
});
