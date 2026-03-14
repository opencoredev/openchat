import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { getProfileByUserId, getOrCreateProfile } from "./lib/profiles";
import { encryptSecret } from "./lib/crypto";
import { requireAuthUserId } from "./lib/auth";

type AuthIdentity = {
	subject: string;
	email?: string | null;
	name?: string | null;
	pictureUrl?: string | null;
};

type QueryAuthCtx = {
	auth: { getUserIdentity: () => Promise<AuthIdentity | null> };
	db: {
		query: (table: "users") => {
			withIndex: (
				index: "by_external_id",
				cb: (q: { eq: (field: string, value: string) => unknown }) => unknown,
			) => { unique: () => Promise<{ _id: Id<"users">; externalId: string } | null> };
		};
		get: (id: Id<"users">) => Promise<{ encryptedOpenRouterKey?: string } | null>;
	};
};

type MutationAuthCtx = QueryAuthCtx & {
	db: QueryAuthCtx["db"] & {
		insert: (
			table: "users" | "profiles",
			value: Record<string, unknown>,
		) => Promise<Id<"users"> | Id<"profiles">>;
	};
};

async function resolveAuthedUserRecordForQuery(ctx: QueryAuthCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Unauthorized");
	}

	const existingUser = await ctx.db
		.query("users")
		.withIndex("by_external_id", (q) => q.eq("externalId", identity.subject))
		.unique();

	if (!existingUser?._id) {
		throw new Error("User not found");
	}

	return { identity, userId: existingUser._id };
}

async function resolveAuthedUserRecordForMutation(ctx: MutationAuthCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Unauthorized");
	}

	const existingUser = await ctx.db
		.query("users")
		.withIndex("by_external_id", (q) => q.eq("externalId", identity.subject))
		.unique();

	if (existingUser?._id) {
		return { identity, userId: existingUser._id };
	}

	const now = Date.now();
	const userId = (await ctx.db.insert("users", {
		externalId: identity.subject,
		email: identity.email ?? undefined,
		name: identity.name ?? undefined,
		avatarUrl: identity.pictureUrl ?? undefined,
		createdAt: now,
		updatedAt: now,
	})) as Id<"users">;

	await ctx.db.insert("profiles", {
		userId,
		name: identity.name ?? undefined,
		avatarUrl: identity.pictureUrl ?? undefined,
		fileUploadCount: 0,
		createdAt: now,
		updatedAt: now,
	});

	return { identity, userId };
}

export const saveOpenRouterKey = mutation({
	args: {
		userId: v.id("users"),
		encryptedKey: v.string(),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userSaveApiKey", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("API key updates", retryAfter);
		}

		const now = Date.now();
		const profile = await getOrCreateProfile(ctx, userId);
		await ctx.db.patch(profile._id, {
			encryptedOpenRouterKey: args.encryptedKey,
			updatedAt: now,
		});

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
		const profile = await getProfileByUserId(ctx, userId);
		if (profile?.encryptedOpenRouterKey) {
			return profile.encryptedOpenRouterKey;
		}

		const user = await ctx.db.get(userId);
		return user?.encryptedOpenRouterKey ?? null;
	},
});

export const hasOpenRouterKey = query({
	args: {
		userId: v.id("users"),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const profile = await getProfileByUserId(ctx, userId);
		if (profile?.encryptedOpenRouterKey) {
			return true;
		}

		const user = await ctx.db.get(userId);
		return !!user?.encryptedOpenRouterKey;
	},
});

export const hasMyOpenRouterKey = query({
	args: {},
	returns: v.boolean(),
	handler: async (ctx) => {
		const { userId } = await resolveAuthedUserRecordForQuery(ctx);
		const profile = await getProfileByUserId(ctx, userId);
		if (profile?.encryptedOpenRouterKey) {
			return true;
		}

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
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userRemoveApiKey", {
			key: userId,
		});

		if (!ok) {
			throwRateLimitError("API key removals", retryAfter);
		}

		const now = Date.now();
		const profile = await getProfileByUserId(ctx, userId);
		if (profile) {
			await ctx.db.patch(profile._id, {
				encryptedOpenRouterKey: undefined,
				updatedAt: now,
			});
		}

		await ctx.db.patch(userId, {
			encryptedOpenRouterKey: undefined,
			updatedAt: now,
		});

		return { success: true };
	},
});

export const saveMyOpenRouterKeyPlaintext = mutation({
	args: {
		apiKey: v.string(),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const { identity, userId } = await resolveAuthedUserRecordForMutation(ctx);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userSaveApiKey", {
			key: identity.subject,
		});

		if (!ok) {
			throwRateLimitError("API key updates", retryAfter);
		}

		const encryptedKey = await encryptSecret(args.apiKey.trim());
		const now = Date.now();
		const profile = await getOrCreateProfile(ctx, userId);
		await ctx.db.patch(profile._id, {
			encryptedOpenRouterKey: encryptedKey,
			updatedAt: now,
		});
		await ctx.db.patch(userId, {
			encryptedOpenRouterKey: encryptedKey,
			updatedAt: now,
		});

		return { success: true };
	},
});

export const removeMyOpenRouterKey = mutation({
	args: {},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx) => {
		const { identity, userId } = await resolveAuthedUserRecordForMutation(ctx);
		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userRemoveApiKey", {
			key: identity.subject,
		});

		if (!ok) {
			throwRateLimitError("API key removals", retryAfter);
		}

		const now = Date.now();
		const profile = await getProfileByUserId(ctx, userId);
		if (profile) {
			await ctx.db.patch(profile._id, {
				encryptedOpenRouterKey: undefined,
				updatedAt: now,
			});
		}
		await ctx.db.patch(userId, {
			encryptedOpenRouterKey: undefined,
			updatedAt: now,
		});

		return { success: true };
	},
});
