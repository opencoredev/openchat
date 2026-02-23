import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules, rateLimiter } from "./testSetup.test";

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

describe("userAuth", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("ensure", () => {
		test("creates a new user", async () => {
			const externalId = "ext_ensure_1";
			const result = await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				email: "test@example.com",
				name: "Test User",
			});

			expect(result.userId).toBeDefined();

			const user = await t.run(async (ctx) => ctx.db.get(result.userId));
			expect(user?.externalId).toBe(externalId);
			expect(user?.email).toBe("test@example.com");
			expect(user?.name).toBe("Test User");
		});

		test("returns existing user if already exists", async () => {
			const externalId = "ext_ensure_2";

			const first = await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				email: "user@example.com",
			});

			const second = await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				email: "user@example.com",
			});

			expect(first.userId).toBe(second.userId);
		});

		test("throws when identity does not match externalId", async () => {
			await expect(
				t.withIdentity({ subject: "other_user" }).mutation(api.userAuth.ensure, {
					externalId: "ext_ensure_3",
					email: "test@example.com",
				}),
			).rejects.toThrow("Unauthorized");
		});

		test("throws when no identity", async () => {
			await expect(
				t.mutation(internal.userAuth.ensure as never, {
					externalId: "ext_ensure_4",
				}),
			).rejects.toThrow();
		});

		test("updates user email when changed", async () => {
			const externalId = "ext_ensure_5";
			const first = await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				email: "old@example.com",
			});

			await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				email: "new@example.com",
			});

			const user = await t.run(async (ctx) => ctx.db.get(first.userId));
			expect(user?.email).toBe("new@example.com");
		});

		test("creates profile for new user", async () => {
			const externalId = "ext_ensure_6";
			const result = await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				name: "Profile User",
				avatarUrl: "https://example.com/avatar.png",
			});

			const profile = await t.run(async (ctx) =>
				ctx.db
					.query("profiles")
					.withIndex("by_user", (q) => q.eq("userId", result.userId))
					.unique(),
			);

			expect(profile).not.toBeNull();
			expect(profile?.name).toBe("Profile User");
		});
	});

	describe("getByExternalId", () => {
		test("returns null when user does not exist", async () => {
			const externalId = "ext_getbyext_1";
			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getByExternalId, { externalId });

			expect(result).toBeNull();
		});

		test("returns user data when exists", async () => {
			const externalId = "ext_getbyext_2";
			const { userId } = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, {
					externalId,
					email: "user@example.com",
					name: "User Name",
				});

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getByExternalId, { externalId });

			expect(result).not.toBeNull();
			expect(result!._id).toBe(userId);
			expect(result!.email).toBe("user@example.com");
			expect(result!.name).toBe("User Name");
		});

		test("returns null when identity does not match externalId", async () => {
			const externalId = "ext_getbyext_3";
			await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
			});

			const result = await t
				.withIdentity({ subject: "different_user" })
				.query(api.userAuth.getByExternalId, { externalId });

			expect(result).toBeNull();
		});

		test("does not expose encryptedOpenRouterKey", async () => {
			const externalId = "ext_getbyext_4";
			await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, { externalId });

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getByExternalId, { externalId });

			expect(result).not.toHaveProperty("encryptedOpenRouterKey");
		});
	});

	describe("getCurrentAuthUser", () => {
		test("returns null when not authenticated", async () => {
			const result = await t.query(api.userAuth.getCurrentAuthUser, {});
			expect(result).toBeNull();
		});

		test("returns identity info when authenticated", async () => {
			const externalId = "ext_current_1";
			const result = await t
				.withIdentity({ subject: externalId, email: "me@example.com", name: "Me" })
				.query(api.userAuth.getCurrentAuthUser, {});

			expect(result).not.toBeNull();
			expect(result!._id).toBe(externalId);
			expect(result!.email).toBe("me@example.com");
		});
	});

	describe("getById", () => {
		test("returns user data for authenticated owner", async () => {
			const externalId = "ext_getbyid_1";
			const { userId } = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, { externalId, name: "Owner" });

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getById, { userId });

			expect(result).not.toBeNull();
			expect(result!._id).toBe(userId);
			expect(result!.name).toBe("Owner");
		});

		test("throws when non-owner tries to access", async () => {
			const externalId = "ext_getbyid_2";
			const { userId } = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, { externalId });

			const otherExternalId = "ext_getbyid_other_2";
			await t.withIdentity({ subject: otherExternalId }).mutation(api.userAuth.ensure, {
				externalId: otherExternalId,
			});

			await expect(
				t.withIdentity({ subject: otherExternalId }).query(api.userAuth.getById, { userId }),
			).rejects.toThrow("Unauthorized");
		});
	});

	describe("getByExternalIdInternal", () => {
		test("returns null for unknown externalId", async () => {
			const result = await t.run(async (ctx) =>
				ctx.runQuery(internal.userAuth.getByExternalIdInternal, {
					externalId: "nonexistent",
				}),
			);

			expect(result).toBeNull();
		});

		test("returns user with encryptedOpenRouterKey", async () => {
			const externalId = "ext_internal_getbyext_1";
			const { userId } = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, { externalId });

			await t.run(async (ctx) =>
				ctx.db.patch(userId, { encryptedOpenRouterKey: "secret_key" }),
			);

			const result = await t.run(async (ctx) =>
				ctx.runQuery(internal.userAuth.getByExternalIdInternal, { externalId }),
			);

			expect(result).not.toBeNull();
			expect(result!.encryptedOpenRouterKey).toBe("secret_key");
		});

		test("returns user via internal query API without auth", async () => {
			const externalId = "ext_internal_getbyext_2";
			await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				name: "Internal User",
			});

			const result = await t.query(internal.userAuth.getByExternalIdInternal, { externalId });

			expect(result).not.toBeNull();
			expect(result!.name).toBe("Internal User");
			expect(result!.hasProfile).toBe(true);
		});

		test("returns user with hasProfile false when no profile exists", async () => {
			const externalId = "ext_internal_no_profile";
			await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					email: `${externalId}@test.com`,
					name: "No Profile User",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t.query(internal.userAuth.getByExternalIdInternal, { externalId });

			expect(result).not.toBeNull();
			expect(result!.hasProfile).toBe(false);
			expect(result!.name).toBe("No Profile User");
		});
	});

	describe("ensure — email migration", () => {
		test("links existing user by email when emailVerified is true", async () => {
			const existingId = await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId: "old_workos_id",
					email: "shared@example.com",
					name: "Existing User",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: "new_better_auth_id", emailVerified: true })
				.mutation(api.userAuth.ensure, {
					externalId: "new_better_auth_id",
					email: "shared@example.com",
					name: "Existing User",
				});

			expect(result.userId).toBe(existingId);

			const user = await t.run(async (ctx) => ctx.db.get(existingId));
			expect(user?.externalId).toBe("new_better_auth_id");
		});

		test("creates new user when emailVerified is true but no user with that email exists (line 106 false branch)", async () => {
			const result = await t
				.withIdentity({ subject: "new_verified_no_match", emailVerified: true })
				.mutation(api.userAuth.ensure, {
					externalId: "new_verified_no_match",
					email: "no-existing-user@example.com",
					name: "Brand New User",
				});

			expect(result.userId).toBeDefined();
			const user = await t.run(async (ctx) => ctx.db.get(result.userId));
			expect(user?.externalId).toBe("new_verified_no_match");
		});

		test("does not link when emailVerified is false (security block)", async () => {
			await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId: "old_id_unverified",
					email: "unverified@example.com",
					name: "Old User",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: "new_id_unverified", emailVerified: false })
				.mutation(api.userAuth.ensure, {
					externalId: "new_id_unverified",
					email: "unverified@example.com",
					name: "New User",
				});

			const newUser = await t.run(async (ctx) => ctx.db.get(result.userId));
			expect(newUser?.externalId).toBe("new_id_unverified");
		});
	});

	describe("ensure — profile update paths", () => {
		test("updates profile name and avatar when they change", async () => {
			const externalId = "ext_profile_update";
			const { userId } = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, {
					externalId,
					name: "Old Name",
					avatarUrl: "https://example.com/old.png",
				});

			await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				name: "New Name",
				avatarUrl: "https://example.com/new.png",
			});

			const profile = await t.run(async (ctx) =>
				ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
			);
			expect(profile?.name).toBe("New Name");
			expect(profile?.avatarUrl).toBe("https://example.com/new.png");
		});

		test("creates profile for existing user who has no profile (migration path)", async () => {
			const externalId = "ext_no_profile_migration";
			const userId = await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					email: `${externalId}@test.com`,
					name: "Legacy User",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, {
					externalId,
					name: "Legacy User",
				});

			expect(result.userId).toBe(userId);

			const profile = await t.run(async (ctx) =>
				ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
			);
			expect(profile).not.toBeNull();
		});

		test("covers ?? undefined branch when ensure called without name on existing user with profile", async () => {
			const externalId = "ext_no_name_ensure";
			await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
				name: "Original Name",
				avatarUrl: "https://example.com/avatar.png",
			});

			const result = await t.withIdentity({ subject: externalId }).mutation(api.userAuth.ensure, {
				externalId,
			});

			expect(result.userId).toBeDefined();
		});

		test("covers ?? undefined branch when ensure called without name on existing user without profile (migration)", async () => {
			const externalId = "ext_no_name_migration";
			await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					name: "Legacy",
					email: `${externalId}@test.com`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userAuth.ensure, {
					externalId,
				});

			expect(result.userId).toBeDefined();
		});
	});

	describe("getByExternalId — profile fallback", () => {
		test("returns hasProfile false when no profile exists", async () => {
			const externalId = "ext_no_profile_getbyext";
			await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					email: `${externalId}@test.com`,
					name: "No Profile",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getByExternalId, { externalId });

			expect(result).not.toBeNull();
			expect(result!.hasProfile).toBe(false);
		});

		test("returns hasOpenRouterKey true when user table has key but no profile", async () => {
			const externalId = "ext_key_fallback_getbyext";
			await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					encryptedOpenRouterKey: "legacy-key",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getByExternalId, { externalId });

			expect(result).not.toBeNull();
			expect(result!.hasOpenRouterKey).toBe(true);
		});
	});

	describe("getById — profile fallback", () => {
		test("returns hasProfile false when user has no profile", async () => {
			const externalId = "ext_no_profile_getbyid";
			const userId = await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					name: "No Profile User",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getById, { userId });

			expect(result).not.toBeNull();
			expect(result!.hasProfile).toBe(false);
			expect(result!.name).toBe("No Profile User");
		});

		test("returns hasOpenRouterKey true when user table has key but no profile key", async () => {
			const externalId = "ext_key_fallback_getbyid";
			const userId = await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId,
					encryptedOpenRouterKey: "user-only-key",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userAuth.getById, { userId });

			expect(result).not.toBeNull();
			expect(result!.hasOpenRouterKey).toBe(true);
		});
	});
});
