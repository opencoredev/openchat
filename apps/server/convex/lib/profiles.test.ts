import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import schema from "../schema";
import { modules, rateLimiter } from "../testSetup.test";
import {
	getProfileByUserId,
	getOrCreateProfile,
	updateProfile,
	incrementFileUploadCount,
	getUserWithProfile,
} from "./profiles";

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

async function seedUser(
	t: ReturnType<typeof makeConvexTest>,
	name = "Test User",
	externalId = "ext_1",
) {
	return t.run(async (ctx) =>
		ctx.db.insert("users", {
			externalId,
			email: `${externalId}@test.com`,
			name,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

describe("lib/profiles", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getProfileByUserId", () => {
		test("returns null when no profile exists", async () => {
			const userId = await seedUser(t);
			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result).toBeNull();
		});

		test("returns profile when it exists", async () => {
			const userId = await seedUser(t);
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					name: "Test Profile",
					fileUploadCount: 5,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result).not.toBeNull();
			expect(result?.name).toBe("Test Profile");
			expect(result?.fileUploadCount).toBe(5);
		});
	});

	describe("getOrCreateProfile", () => {
		test("returns existing profile if one exists", async () => {
			const userId = await seedUser(t);
			const profileId = await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					name: "Existing Profile",
					fileUploadCount: 3,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t.run(async (ctx) => getOrCreateProfile(ctx, userId));
			expect(result._id).toBe(profileId);
			expect(result.name).toBe("Existing Profile");
		});

		test("creates profile from user data when none exists", async () => {
			const userId = await seedUser(t, "New User");

			const result = await t.run(async (ctx) => getOrCreateProfile(ctx, userId));
			expect(result).not.toBeNull();
			expect(result.userId).toBe(userId);
			expect(result.name).toBe("New User");
			expect(result.fileUploadCount).toBe(0);
		});

		test("throws when user does not exist", async () => {
			const fakeUserId = "j57fp7q5a3a7qy9kk70fjrq4kh6z6nvq" as Parameters<typeof getOrCreateProfile>[1];

			await expect(
				t.run(async (ctx) => getOrCreateProfile(ctx, fakeUserId)),
			).rejects.toThrow();
		});

		test("copies avatarUrl from user when creating profile", async () => {
			const userId = await t.run(async (ctx) =>
				ctx.db.insert("users", {
					externalId: "ext_av",
					email: "av@test.com",
					name: "Avatar User",
					avatarUrl: "https://example.com/avatar.png",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t.run(async (ctx) => getOrCreateProfile(ctx, userId));
			expect(result.avatarUrl).toBe("https://example.com/avatar.png");
		});
	});

	describe("updateProfile", () => {
		test("updates name field", async () => {
			const userId = await seedUser(t, "Original Name");
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					name: "Original Name",
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			await t.run(async (ctx) => updateProfile(ctx, userId, { name: "Updated Name" }));

			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result?.name).toBe("Updated Name");
		});

		test("throws when profile does not exist", async () => {
			const userId = await seedUser(t);

			await expect(
				t.run(async (ctx) => updateProfile(ctx, userId, { name: "Nope" })),
			).rejects.toThrow("Profile not found");
		});

		test("updates multiple fields at once", async () => {
			const userId = await seedUser(t);
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			await t.run(async (ctx) =>
				updateProfile(ctx, userId, {
					name: "New Name",
					fileUploadCount: 10,
				}),
			);

			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result?.name).toBe("New Name");
			expect(result?.fileUploadCount).toBe(10);
		});

		test("updates updatedAt timestamp", async () => {
			const userId = await seedUser(t);
			vi.setSystemTime(1000);
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					name: "Old",
					fileUploadCount: 0,
					createdAt: 1000,
					updatedAt: 1000,
				}),
			);

			vi.setSystemTime(5000);
			await t.run(async (ctx) => updateProfile(ctx, userId, { name: "New" }));

			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result?.updatedAt).toBe(5000);
		});
	});

	describe("incrementFileUploadCount", () => {
		test("increments from 0 by 1 (default)", async () => {
			const userId = await seedUser(t);
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			await t.run(async (ctx) => incrementFileUploadCount(ctx, userId));

			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result?.fileUploadCount).toBe(1);
		});

		test("increments from existing value", async () => {
			const userId = await seedUser(t);
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					fileUploadCount: 7,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			await t.run(async (ctx) => incrementFileUploadCount(ctx, userId, 3));

			const result = await t.run(async (ctx) => getProfileByUserId(ctx, userId));
			expect(result?.fileUploadCount).toBe(10);
		});

		test("throws when profile does not exist", async () => {
			const userId = await seedUser(t);

			await expect(
				t.run(async (ctx) => incrementFileUploadCount(ctx, userId)),
			).rejects.toThrow("Profile not found");
		});
	});

	describe("getUserWithProfile", () => {
		test("returns null for missing user", async () => {
			const fakeUserId = "j57fp7q5a3a7qy9kk70fjrq4kh6z6nvq" as Parameters<typeof getUserWithProfile>[1];

			const result = await t.run(async (ctx) => getUserWithProfile(ctx, fakeUserId));
			expect(result).toBeNull();
		});

		test("returns user with null profile when no profile exists", async () => {
			const userId = await seedUser(t, "No Profile User");

			const result = await t.run(async (ctx) => getUserWithProfile(ctx, userId));
			expect(result).not.toBeNull();
			expect(result?.user).toBeDefined();
			expect(result?.profile).toBeNull();
		});

		test("returns user and profile when profile exists", async () => {
			const userId = await seedUser(t, "With Profile");
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					name: "Profile Name",
					fileUploadCount: 5,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t.run(async (ctx) => getUserWithProfile(ctx, userId));
			expect(result?.profile).not.toBeNull();
			expect(result?.name).toBe("Profile Name");
			expect(result?.fileUploadCount).toBe(5);
		});

		test("prefers profile name over user name", async () => {
			const userId = await seedUser(t, "User Name");
			await t.run(async (ctx) =>
				ctx.db.insert("profiles", {
					userId,
					name: "Profile Name",
					fileUploadCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}),
			);

			const result = await t.run(async (ctx) => getUserWithProfile(ctx, userId));
			expect(result?.name).toBe("Profile Name");
		});

		test("falls back to user name when no profile", async () => {
			const userId = await seedUser(t, "Fallback User");

			const result = await t.run(async (ctx) => getUserWithProfile(ctx, userId));
			expect(result?.name).toBe("Fallback User");
		});

		test("returns fileUploadCount 0 when no profile and user has no count", async () => {
			const userId = await seedUser(t, "Count User");

			const result = await t.run(async (ctx) => getUserWithProfile(ctx, userId));
			expect(result?.fileUploadCount).toBe(0);
		});
	});
});
