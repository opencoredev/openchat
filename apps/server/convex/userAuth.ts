import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { incrementStat, STAT_KEYS } from "./lib/dbStats";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { getProfileByUserId } from "./lib/profiles";
import { createLogger } from "./lib/logger";
import { requireAuthUserId } from "./lib/auth";

const logger = createLogger("userAuth");

const EMAIL_LINK_MIGRATION_DEADLINE_MS = Date.parse("2026-06-01T00:00:00.000Z");

export const ensure = mutation({
	args: {
		externalId: v.string(),
		email: v.optional(v.string()),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
	},
	returns: v.object({ userId: v.id("users") }),
		handler: async (ctx, args) => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity || identity.subject !== args.externalId) {
				throw new Error("Unauthorized");
			}

		const { ok, retryAfter } = await rateLimiter.limit(ctx, "userEnsure", {
			key: identity.subject,
		});

		if (!ok) {
			throwRateLimitError("authentication attempts", retryAfter);
		}

		let existing = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
			.unique();

		const isEmailVerified = identity.emailVerified ?? false;
		if (!existing && args.email && isEmailVerified && Date.now() < EMAIL_LINK_MIGRATION_DEADLINE_MS) {
			const existingByEmail = await ctx.db
				.query("users")
				.withIndex("by_email", (q) => q.eq("email", args.email))
				.first();

			if (existingByEmail) {
				await ctx.db.patch(existingByEmail._id, {
					externalId: args.externalId,
					updatedAt: Date.now(),
				});
				existing = existingByEmail;
				void logger.info("Linked user from WorkOS to Better Auth (email verified)", { email: args.email });
			}
		} else if (!existing && args.email && !isEmailVerified && Date.now() < EMAIL_LINK_MIGRATION_DEADLINE_MS) {
			void logger.warn("Blocked linking for unverified email (potential account takeover attempt)", { email: args.email });
		}

		const now = Date.now();
		if (existing) {
			const needsEmailUpdate = existing.email !== args.email;
			if (needsEmailUpdate) {
				await ctx.db.patch(existing._id, {
					email: args.email ?? undefined,
					updatedAt: now,
				});
			}

			const profile = await getProfileByUserId(ctx, existing._id);
			if (profile) {
				const needsProfileUpdate =
					profile.name !== args.name || profile.avatarUrl !== args.avatarUrl;
				if (needsProfileUpdate) {
					await ctx.db.patch(profile._id, {
						name: args.name ?? undefined,
						avatarUrl: args.avatarUrl ?? undefined,
						updatedAt: now,
					});
				}
			} else {
				await ctx.db.insert("profiles", {
					userId: existing._id,
					name: args.name ?? undefined,
					avatarUrl: args.avatarUrl ?? undefined,
					encryptedOpenRouterKey: existing.encryptedOpenRouterKey,
					fileUploadCount: existing.fileUploadCount ?? 0,
					createdAt: now,
					updatedAt: now,
				});
			}

			const needsUserProfileUpdate =
				existing.name !== args.name || existing.avatarUrl !== args.avatarUrl;
			if (needsUserProfileUpdate) {
				await ctx.db.patch(existing._id, {
					name: args.name ?? undefined,
					avatarUrl: args.avatarUrl ?? undefined,
					updatedAt: now,
				});
			}

			return { userId: existing._id };
		}

		const userId = await ctx.db.insert("users", {
			externalId: args.externalId,
			email: args.email ?? undefined,
			name: args.name ?? undefined,
			avatarUrl: args.avatarUrl ?? undefined,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("profiles", {
			userId,
			name: args.name ?? undefined,
			avatarUrl: args.avatarUrl ?? undefined,
			fileUploadCount: 0,
			createdAt: now,
			updatedAt: now,
		});

		await incrementStat(ctx, STAT_KEYS.USERS_TOTAL);

		return { userId };
	},
});

export const getCurrentAuthUser = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		return {
			_id: identity.subject,
			email: identity.email,
			name: identity.name,
			image: identity.pictureUrl,
		};
	},
});

