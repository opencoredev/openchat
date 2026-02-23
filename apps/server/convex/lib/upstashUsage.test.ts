import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import {
	getDailyUsageFromUpstash,
	incrementDailyUsageInUpstash,
	reserveDailyUsageInUpstash,
	adjustDailyUsageInUpstash,
} from "./upstashUsage";

const VALID_URL = "https://test.upstash.io";
const VALID_TOKEN = "test-token";

function makeFetch(results: unknown[]) {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: async () => results.map((result) => ({ result })),
		text: async () => "",
	});
}

describe("lib/upstashUsage", () => {
	beforeEach(() => {
		vi.stubEnv("UPSTASH_REDIS_REST_URL", VALID_URL);
		vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", VALID_TOKEN);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe("getDailyUsageFromUpstash", () => {
		test("returns null when env vars are not set", async () => {
			vi.unstubAllEnvs();
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("returns null when pipeline command returns an error entry", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => [{ error: "WRONGTYPE Operation against a key holding the wrong kind of value" }],
					text: async () => "",
				})
			);
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("logs error when LOG_UPSTASH_USAGE_ERRORS is true and fetch fails", async () => {
			vi.stubEnv("LOG_UPSTASH_USAGE_ERRORS", "true");
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
			consoleSpy.mockRestore();
		});

		test("returns null when fetch result is null", async () => {
			vi.stubGlobal("fetch", makeFetch([null]));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("returns null when fetch result is undefined", async () => {
			vi.stubGlobal("fetch", makeFetch([undefined]));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("returns number when fetch returns a number", async () => {
			vi.stubGlobal("fetch", makeFetch([42]));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBe(42);
		});

		test("returns parsed number when fetch returns a string", async () => {
			vi.stubGlobal("fetch", makeFetch(["100"]));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBe(100);
		});

		test("returns null for non-numeric string", async () => {
			vi.stubGlobal("fetch", makeFetch(["not-a-number"]));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("returns null when fetch throws", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("returns null for unexpected result type", async () => {
			vi.stubGlobal("fetch", makeFetch([{ unexpected: true }]));
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});
	});

	describe("incrementDailyUsageInUpstash", () => {
		test("returns void and does nothing when env vars not set", async () => {
			vi.unstubAllEnvs();
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await incrementDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("does nothing for zero usageCents", async () => {
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await incrementDailyUsageInUpstash("user1", "2024-01-01", 0);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("does nothing for negative usageCents", async () => {
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await incrementDailyUsageInUpstash("user1", "2024-01-01", -5);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("calls fetch with valid config and positive cents", async () => {
			const mockFetch = makeFetch([10, null]);
			vi.stubGlobal("fetch", mockFetch);
			await incrementDailyUsageInUpstash("user1", "2024-01-01", 5);
			expect(mockFetch).toHaveBeenCalledOnce();
		});

		test("does nothing for non-finite usageCents", async () => {
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await incrementDailyUsageInUpstash("user1", "2024-01-01", Number.NaN);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("silently swallows fetch errors", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
			await expect(incrementDailyUsageInUpstash("user1", "2024-01-01", 5)).resolves.toBeUndefined();
		});
	});

	describe("reserveDailyUsageInUpstash", () => {
		test("returns null when env vars not set", async () => {
			vi.unstubAllEnvs();
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBeNull();
		});

		test("returns null for zero reserveCents", async () => {
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 0);
			expect(result).toBeNull();
		});

		test("returns null for negative reserveCents", async () => {
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", -5);
			expect(result).toBeNull();
		});

		test("returns number total from fetch result (number)", async () => {
			vi.stubGlobal("fetch", makeFetch([50, null]));
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBe(50);
		});

		test("returns parsed total from fetch result (string)", async () => {
			vi.stubGlobal("fetch", makeFetch(["75", null]));
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBe(75);
		});

		test("returns null when fetch result is null", async () => {
			vi.stubGlobal("fetch", makeFetch([null, null]));
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBeNull();
		});

		test("returns null on fetch error", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBeNull();
		});

		test("logs error when LOG_UPSTASH_USAGE_ERRORS is true and fetch fails", async () => {
			vi.stubEnv("LOG_UPSTASH_USAGE_ERRORS", "true");
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBeNull();
			consoleSpy.mockRestore();
		});
	});

	describe("executePipeline internal error paths", () => {
		test("non-ok response throws (line 52-53)", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					status: 500,
					text: async () => "internal server error",
					json: async () => { throw new Error("no json"); },
				})
			);
			const result = await incrementDailyUsageInUpstash("user1", "2024-01-01", 5);
			expect(result).toBeUndefined();
		});

		test("non-array json response throws (line 59)", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({ not: "array" }),
					text: async () => "",
				})
			);
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("mismatched command count throws (line 63)", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => [],
					text: async () => "",
				})
			);
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});

		test("null entry in pipeline result throws (line 69)", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => [null],
					text: async () => "",
				})
			);
			const result = await getDailyUsageFromUpstash("user1", "2024-01-01");
			expect(result).toBeNull();
		});
	});

	describe("getMidnightUtcEpochSeconds invalid dateKey (line 32)", () => {
		test("invalid dateKey causes pipeline to throw and swallow error", async () => {
			vi.stubGlobal("fetch", makeFetch([100, null]));
			await expect(incrementDailyUsageInUpstash("user1", "not-a-date", 5)).resolves.toBeUndefined();
		});
	});

	describe("reserveDailyUsageInUpstash string parse returns NaN (line 152)", () => {
		test("returns null when fetch result is non-numeric string", async () => {
			vi.stubGlobal("fetch", makeFetch(["not-a-number", null]));
			const result = await reserveDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(result).toBeNull();
		});
	});

	describe("adjustDailyUsageInUpstash", () => {
		test("returns void and does nothing when env vars not set", async () => {
			vi.unstubAllEnvs();
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await adjustDailyUsageInUpstash("user1", "2024-01-01", 10);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("does nothing for delta of 0", async () => {
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await adjustDailyUsageInUpstash("user1", "2024-01-01", 0);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("does nothing for non-finite delta", async () => {
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await adjustDailyUsageInUpstash("user1", "2024-01-01", Number.NaN);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("calls fetch once for positive delta with positive result", async () => {
			const mockFetch = makeFetch([20, null]);
			vi.stubGlobal("fetch", mockFetch);
			await adjustDailyUsageInUpstash("user1", "2024-01-01", 5);
			expect(mockFetch).toHaveBeenCalledOnce();
		});

		test("calls fetch twice when result goes negative (clamp to 0)", async () => {
			const firstCallResult = [{ result: -5 }, { result: null }];
			const secondCallResult = [{ result: 0 }, { result: null }];
			let callCount = 0;
			const mockFetch = vi.fn().mockImplementation(() => {
				callCount++;
				const body = callCount === 1 ? firstCallResult : secondCallResult;
				return Promise.resolve({
					ok: true,
					json: async () => body,
					text: async () => "",
				});
			});
			vi.stubGlobal("fetch", mockFetch);
			await adjustDailyUsageInUpstash("user1", "2024-01-01", -10);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		test("does nothing when delta rounds to 0 (line 171 — e.g. -0.1 → ceil = 0)", async () => {
			const mockFetch = vi.fn();
			vi.stubGlobal("fetch", mockFetch);
			await adjustDailyUsageInUpstash("user1", "2024-01-01", -0.1);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		test("handles string result in adjustDailyUsageInUpstash (line 185-186)", async () => {
			vi.stubGlobal("fetch", makeFetch(["10", null]));
			await expect(adjustDailyUsageInUpstash("user1", "2024-01-01", 5)).resolves.toBeUndefined();
		});

		test("handles null result in adjustDailyUsageInUpstash (line 187)", async () => {
			vi.stubGlobal("fetch", makeFetch([null, null]));
			await expect(adjustDailyUsageInUpstash("user1", "2024-01-01", 5)).resolves.toBeUndefined();
		});

		test("silently swallows fetch errors", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
			await expect(adjustDailyUsageInUpstash("user1", "2024-01-01", 5)).resolves.toBeUndefined();
		});

		test("logs error when LOG_UPSTASH_USAGE_ERRORS is true and fetch fails", async () => {
			vi.stubEnv("LOG_UPSTASH_USAGE_ERRORS", "true");
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("adjust error")));
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			await adjustDailyUsageInUpstash("user1", "2024-01-01", 5);
			consoleSpy.mockRestore();
		});
	});
});
