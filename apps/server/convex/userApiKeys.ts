import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { getProfileByUserId, getOrCreateProfile } from "./lib/profiles";
import { requireAuthUserId } from "./lib/auth";

export const saveOpenRouterKey = mutation({
	args: {
		userId: v.id("users"),
		encryptedKey: v.string(),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Rate limit API key saves
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userSaveApiKey", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("API key updates", retryAfter);
		}

		const now = Date.now();

		// Update profile (primary location for API key)
		const profile = await getOrCreateProfile(ctx, userId);
		await ctx.db.patch(profile._id, {
			encryptedOpenRouterKey: args.encryptedKey,
			updatedAt: now,
		});

		// Also update user table for backwards compatibility during migration
		await ctx.db.patch(userId, {
			encryptedOpenRouterKey: args.encryptedKey,
			updatedAt: now,
		});

		return { success: true };
	},
});

export const getOpenRouterKey = query({
	args: {
		userId: v.id("users"),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Try profile first (primary location)
		const profile = await getProfileByUserId(ctx, userId);
		if (profile?.encryptedOpenRouterKey) {
			return profile.encryptedOpenRouterKey;
		}

		// Fall back to user table during migration
		const user = await ctx.db.get(userId);
		return user?.encryptedOpenRouterKey ?? null;
	},
});

/**
 * Check if a user has an OpenRouter API key stored (returns boolean, not the actual key).
 * This is used by the client to determine if the user has connected their OpenRouter account.
 */
export const hasOpenRouterKey = query({
	args: {
		userId: v.id("users"),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Try profile first (primary location)
		const profile = await getProfileByUserId(ctx, userId);
		if (profile?.encryptedOpenRouterKey) {
			return true;
		}

		// Fall back to user table during migration
		const user = await ctx.db.get(userId);
		return !!user?.encryptedOpenRouterKey;
	},
});

export const getOpenRouterKeyInternal = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const profile = await getProfileByUserId(ctx, args.userId);
		if (profile?.encryptedOpenRouterKey) {
			return profile.encryptedOpenRouterKey;
		}

		const user = await ctx.db.get(args.userId);
		return user?.encryptedOpenRouterKey ?? null;
	},
});

export const removeOpenRouterKey = mutation({
	args: {
		userId: v.id("users"),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		// Rate limit API key removals
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userRemoveApiKey", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("API key removals", retryAfter);
		}

		const now = Date.now();

		// Remove from profile (primary location)
		const profile = await getProfileByUserId(ctx, userId);
		if (profile) {
			await ctx.db.patch(profile._id, {
				encryptedOpenRouterKey: undefined,
				updatedAt: now,
			});
		}

		// Also remove from user table for backwards compatibility during migration
		await ctx.db.patch(userId, {
			encryptedOpenRouterKey: undefined,
			updatedAt: now,
		});

		return { success: true };
	},
});
