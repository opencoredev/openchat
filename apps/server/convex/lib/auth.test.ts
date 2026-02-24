import { describe, expect, it, beforeEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { modules, rateLimiter } from "../testSetup.test";
import { requireAuthUserId, requireAuthUserIdFromAction } from "./auth";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

function asExternalId(t: ReturnType<typeof convexTest>, externalId: string) {
	return t.withIdentity({ subject: externalId });
}

describe("requireAuthUserId", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		t = makeConvexTest();
	});

	it("throws 'Unauthorized' when there is no identity", async () => {
		await expect(
			t.run(async (ctx) => requireAuthUserId(ctx)),
		).rejects.toThrow("Unauthorized");
	});

	it("throws 'User not found' when identity exists but no matching user in DB", async () => {
		await expect(
			asExternalId(t, "nonexistent_user_ext_id").run(async (ctx) =>
				requireAuthUserId(ctx),
			),
		).rejects.toThrow("User not found");
	});

	it("returns the user's _id on success", async () => {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "auth_success_user",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await asExternalId(t, "auth_success_user").run(async (ctx) =>
			requireAuthUserId(ctx),
		);

		expect(result).toBe(userId);
	});

	it("returns the user's _id when expectedUserId matches", async () => {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "auth_match_user",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await asExternalId(t, "auth_match_user").run(async (ctx) =>
			requireAuthUserId(ctx, userId),
		);

		expect(result).toBe(userId);
	});

	it("throws 'Unauthorized' when expectedUserId does not match the authenticated user", async () => {
		await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "auth_mismatch_user",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const otherUserId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "other_user",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		await expect(
			asExternalId(t, "auth_mismatch_user").run(async (ctx) =>
				requireAuthUserId(ctx, otherUserId as Id<"users">),
			),
		).rejects.toThrow("Unauthorized");
	});

	it("works with multiple users in the DB and returns the correct one", async () => {
		await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "user_alpha",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const betaId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "user_beta",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "user_gamma",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await asExternalId(t, "user_beta").run(async (ctx) =>
			requireAuthUserId(ctx),
		);

		expect(result).toBe(betaId);
	});

	it("does not throw when expectedUserId is undefined (no ownership check)", async () => {
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				externalId: "auth_no_expected",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const result = await asExternalId(t, "auth_no_expected").run(async (ctx) =>
			requireAuthUserId(ctx, undefined),
		);

		expect(result).toBe(userId);
	});
});

describe("requireAuthUserIdFromAction", () => {
	function makeCtx(identity: { subject: string } | null, user: { _id: string } | null) {
		return {
			auth: { getUserIdentity: vi.fn().mockResolvedValue(identity) },
			runQuery: vi.fn().mockResolvedValue(user),
		} as unknown as ActionCtx;
	}

	it("throws 'Unauthorized' when there is no identity", async () => {
		const ctx = makeCtx(null, null);
		await expect(requireAuthUserIdFromAction(ctx)).rejects.toThrow("Unauthorized");
	});

	it("throws 'User not found' when identity exists but runQuery returns null", async () => {
		const ctx = makeCtx({ subject: "ext_1" }, null);
		await expect(requireAuthUserIdFromAction(ctx)).rejects.toThrow("User not found");
	});

	it("returns the user _id on success", async () => {
		const ctx = makeCtx({ subject: "ext_1" }, { _id: "uid_1" });
		const result = await requireAuthUserIdFromAction(ctx);
		expect(result).toBe("uid_1");
	});

	it("returns the user _id when expectedUserId matches", async () => {
		const ctx = makeCtx({ subject: "ext_1" }, { _id: "uid_1" });
		const result = await requireAuthUserIdFromAction(ctx, "uid_1" as Id<"users">);
		expect(result).toBe("uid_1");
	});

	it("throws 'Unauthorized' when expectedUserId does not match", async () => {
		const ctx = makeCtx({ subject: "ext_1" }, { _id: "uid_1" });
		await expect(
			requireAuthUserIdFromAction(ctx, "uid_other" as Id<"users">),
		).rejects.toThrow("Unauthorized");
	});

	it("does not throw when expectedUserId is undefined", async () => {
		const ctx = makeCtx({ subject: "ext_1" }, { _id: "uid_1" });
		const result = await requireAuthUserIdFromAction(ctx, undefined);
		expect(result).toBe("uid_1");
	});
});
