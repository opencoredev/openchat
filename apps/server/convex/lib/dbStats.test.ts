import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import schema from "../schema";
import { modules, rateLimiter } from "../testSetup.test";
import {
	getStat,
	incrementStat,
	decrementStat,
	setStat,
	getStats,
	STAT_KEYS,
} from "./dbStats";

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

describe("dbStats", () => {
	let t: ReturnType<typeof makeConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getStat", () => {
		test("returns 0 for non-existent key", async () => {
			const val = await t.run(async (ctx) => {
				return getStat(ctx, "nonexistent");
			});
			expect(val).toBe(0);
		});

		test("returns the stored value", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "my_stat", value: 42, updatedAt: Date.now() });
			});
			const val = await t.run(async (ctx) => {
				return getStat(ctx, "my_stat");
			});
			expect(val).toBe(42);
		});
	});

	describe("incrementStat", () => {
		test("creates stat with value 1 when it does not exist", async () => {
			await t.run(async (ctx) => {
				await incrementStat(ctx, "new_stat");
			});
			const val = await t.run(async (ctx) => getStat(ctx, "new_stat"));
			expect(val).toBe(1);
		});

		test("increments existing stat by 1", async () => {
			await t.run(async (ctx) => {
				await incrementStat(ctx, "count");
				await incrementStat(ctx, "count");
				await incrementStat(ctx, "count");
			});
			const val = await t.run(async (ctx) => getStat(ctx, "count"));
			expect(val).toBe(3);
		});

		test("increments by custom amount", async () => {
			await t.run(async (ctx) => {
				await incrementStat(ctx, "cents", 50);
				await incrementStat(ctx, "cents", 30);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "cents"));
			expect(val).toBe(80);
		});

		test("creates stat with custom amount when not existing", async () => {
			await t.run(async (ctx) => {
				await incrementStat(ctx, "big_stat", 100);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "big_stat"));
			expect(val).toBe(100);
		});

		test("does not affect other keys", async () => {
			await t.run(async (ctx) => {
				await incrementStat(ctx, "stat_a", 5);
				await incrementStat(ctx, "stat_b", 10);
			});
			const valA = await t.run(async (ctx) => getStat(ctx, "stat_a"));
			const valB = await t.run(async (ctx) => getStat(ctx, "stat_b"));
			expect(valA).toBe(5);
			expect(valB).toBe(10);
		});
	});

	describe("decrementStat", () => {
		test("creates stat with 0 when it does not exist", async () => {
			await t.run(async (ctx) => {
				await decrementStat(ctx, "missing");
			});
			const val = await t.run(async (ctx) => getStat(ctx, "missing"));
			expect(val).toBe(0);
		});

		test("decrements existing stat by 1", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "x", value: 5, updatedAt: Date.now() });
				await decrementStat(ctx, "x");
			});
			const val = await t.run(async (ctx) => getStat(ctx, "x"));
			expect(val).toBe(4);
		});

		test("decrements by custom amount", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "y", value: 20, updatedAt: Date.now() });
				await decrementStat(ctx, "y", 7);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "y"));
			expect(val).toBe(13);
		});

		test("does not go below 0", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "z", value: 3, updatedAt: Date.now() });
				await decrementStat(ctx, "z", 10);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "z"));
			expect(val).toBe(0);
		});

		test("stays at 0 when already 0", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "zero", value: 0, updatedAt: Date.now() });
				await decrementStat(ctx, "zero");
			});
			const val = await t.run(async (ctx) => getStat(ctx, "zero"));
			expect(val).toBe(0);
		});
	});

	describe("setStat", () => {
		test("creates stat when it does not exist", async () => {
			await t.run(async (ctx) => {
				await setStat(ctx, "fresh", 99);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "fresh"));
			expect(val).toBe(99);
		});

		test("updates existing stat value", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "editable", value: 5, updatedAt: Date.now() });
				await setStat(ctx, "editable", 50);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "editable"));
			expect(val).toBe(50);
		});

		test("sets stat to 0", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "reset", value: 100, updatedAt: Date.now() });
				await setStat(ctx, "reset", 0);
			});
			const val = await t.run(async (ctx) => getStat(ctx, "reset"));
			expect(val).toBe(0);
		});

		test("stores metadata when provided", async () => {
			await t.run(async (ctx) => {
				await setStat(ctx, "with_meta", 7, { description: "test stat", category: "testing" });
			});
			const val = await t.run(async (ctx) => getStat(ctx, "with_meta"));
			expect(val).toBe(7);
		});

		test("updates metadata on existing stat", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "meta_update", value: 1, updatedAt: Date.now() });
				await setStat(ctx, "meta_update", 2, { description: "updated" });
			});
			const val = await t.run(async (ctx) => getStat(ctx, "meta_update"));
			expect(val).toBe(2);
		});
	});

	describe("getStats", () => {
		test("returns 0 for all keys when none exist", async () => {
			const result = await t.run(async (ctx) => {
				return getStats(ctx, ["a", "b", "c"]);
			});
			expect(result).toEqual({ a: 0, b: 0, c: 0 });
		});

		test("returns values for all provided keys", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "x", value: 10, updatedAt: Date.now() });
				await ctx.db.insert("dbStats", { key: "y", value: 20, updatedAt: Date.now() });
			});
			const result = await t.run(async (ctx) => {
				return getStats(ctx, ["x", "y", "z"]);
			});
			expect(result).toEqual({ x: 10, y: 20, z: 0 });
		});

		test("returns empty object for empty keys array", async () => {
			const result = await t.run(async (ctx) => {
				return getStats(ctx, []);
			});
			expect(result).toEqual({});
		});

		test("returns single key", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("dbStats", { key: "solo", value: 42, updatedAt: Date.now() });
			});
			const result = await t.run(async (ctx) => {
				return getStats(ctx, ["solo"]);
			});
			expect(result).toEqual({ solo: 42 });
		});
	});

	describe("STAT_KEYS", () => {
		test("exports expected keys", () => {
			expect(STAT_KEYS.CHATS_TOTAL).toBe("chats_total");
			expect(STAT_KEYS.CHATS_SOFT_DELETED).toBe("chats_soft_deleted");
			expect(STAT_KEYS.MESSAGES_TOTAL).toBe("messages_total");
			expect(STAT_KEYS.MESSAGES_SOFT_DELETED).toBe("messages_soft_deleted");
			expect(STAT_KEYS.USERS_TOTAL).toBe("users_total");
		});

		test("can use STAT_KEYS as stat keys", async () => {
			await t.run(async (ctx) => {
				await incrementStat(ctx, STAT_KEYS.CHATS_TOTAL);
				await incrementStat(ctx, STAT_KEYS.MESSAGES_TOTAL, 5);
			});
			const result = await t.run(async (ctx) => {
				return getStats(ctx, [STAT_KEYS.CHATS_TOTAL, STAT_KEYS.MESSAGES_TOTAL]);
			});
			expect(result[STAT_KEYS.CHATS_TOTAL]).toBe(1);
			expect(result[STAT_KEYS.MESSAGES_TOTAL]).toBe(5);
		});
	});
});
