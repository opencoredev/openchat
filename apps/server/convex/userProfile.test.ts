/**
 * Comprehensive Tests for User Profile Functions
 *
 * Tests all profile-related operations including:
 * - getFavoriteModels: retrieve user favorites (null vs empty vs set)
 * - toggleFavoriteModel: add/remove models from favorites
 * - setFavoriteModels: bulk-set the favorites list
 * - updateName: update profile and user name with validation
 * - Authorization enforcement (identity required, user ID must match)
 */

import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, rateLimiter } from "./testSetup.test";

let t: ReturnType<typeof makeConvexTest>;

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

beforeEach(() => {
	vi.useFakeTimers();
	t = makeConvexTest();
});

afterEach(() => {
	vi.useRealTimers();
});

async function seedUser(externalId: string): Promise<Id<"users">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			externalId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	});
}

function asUser(externalId: string) {
	return t.withIdentity({ subject: externalId });
}

describe("userProfile.getFavoriteModels", () => {
	test("returns null when no profile exists for the user", async () => {
		const userId = await seedUser("user_fav_no_profile");
		const result = await asUser("user_fav_no_profile").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(result).toBeNull();
	});

	test("returns null when profile exists but favoriteModels is unset", async () => {
		const userId = await seedUser("user_fav_no_field");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await asUser("user_fav_no_field").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(result).toBeNull();
	});

	test("returns favorites array when favoriteModels is set", async () => {
		const userId = await seedUser("user_fav_has_favs");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				favoriteModels: ["gpt-4", "claude-3"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await asUser("user_fav_has_favs").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(result).toEqual(["gpt-4", "claude-3"]);
	});

	test("returns empty array when favorites were explicitly cleared", async () => {
		const userId = await seedUser("user_fav_cleared");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				favoriteModels: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await asUser("user_fav_cleared").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(result).toEqual([]);
	});

	test("throws Unauthorized when called without identity", async () => {
		const userId = await seedUser("user_fav_unauth");
		await expect(
			t.query(api.userProfile.getFavoriteModels, { userId }),
		).rejects.toThrowError(/Unauthorized/);
	});

	test("throws Unauthorized when identity does not match userId", async () => {
		const userId1 = await seedUser("user_fav_cross_1");
		await seedUser("user_fav_cross_2");
		await expect(
			asUser("user_fav_cross_2").query(api.userProfile.getFavoriteModels, {
				userId: userId1,
			}),
		).rejects.toThrowError(/Unauthorized/);
	});
});

describe("userProfile.toggleFavoriteModel", () => {
	test("adds a model when favorites is empty (no profile)", async () => {
		const userId = await seedUser("user_toggle_add");
		const result = await asUser("user_toggle_add").mutation(
			api.userProfile.toggleFavoriteModel,
			{ userId, modelId: "gpt-4" },
		);
		expect(result.isFavorite).toBe(true);
		expect(result.favorites).toEqual(["gpt-4"]);
	});

	test("adds a model when favorites already has entries", async () => {
		const userId = await seedUser("user_toggle_add2");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				favoriteModels: ["gpt-4"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await asUser("user_toggle_add2").mutation(
			api.userProfile.toggleFavoriteModel,
			{ userId, modelId: "claude-3" },
		);
		expect(result.isFavorite).toBe(true);
		expect(result.favorites).toContain("gpt-4");
		expect(result.favorites).toContain("claude-3");
	});

	test("removes a model that is already favorited", async () => {
		const userId = await seedUser("user_toggle_remove");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				favoriteModels: ["gpt-4", "claude-3"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await asUser("user_toggle_remove").mutation(
			api.userProfile.toggleFavoriteModel,
			{ userId, modelId: "gpt-4" },
		);
		expect(result.isFavorite).toBe(false);
		expect(result.favorites).toEqual(["claude-3"]);
	});

	test("returns isFavorite=false after removing the last model", async () => {
		const userId = await seedUser("user_toggle_last");
		await asUser("user_toggle_last").mutation(
			api.userProfile.toggleFavoriteModel,
			{ userId, modelId: "gpt-4" },
		);
		const result = await asUser("user_toggle_last").mutation(
			api.userProfile.toggleFavoriteModel,
			{ userId, modelId: "gpt-4" },
		);
		expect(result.isFavorite).toBe(false);
		expect(result.favorites).toEqual([]);
	});

	test("persists favorites to the database after toggle", async () => {
		const userId = await seedUser("user_toggle_persist");
		await asUser("user_toggle_persist").mutation(
			api.userProfile.toggleFavoriteModel,
			{ userId, modelId: "gemini-pro" },
		);
		const verified = await asUser("user_toggle_persist").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(verified).toContain("gemini-pro");
	});

	test("throws Unauthorized when called without identity", async () => {
		const userId = await seedUser("user_toggle_unauth");
		await expect(
			t.mutation(api.userProfile.toggleFavoriteModel, {
				userId,
				modelId: "gpt-4",
			}),
		).rejects.toThrowError(/Unauthorized/);
	});

	test("throws Unauthorized when identity does not match userId", async () => {
		const userId1 = await seedUser("user_toggle_cross_1");
		await seedUser("user_toggle_cross_2");
		await expect(
			asUser("user_toggle_cross_2").mutation(
				api.userProfile.toggleFavoriteModel,
				{ userId: userId1, modelId: "gpt-4" },
			),
		).rejects.toThrowError(/Unauthorized/);
	});
});

describe("userProfile.setFavoriteModels", () => {
	test("sets favorites to the provided list", async () => {
		const userId = await seedUser("user_set_list");
		const result = await asUser("user_set_list").mutation(
			api.userProfile.setFavoriteModels,
			{ userId, modelIds: ["gpt-4", "claude-3", "gemini-pro"] },
		);
		expect(result.success).toBe(true);

		const favs = await asUser("user_set_list").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(favs).toEqual(["gpt-4", "claude-3", "gemini-pro"]);
	});

	test("replaces an existing favorites list", async () => {
		const userId = await seedUser("user_set_replace");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				favoriteModels: ["gpt-4"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		await asUser("user_set_replace").mutation(
			api.userProfile.setFavoriteModels,
			{ userId, modelIds: ["claude-3"] },
		);
		const favs = await asUser("user_set_replace").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(favs).toEqual(["claude-3"]);
	});

	test("can clear favorites by passing an empty array", async () => {
		const userId = await seedUser("user_set_empty");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				favoriteModels: ["gpt-4"],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		const result = await asUser("user_set_empty").mutation(
			api.userProfile.setFavoriteModels,
			{ userId, modelIds: [] },
		);
		expect(result.success).toBe(true);

		const favs = await asUser("user_set_empty").query(
			api.userProfile.getFavoriteModels,
			{ userId },
		);
		expect(favs).toEqual([]);
	});

	test("creates a profile if one does not exist", async () => {
		const userId = await seedUser("user_set_creates_profile");
		await asUser("user_set_creates_profile").mutation(
			api.userProfile.setFavoriteModels,
			{ userId, modelIds: ["llama-3"] },
		);
		const all = await t.run(async (ctx) => ctx.db.query("profiles").collect());
		const profile = all.find((p) => p.userId === userId);
		expect(profile).toBeDefined();
		expect(profile?.favoriteModels).toEqual(["llama-3"]);
	});

	test("throws Unauthorized when called without identity", async () => {
		const userId = await seedUser("user_set_unauth");
		await expect(
			t.mutation(api.userProfile.setFavoriteModels, {
				userId,
				modelIds: [],
			}),
		).rejects.toThrowError(/Unauthorized/);
	});

	test("throws Unauthorized when identity does not match userId", async () => {
		const userId1 = await seedUser("user_set_cross_1");
		await seedUser("user_set_cross_2");
		await expect(
			asUser("user_set_cross_2").mutation(api.userProfile.setFavoriteModels, {
				userId: userId1,
				modelIds: [],
			}),
		).rejects.toThrowError(/Unauthorized/);
	});
});

describe("userProfile.updateName", () => {
	test("updates name in both profile and user tables", async () => {
		const userId = await seedUser("user_name_both");
		const result = await asUser("user_name_both").mutation(
			api.userProfile.updateName,
			{ userId, name: "Alice" },
		);
		expect(result.success).toBe(true);

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user?.name).toBe("Alice");

		const allProfiles = await t.run(async (ctx) =>
			ctx.db.query("profiles").collect(),
		);
		expect(allProfiles.find((p) => p.userId === userId)?.name).toBe("Alice");
	});

	test("trims leading and trailing whitespace", async () => {
		const userId = await seedUser("user_name_trim");
		await asUser("user_name_trim").mutation(api.userProfile.updateName, {
			userId,
			name: "  Bob  ",
		});
		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user?.name).toBe("Bob");
	});

	test("accepts exactly 100 character name", async () => {
		const userId = await seedUser("user_name_100");
		const result = await asUser("user_name_100").mutation(
			api.userProfile.updateName,
			{ userId, name: "a".repeat(100) },
		);
		expect(result.success).toBe(true);
	});

	test("throws when name is an empty string", async () => {
		const userId = await seedUser("user_name_empty");
		await expect(
			asUser("user_name_empty").mutation(api.userProfile.updateName, {
				userId,
				name: "",
			}),
		).rejects.toThrowError(/between 1 and 100 characters/);
	});

	test("throws when name is only whitespace (trims to empty)", async () => {
		const userId = await seedUser("user_name_spaces");
		await expect(
			asUser("user_name_spaces").mutation(api.userProfile.updateName, {
				userId,
				name: "   ",
			}),
		).rejects.toThrowError(/between 1 and 100 characters/);
	});

	test("throws when name exceeds 100 characters", async () => {
		const userId = await seedUser("user_name_toolong");
		await expect(
			asUser("user_name_toolong").mutation(api.userProfile.updateName, {
				userId,
				name: "a".repeat(101),
			}),
		).rejects.toThrowError(/between 1 and 100 characters/);
	});

	test("creates profile if it does not yet exist", async () => {
		const userId = await seedUser("user_name_new_profile");
		await asUser("user_name_new_profile").mutation(api.userProfile.updateName, {
			userId,
			name: "Charlie",
		});
		const allProfiles = await t.run(async (ctx) =>
			ctx.db.query("profiles").collect(),
		);
		const profile = allProfiles.find((p) => p.userId === userId);
		expect(profile).toBeDefined();
		expect(profile?.name).toBe("Charlie");
	});

	test("updates existing profile when it already exists", async () => {
		const userId = await seedUser("user_name_update_existing");
		await t.run(async (ctx) => {
			await ctx.db.insert("profiles", {
				userId,
				name: "Old Name",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		await asUser("user_name_update_existing").mutation(
			api.userProfile.updateName,
			{ userId, name: "New Name" },
		);
		const allProfiles = await t.run(async (ctx) =>
			ctx.db.query("profiles").collect(),
		);
		expect(allProfiles.find((p) => p.userId === userId)?.name).toBe("New Name");
	});

	test("handles unicode and emoji in names", async () => {
		const userId = await seedUser("user_name_unicode");
		const unicodeName = "测试用户 🚀";
		await asUser("user_name_unicode").mutation(api.userProfile.updateName, {
			userId,
			name: unicodeName,
		});
		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user?.name).toBe(unicodeName);
	});

	test("throws Unauthorized when called without identity", async () => {
		const userId = await seedUser("user_name_no_identity");
		await expect(
			t.mutation(api.userProfile.updateName, { userId, name: "Name" }),
		).rejects.toThrowError(/Unauthorized/);
	});

	test("throws Unauthorized when identity does not match userId", async () => {
		const userId1 = await seedUser("user_name_wrong_user_1");
		await seedUser("user_name_wrong_user_2");
		await expect(
			asUser("user_name_wrong_user_2").mutation(api.userProfile.updateName, {
				userId: userId1,
				name: "Hacked",
			}),
		).rejects.toThrowError(/Unauthorized/);
	});
});
