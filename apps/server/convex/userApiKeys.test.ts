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

async function seedUser(t: ReturnType<typeof makeConvexTest>, externalId = "ext_1") {
	return t.run(async (ctx) =>
		ctx.db.insert("users", {
			externalId,
			email: `${externalId}@test.com`,
			name: "User",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

describe("userApiKeys", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("saveOpenRouterKey", () => {
		test("saves encrypted key successfully", async () => {
			const externalId = "ext_save_2";
			const userId = await seedUser(t, externalId);

			const result = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.saveOpenRouterKey, {
					userId,
					encryptedKey: "encrypted_openrouter_key_abc",
				});

			expect(result.success).toBe(true);

			const user = await t.run(async (ctx) => ctx.db.get(userId));
			expect(user?.encryptedOpenRouterKey).toBe("encrypted_openrouter_key_abc");
		});

		test("requires authentication", async () => {
			const externalId = "ext_save_3";
			const userId = await seedUser(t, externalId);
			const otherExternalId = "ext_other_3";
			await seedUser(t, otherExternalId);

			await expect(
				t.withIdentity({ subject: otherExternalId }).mutation(
					api.userApiKeys.saveOpenRouterKey,
					{
						userId,
						encryptedKey: "hacked_key",
					},
				),
			).rejects.toThrow("Unauthorized");
		});
	});

	describe("getOpenRouterKey", () => {
		test("returns null when no key is stored", async () => {
			const externalId = "ext_get_1";
			const userId = await seedUser(t, externalId);

			const key = await t
				.withIdentity({ subject: externalId })
				.query(api.userApiKeys.getOpenRouterKey, { userId });

			expect(key).toBeNull();
		});

		test("returns stored key", async () => {
			const externalId = "ext_get_2";
			const userId = await seedUser(t, externalId);

			await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.saveOpenRouterKey, {
					userId,
					encryptedKey: "stored_key_xyz",
				});

			const key = await t
				.withIdentity({ subject: externalId })
				.query(api.userApiKeys.getOpenRouterKey, { userId });

			expect(key).toBe("stored_key_xyz");
		});

		test("requires auth — wrong user cannot read key", async () => {
			const externalId = "ext_get_3";
			const userId = await seedUser(t, externalId);
			const otherExternalId = "ext_get_other_3";
			await seedUser(t, otherExternalId);

			await expect(
				t
					.withIdentity({ subject: otherExternalId })
					.query(api.userApiKeys.getOpenRouterKey, { userId }),
			).rejects.toThrow("Unauthorized");
		});
	});

	describe("hasOpenRouterKey", () => {
		test("returns false when no key stored", async () => {
			const externalId = "ext_has_1";
			const userId = await seedUser(t, externalId);

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userApiKeys.hasOpenRouterKey, { userId });

			expect(result).toBe(false);
		});

		test("returns true when key is stored", async () => {
			const externalId = "ext_has_2";
			const userId = await seedUser(t, externalId);

			await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.saveOpenRouterKey, {
					userId,
					encryptedKey: "some_key",
				});

			const result = await t
				.withIdentity({ subject: externalId })
				.query(api.userApiKeys.hasOpenRouterKey, { userId });

			expect(result).toBe(true);
		});
	});

	describe("removeOpenRouterKey", () => {
		test("removes key from user", async () => {
			const externalId = "ext_remove_1";
			const userId = await seedUser(t, externalId);

			await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.saveOpenRouterKey, {
					userId,
					encryptedKey: "key_to_remove",
				});

			const result = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.removeOpenRouterKey, { userId });

			expect(result.success).toBe(true);

			const user = await t.run(async (ctx) => ctx.db.get(userId));
			expect(user?.encryptedOpenRouterKey).toBeUndefined();
		});

		test("succeeds even when no key was set", async () => {
			const externalId = "ext_remove_2";
			const userId = await seedUser(t, externalId);

			const result = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.removeOpenRouterKey, { userId });

			expect(result.success).toBe(true);
		});

		test("requires auth — wrong user cannot remove key", async () => {
			const externalId = "ext_remove_3";
			const userId = await seedUser(t, externalId);
			const otherExternalId = "ext_remove_other_3";
			await seedUser(t, otherExternalId);

			await expect(
				t
					.withIdentity({ subject: otherExternalId })
					.mutation(api.userApiKeys.removeOpenRouterKey, { userId }),
			).rejects.toThrow("Unauthorized");
		});
	});

	describe("getOpenRouterKeyInternal", () => {
		test("returns null when no key stored", async () => {
			const externalId = "ext_internal_1";
			const userId = await seedUser(t, externalId);

			const key = await t.run(async (ctx) =>
				ctx.runQuery(internal.userApiKeys.getOpenRouterKeyInternal, { userId }),
			);

			expect(key).toBeNull();
		});

		test("returns stored key without auth check", async () => {
			const externalId = "ext_internal_2";
			const userId = await seedUser(t, externalId);

			await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.saveOpenRouterKey, {
					userId,
					encryptedKey: "internal_key",
				});

			const key = await t.run(async (ctx) =>
				ctx.runQuery(internal.userApiKeys.getOpenRouterKeyInternal, { userId }),
			);

			expect(key).toBe("internal_key");
		});

		test("returns key via internal query API (no auth required)", async () => {
			const externalId = "ext_internal_3";
			const userId = await seedUser(t, externalId);

			await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.saveOpenRouterKey, {
					userId,
					encryptedKey: "key_via_internal_api",
				});

			const key = await t.query(internal.userApiKeys.getOpenRouterKeyInternal, { userId });

			expect(key).toBe("key_via_internal_api");
		});

		test("falls back to user table when profile has no key", async () => {
			const userId = await t.run(async (ctx) => {
				const uid = await ctx.db.insert("users", {
					externalId: "ext_internal_fallback",
					encryptedOpenRouterKey: "user-table-only-key",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await ctx.db.insert("profiles", {
					userId: uid,
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				return uid;
			});

			const key = await t.query(internal.userApiKeys.getOpenRouterKeyInternal, { userId });

			expect(key).toBe("user-table-only-key");
		});
	});

	describe("getOpenRouterKey — profile fallback paths", () => {
		test("falls back to user table when profile exists but has no key", async () => {
			const userId = await t.run(async (ctx) => {
				const uid = await ctx.db.insert("users", {
					externalId: "ext_fallback_1",
					encryptedOpenRouterKey: "user-table-key",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await ctx.db.insert("profiles", {
					userId: uid,
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				return uid;
			});

			const key = await t
				.withIdentity({ subject: "ext_fallback_1" })
				.query(api.userApiKeys.getOpenRouterKey, { userId });

			expect(key).toBe("user-table-key");
		});
	});

	describe("hasOpenRouterKey — profile fallback paths", () => {
		test("returns true when only user table has key (no profile key)", async () => {
			const userId = await t.run(async (ctx) => {
				const uid = await ctx.db.insert("users", {
					externalId: "ext_has_fallback",
					encryptedOpenRouterKey: "user-table-key",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await ctx.db.insert("profiles", {
					userId: uid,
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				return uid;
			});

			const result = await t
				.withIdentity({ subject: "ext_has_fallback" })
				.query(api.userApiKeys.hasOpenRouterKey, { userId });

			expect(result).toBe(true);
		});

		test("returns false when neither profile nor user table has key", async () => {
			const userId = await t.run(async (ctx) => {
				const uid = await ctx.db.insert("users", {
					externalId: "ext_has_neither",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await ctx.db.insert("profiles", {
					userId: uid,
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				return uid;
			});

			const result = await t
				.withIdentity({ subject: "ext_has_neither" })
				.query(api.userApiKeys.hasOpenRouterKey, { userId });

			expect(result).toBe(false);
		});
	});

	describe("removeOpenRouterKey — profile removal", () => {
		test("removes key from existing profile", async () => {
			const externalId = "ext_remove_profile";
			const userId = await t.run(async (ctx) => {
				const uid = await ctx.db.insert("users", {
					externalId,
					encryptedOpenRouterKey: "to-remove",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await ctx.db.insert("profiles", {
					userId: uid,
					encryptedOpenRouterKey: "to-remove",
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				return uid;
			});

			const result = await t
				.withIdentity({ subject: externalId })
				.mutation(api.userApiKeys.removeOpenRouterKey, { userId });

			expect(result.success).toBe(true);

			const profile = await t.run(async (ctx) =>
				ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
			);
			expect(profile?.encryptedOpenRouterKey).toBeUndefined();
		});
	});
});
