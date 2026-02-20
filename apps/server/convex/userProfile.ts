import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getProfileByUserId, getOrCreateProfile } from "./lib/profiles";
import { requireAuthUserId } from "./lib/auth";

export const getFavoriteModels = query({
	args: {
		userId: v.id("users"),
	},
	returns: v.union(v.array(v.string()), v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const profile = await getProfileByUserId(ctx, userId);
		// Return null if favorites have never been set (allows frontend to apply defaults)
		// Return [] if user explicitly cleared all favorites
		if (!profile) return null;
		return profile.favoriteModels ?? null;
	},
});

export const toggleFavoriteModel = mutation({
	args: {
		userId: v.id("users"),
		modelId: v.string(),
	},
	returns: v.object({ isFavorite: v.boolean(), favorites: v.array(v.string()) }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const profile = await getOrCreateProfile(ctx, userId);
		const currentFavorites = profile.favoriteModels ?? [];
		const isFavorite = currentFavorites.includes(args.modelId);

		const newFavorites = isFavorite
			? currentFavorites.filter((id) => id !== args.modelId)
			: [...currentFavorites, args.modelId];

		await ctx.db.patch(profile._id, {
			favoriteModels: newFavorites,
			updatedAt: Date.now(),
		});

		return { isFavorite: !isFavorite, favorites: newFavorites };
	},
});

export const setFavoriteModels = mutation({
	args: {
		userId: v.id("users"),
		modelIds: v.array(v.string()),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const profile = await getOrCreateProfile(ctx, userId);

		await ctx.db.patch(profile._id, {
			favoriteModels: args.modelIds,
			updatedAt: Date.now(),
		});

		return { success: true };
	},
});

export const updateName = mutation({
	args: {
		userId: v.id("users"),
		name: v.string(),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const trimmedName = args.name.trim();
		if (trimmedName.length === 0 || trimmedName.length > 100) {
			throw new Error("Name must be between 1 and 100 characters");
		}

		const now = Date.now();

		// Update profile (primary location for name)
		const profile = await getOrCreateProfile(ctx, userId);
		await ctx.db.patch(profile._id, {
			name: trimmedName,
			updatedAt: now,
		});

		// Also update user table for backwards compatibility during migration
		await ctx.db.patch(userId, {
			name: trimmedName,
			updatedAt: now,
		});

		return { success: true };
	},
});
