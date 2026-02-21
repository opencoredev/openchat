import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { incrementStat, STAT_KEYS } from "./lib/dbStats";
import { rateLimiter } from "./lib/rateLimiter";
import { throwRateLimitError } from "./lib/rateLimitUtils";
import { getProfileByUserId } from "./lib/profiles";
import { requireAuthUserId } from "./lib/auth";
import { createLogger } from "./lib/logger";

const logger = createLogger("userAuth");

const EMAIL_LINK_MIGRATION_DEADLINE_MS = Date.parse("2026-06-01T00:00:00.000Z");

// User with profile data (for backwards-compatible responses)
// Includes merged profile data that prefers profile over user during migration
const userWithProfileDoc = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	externalId: v.string(),
	email: v.optional(v.string()),
	// Profile fields (merged from profile or user for migration compatibility)
	name: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
	encryptedOpenRouterKey: v.optional(v.string()),
	fileUploadCount: v.number(),
	aiUsageCents: v.optional(v.number()),
	aiUsageDate: v.optional(v.string()),
	// Ban fields
	banned: v.optional(v.boolean()),
	bannedAt: v.optional(v.number()),
	banReason: v.optional(v.string()),
	banExpiresAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
	// Flag to indicate if profile exists (useful for debugging migration)
	hasProfile: v.boolean(),
});

// Public-safe user DTO — excludes encrypted secrets (e.g. encryptedOpenRouterKey).
// Client-facing queries must use this validator instead of userWithProfileDoc.
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

		// Rate limit user authentication/creation per external ID
		// NOTE: Using externalId (from Better Auth) is safe because:
		// 1. Better Auth already handles brute-force protection at the auth layer
		// 2. Using a global key causes write conflicts under load (all users
		//    compete for the same rate limit row, causing OCC failures)
		// 3. The externalId is verified by Better Auth before reaching this function
			const { ok, retryAfter } = await rateLimiter.limit(ctx, "userEnsure", {
				key: identity.subject,
			});

		if (!ok) {
			throwRateLimitError("authentication attempts", retryAfter);
		}

		// First, check if user exists by externalId (Better Auth user ID)
		let existing = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
			.unique();

		// MIGRATION: Link WorkOS users to Better Auth by email
		// Uses .first() since duplicate emails may exist from prior migrations
		// SECURITY: Only link if the caller's email is verified to prevent account takeover
		// via unverified email registration (see OSS-37)
		const isEmailVerified = identity.emailVerified ?? false;
		if (!existing && args.email && isEmailVerified && Date.now() < EMAIL_LINK_MIGRATION_DEADLINE_MS) {
			const existingByEmail = await ctx.db
				.query("users")
				.withIndex("by_email", (q) => q.eq("email", args.email))
				.first();

			if (existingByEmail) {
				// Update externalId to Better Auth user ID (migration from WorkOS)
				await ctx.db.patch(existingByEmail._id, {
					externalId: args.externalId,
					updatedAt: Date.now(),
				});
				existing = existingByEmail;
				void logger.info("Linked user from WorkOS to Better Auth (email verified)", { email: args.email });
			}
		} else if (!existing && args.email && !isEmailVerified && Date.now() < EMAIL_LINK_MIGRATION_DEADLINE_MS) {
			// Log attempts to link with unverified email for security monitoring
			void logger.warn("Blocked linking for unverified email (potential account takeover attempt)", { email: args.email });
		}

		const now = Date.now();
		if (existing) {
			// Update user email (auth data stays in users table)
			const needsEmailUpdate = args.email !== undefined && existing.email !== args.email;
			if (needsEmailUpdate) {
				await ctx.db.patch(existing._id, {
					email: args.email ?? undefined,
					updatedAt: now,
				});
			}

			// Ensure profile exists and update profile data (name, avatar)
			const profile = await getProfileByUserId(ctx, existing._id);
			if (profile) {
				// Update existing profile if name/avatar changed
				const needsProfileUpdate =
					(args.name !== undefined && profile.name !== args.name) ||
					(args.avatarUrl !== undefined && profile.avatarUrl !== args.avatarUrl);
				if (needsProfileUpdate) {
					await ctx.db.patch(profile._id, {
						name: args.name ?? undefined,
						avatarUrl: args.avatarUrl ?? undefined,
						updatedAt: now,
					});
				}
			} else {
				// Create profile for existing user (migration path)
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

			// Also update user table for backwards compatibility during migration
			const needsUserProfileUpdate =
				(args.name !== undefined && existing.name !== args.name) ||
				(args.avatarUrl !== undefined && existing.avatarUrl !== args.avatarUrl);
			if (needsUserProfileUpdate) {
				await ctx.db.patch(existing._id, {
					name: args.name ?? undefined,
					avatarUrl: args.avatarUrl ?? undefined,
					updatedAt: now,
				});
			}

			return { userId: existing._id };
		}

		// Create new user
		const userId = await ctx.db.insert("users", {
			externalId: args.externalId,
			email: args.email ?? undefined,
			// Keep profile fields in users table for backwards compatibility
			name: args.name ?? undefined,
			avatarUrl: args.avatarUrl ?? undefined,
			createdAt: now,
			updatedAt: now,
		});

		// Create profile for new user
		await ctx.db.insert("profiles", {
			userId,
			name: args.name ?? undefined,
			avatarUrl: args.avatarUrl ?? undefined,
			fileUploadCount: 0,
			createdAt: now,
			updatedAt: now,
		});

		// PERFORMANCE OPTIMIZATION: Update stats counter when creating user
		await incrementStat(ctx, STAT_KEYS.USERS_TOTAL);

		return { userId };
	},
});

/**
 * Get the current authenticated user from Better Auth.
 * This is the primary way to get the current user in the app.
 */
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

		// Get profile data (may not exist during migration)
		const profile = await getProfileByUserId(ctx, user._id);

		// Return merged data with migration fallback
		// NOTE: encryptedOpenRouterKey is intentionally excluded from this public query.
		// Use getByExternalIdInternal for server-side access to encrypted secrets.
		return {
			_id: user._id,
			_creationTime: user._creationTime,
			externalId: user.externalId,
			email: user.email,
			// Profile fields: prefer profile data, fall back to user data for migration
			name: profile?.name ?? user.name,
			avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
			hasOpenRouterKey: !!(profile?.encryptedOpenRouterKey ?? user.encryptedOpenRouterKey),
			fileUploadCount: profile?.fileUploadCount ?? user.fileUploadCount ?? 0,
			aiUsageCents: user.aiUsageCents,
			aiUsageDate: user.aiUsageDate,
			// Ban fields (always from user)
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
			encryptedOpenRouterKey:
				profile?.encryptedOpenRouterKey ?? user.encryptedOpenRouterKey,
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

		// Get profile data (may not exist during migration)
		const profile = await getProfileByUserId(ctx, user._id);

		// Return merged data with migration fallback
		// NOTE: encryptedOpenRouterKey is intentionally excluded from this public query.
		// Use getOpenRouterKeyInternal for server-side access to encrypted secrets.
		return {
			_id: user._id,
			_creationTime: user._creationTime,
			externalId: user.externalId,
			email: user.email,
			// Profile fields: prefer profile data, fall back to user data for migration
			name: profile?.name ?? user.name,
			avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
			hasOpenRouterKey: !!(profile?.encryptedOpenRouterKey ?? user.encryptedOpenRouterKey),
			fileUploadCount: profile?.fileUploadCount ?? user.fileUploadCount ?? 0,
			aiUsageCents: user.aiUsageCents,
			aiUsageDate: user.aiUsageDate,
			// Ban fields (always from user)
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