const userWithProfileDoc = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	externalId: v.string(),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
	encryptedOpenRouterKey: v.optional(v.string()),
	fileUploadCount: v.number(),
	aiUsageCents: v.optional(v.number()),
	aiUsageDate: v.optional(v.string()),
	banned: v.optional(v.boolean()),
	bannedAt: v.optional(v.number()),
	banReason: v.optional(v.string()),
	banExpiresAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
	hasProfile: v.boolean(),
});

const publicUserDoc = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	externalId: v.string(),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
	hasOpenRouterKey: v.boolean(),
	fileUploadCount: v.number(),
	aiUsageCents: v.optional(v.number()),
	aiUsageDate: v.optional(v.string()),
	banned: v.optional(v.boolean()),
	bannedAt: v.optional(v.number()),
	banReason: v.optional(v.string()),
	banExpiresAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
	hasProfile: v.boolean(),
});

export const getByExternalId = query({
	args: {
		externalId: v.string(),
	},
	returns: v.union(publicUserDoc, v.null()),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity || identity.subject !== args.externalId) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
			.unique();

		if (!user) return null;
		const profile = await getProfileByUserId(ctx, user._id);

		return {
			_id: user._id,
			_creationTime: user._creationTime,
			externalId: user.externalId,
			email: user.email,
			name: profile?.name ?? user.name,
			avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
			hasOpenRouterKey: !!(profile?.encryptedOpenRouterKey ?? user.encryptedOpenRouterKey),
			fileUploadCount: profile?.fileUploadCount ?? user.fileUploadCount ?? 0,
			aiUsageCents: user.aiUsageCents,
			aiUsageDate: user.aiUsageDate,
			banned: user.banned,
			bannedAt: user.bannedAt,
			banReason: user.banReason,
			banExpiresAt: user.banExpiresAt,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			hasProfile: profile !== null,
		};
	},
});

export const getByExternalIdInternal = internalQuery({
	args: {
		externalId: v.string(),
	},
	returns: v.union(userWithProfileDoc, v.null()),
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
			.unique();

		if (!user) return null;
		const profile = await getProfileByUserId(ctx, user._id);

		return {
			_id: user._id,
			_creationTime: user._creationTime,
			externalId: user.externalId,
			email: user.email,
			name: profile?.name ?? user.name,
			avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
			encryptedOpenRouterKey: profile?.encryptedOpenRouterKey ?? user.encryptedOpenRouterKey,
			fileUploadCount: profile?.fileUploadCount ?? user.fileUploadCount ?? 0,
			aiUsageCents: user.aiUsageCents,
			aiUsageDate: user.aiUsageDate,
			banned: user.banned,
			bannedAt: user.bannedAt,
			banReason: user.banReason,
			banExpiresAt: user.banExpiresAt,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			hasProfile: profile !== null,
		};
	},
});

export const getById = query({
	args: {
		userId: v.id("users"),
	},
	returns: v.union(publicUserDoc, v.null()),
	handler: async (ctx, args) => {
		const userId = await requireAuthUserId(ctx, args.userId);
		const user = await ctx.db.get(userId);
		if (!user) return null;

		const profile = await getProfileByUserId(ctx, user._id);

		return {
			_id: user._id,
			_creationTime: user._creationTime,
			externalId: user.externalId,
			email: user.email,
			name: profile?.name ?? user.name,
			avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
			hasOpenRouterKey: !!(profile?.encryptedOpenRouterKey ?? user.encryptedOpenRouterKey),
			fileUploadCount: profile?.fileUploadCount ?? user.fileUploadCount ?? 0,
			aiUsageCents: user.aiUsageCents,
			aiUsageDate: user.aiUsageDate,
			banned: user.banned,
			bannedAt: user.bannedAt,
			banReason: user.banReason,
			banExpiresAt: user.banExpiresAt,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			hasProfile: profile !== null,
		};
	},
});
