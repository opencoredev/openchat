import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DAILY_AI_LIMIT_CENTS, getCurrentDateKey } from "./lib/billingUtils";
import { createLogger } from "./lib/logger";

const logger = createLogger("users");

// Re-export auth functions (ensure, getCurrentAuthUser, getByExternalId, getByExternalIdInternal, getById)
export {
	ensure,
	getCurrentAuthUser,
	getByExternalId,
	getByExternalIdInternal,
	getById,
} from "./userAuth";

// Re-export profile functions (getFavoriteModels, toggleFavoriteModel, setFavoriteModels, updateName)
export {
	getFavoriteModels,
	toggleFavoriteModel,
	setFavoriteModels,
	updateName,
} from "./userProfile";

// Re-export API key functions (saveOpenRouterKey, getOpenRouterKey, hasOpenRouterKey, getOpenRouterKeyInternal, removeOpenRouterKey)
export {
	saveOpenRouterKey,
	getOpenRouterKey,
	hasOpenRouterKey,
	getOpenRouterKeyInternal,
	removeOpenRouterKey,
} from "./userApiKeys";

// Re-export batch delete functions (registers them under internal.users.* namespace)
export {
	deleteUserStreamJobs,
	deleteUserMessages,
	deleteUserChats,
	deleteUserFiles,
	deleteUserChatReadStatuses,
	deleteUserPromptTemplates,
} from "./userDeleteBatch";

// Re-export account deletion orchestration (registers them under internal.users.* / api.users.* namespace)
export {
	deleteUserRecord,
	deleteAccountWorkflowStep,
	deleteAccount,
} from "./userDelete";

// Maximum single-request usage cap to guard against corrupted cost data
const MAX_SINGLE_REQUEST_CENTS = DAILY_AI_LIMIT_CENTS * 10; // 100¢ = $1

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

		// Sanity cap: reject suspiciously high usage values
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

		// Second line of defense: if already over limit, still record but flag it
		const alreadyOverLimit = previousCents >= DAILY_AI_LIMIT_CENTS;

		const nextCents = Math.max(0, previousCents + args.usageCents);

		await ctx.db.patch(args.userId, {
			aiUsageCents: nextCents,
			aiUsageDate: currentDate,
			updatedAt: Date.now(),
		});

		return {
			usedCents: nextCents,
			remainingCents: Math.max(0, DAILY_AI_LIMIT_CENTS - nextCents),
			overLimit: alreadyOverLimit,
		};
	},
});
