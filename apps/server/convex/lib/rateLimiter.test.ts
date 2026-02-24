/**
 * Comprehensive Tests for Rate Limiter
 *
 * Tests the Convex rate limiting implementation including:
 * - Token bucket algorithm behavior
 * - Per-user rate limits
 * - Action-specific rate limits
 * - Rate limit enforcement
 * - Retry-after headers
 * - Rate limit recovery
 * - Concurrent request handling
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { modules, rateLimiter } from '../testSetup.test';
import { formatWaitTime, throwRateLimitError } from "./rateLimitUtils";

// Helper to create convex test instance with components registered
function createConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

// Helper to run mutations as a specific user (same pattern as users.test.ts)
function asUser(t: ReturnType<typeof convexTest>, externalId: string) {
	return t.withIdentity({ subject: externalId });
}

describe("rateLimiter - user operations", () => {
	test("should allow user creation within rate limit", async () => {
		const t = createConvexTest();

		// Create the same user repeatedly within the limit (burst=20)
		for (let i = 0; i < 10; i++) {
			const result = await asUser(t, "user_rate_test").mutation(api.users.ensure, {
				externalId: "user_rate_test",
			});
			expect(result.userId).toBeDefined();
		}
	});

	test("should enforce rate limit on user authentication", async () => {
		const t = createConvexTest();

		// Use the same user repeatedly to exhaust the token bucket (burst=20)
		let rateLimitHit = false;
		for (let i = 0; i < 100; i++) {
			try {
				await asUser(t, "user_burst_same").mutation(api.users.ensure, {
					externalId: "user_burst_same",
				});
			} catch (error: unknown) {
				if ((error as Error).message?.includes("Too many authentication attempts")) {
					rateLimitHit = true;
					break;
				}
				throw error;
			}
		}

		expect(rateLimitHit).toBe(true);
	});

	test("should provide retry-after time in error message", async () => {
		const t = createConvexTest();

		// Exhaust the rate limit using same user
		let caughtError: Error | null = null;
		for (let i = 0; i < 100; i++) {
			try {
				await asUser(t, "user_retry_same").mutation(api.users.ensure, {
					externalId: "user_retry_same",
				});
			} catch (error: unknown) {
				caughtError = error as Error;
				break;
			}
		}

		expect(caughtError).not.toBeNull();
		// Check that error message includes retry information
		expect(caughtError!.message).toMatch(/try again/i);
	});

	test("should enforce rate limit on API key saves", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_api_key_rate");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_api_key_rate",
		});

		// Try to save many keys sequentially (limit: 5/min with 2 burst)
		let rateLimitHit = false;
		for (let i = 0; i < 10; i++) {
			try {
				await userT.mutation(api.users.saveOpenRouterKey, {
					userId,
					encryptedKey: `key_${i}`,
				});
			} catch (error: unknown) {
				if ((error as Error).message?.includes("Too many API key updates")) {
					rateLimitHit = true;
					break;
				}
				throw error;
			}
		}

		expect(rateLimitHit).toBe(true);
	});

	test("should enforce rate limit on API key removals", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_api_remove_rate");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_api_remove_rate",
		});

		// Try to remove many times sequentially (limit: 5/min with 2 burst)
		let rateLimitHit = false;
		for (let i = 0; i < 10; i++) {
			try {
				await userT.mutation(api.users.removeOpenRouterKey, { userId });
			} catch (error: unknown) {
				if ((error as Error).message?.includes("Too many API key removals")) {
					rateLimitHit = true;
					break;
				}
				throw error;
			}
		}

		expect(rateLimitHit).toBe(true);
	});
});

describe("rateLimiter - template operations", () => {
	test("should allow template creation within rate limit", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_template_rate_1");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_template_rate_1",
		});

		// Create templates within limit (burst=5)
		for (let i = 0; i < 5; i++) {
			const result = await userT.mutation(api.promptTemplates.create, {
				userId,
				name: `Template ${i}`,
				command: `/cmd${i}`,
				template: `Content ${i}`,
			});
			expect(result.templateId).toBeDefined();
		}
	});

	test("should enforce rate limit on template creation", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_template_rate_2");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_template_rate_2",
		});

		// Try to exceed limit (burst=5) sequentially
		let rateLimitHit = false;
		for (let i = 0; i < 30; i++) {
			try {
				await userT.mutation(api.promptTemplates.create, {
					userId,
					name: `Template ${i}`,
					command: `/cmd${i}`,
					template: `Content ${i}`,
				});
			} catch (error: unknown) {
				if ((error as Error).message?.includes("Too many templates created")) {
					rateLimitHit = true;
					break;
				}
				throw error;
			}
		}

		expect(rateLimitHit).toBe(true);
	});

	test("should enforce rate limit on template updates", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_template_update_rate");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_template_update_rate",
		});

		// Bypass create rate limit by inserting directly
		const templateId = await t.run(async (ctx) => {
			return await ctx.db.insert("promptTemplates", {
				userId,
				name: "Template",
				command: "/test",
				template: "Content",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		// Try to update many times sequentially (limit: 30/min with 10 burst)
		let rateLimitHit = false;
		for (let i = 0; i < 50; i++) {
			try {
				await userT.mutation(api.promptTemplates.update, {
					templateId,
					userId,
					name: `Update ${i}`,
				});
			} catch (error: unknown) {
				if ((error as Error).message?.includes("Too many updates")) {
					rateLimitHit = true;
					break;
				}
				throw error;
			}
		}

		expect(rateLimitHit).toBe(true);
	});

	test("should enforce rate limit on template deletions", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_template_delete_rate");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_template_delete_rate",
		});

		// Bypass create rate limit by inserting templates directly
		const templateIds: string[] = [];
		for (let i = 0; i < 10; i++) {
			const templateId = await t.run(async (ctx) => {
				return await ctx.db.insert("promptTemplates", {
					userId,
					name: `Template ${i}`,
					command: `/del${i}`,
					template: "Content",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			});
			templateIds.push(templateId);
		}

		// Try to delete all sequentially (limit: 15/min with 3 burst)
		let rateLimitHit = false;
		for (const templateId of templateIds) {
			try {
				await userT.mutation(api.promptTemplates.remove, { templateId, userId });
			} catch (error: unknown) {
				if ((error as Error).message?.includes("Too many deletions")) {
					rateLimitHit = true;
					break;
				}
				throw error;
			}
		}

		expect(rateLimitHit).toBe(true);
	});
});

describe("rateLimiter - per-user isolation", () => {
	test("should enforce rate limits per user, not globally", async () => {
		const t = createConvexTest();

		const user1T = asUser(t, "user_isolation_1");
		const user2T = asUser(t, "user_isolation_2");

		const { userId: userId1 } = await user1T.mutation(api.users.ensure, {
			externalId: "user_isolation_1",
		});

		const { userId: userId2 } = await user2T.mutation(api.users.ensure, {
			externalId: "user_isolation_2",
		});

		// User 1 creates templates up to burst limit (5)
		for (let i = 0; i < 5; i++) {
			await user1T.mutation(api.promptTemplates.create, {
				userId: userId1,
				name: `User1 Template ${i}`,
				command: `/u1cmd${i}`,
				template: "Content",
			});
		}

		// User 2 should still be able to create templates (separate bucket)
		for (let i = 0; i < 5; i++) {
			const result = await user2T.mutation(api.promptTemplates.create, {
				userId: userId2,
				name: `User2 Template ${i}`,
				command: `/u2cmd${i}`,
				template: "Content",
			});
			expect(result.templateId).toBeDefined();
		}
	});

	test("should track API key save limits per user", async () => {
		const t = createConvexTest();

		const user1T = asUser(t, "user_key_isolation_1");
		const user2T = asUser(t, "user_key_isolation_2");

		const { userId: userId1 } = await user1T.mutation(api.users.ensure, {
			externalId: "user_key_isolation_1",
		});

		const { userId: userId2 } = await user2T.mutation(api.users.ensure, {
			externalId: "user_key_isolation_2",
		});

		// User 1 saves keys
		await user1T.mutation(api.users.saveOpenRouterKey, {
			userId: userId1,
			encryptedKey: "key1",
		});

		await user1T.mutation(api.users.saveOpenRouterKey, {
			userId: userId1,
			encryptedKey: "key2",
		});

		// User 2 should not be affected
		const result = await user2T.mutation(api.users.saveOpenRouterKey, {
			userId: userId2,
			encryptedKey: "key",
		});

		expect(result.success).toBe(true);
	});
});

describe("rateLimiter - token bucket behavior", () => {
	test("should allow burst capacity initially", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_burst_1");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_burst_1",
		});

		// Should be able to create up to burst capacity (5) immediately
		for (let i = 0; i < 5; i++) {
			const result = await userT.mutation(api.promptTemplates.create, {
				userId,
				name: `Burst Template ${i}`,
				command: `/burst${i}`,
				template: "Content",
			});
			expect(result.templateId).toBeDefined();
		}
	});

	test("should deny requests exceeding burst capacity", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_burst_2");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_burst_2",
		});

		// Exceed burst capacity (5) sequentially
		let rateLimitHit = false;
		for (let i = 0; i < 10; i++) {
			try {
				await userT.mutation(api.promptTemplates.create, {
					userId,
					name: `Burst Template ${i}`,
					command: `/b${i}`,
					template: "Content",
				});
			} catch (error: unknown) {
				rateLimitHit = true;
				break;
			}
		}

		expect(rateLimitHit).toBe(true);
	});
});

describe("rateLimiter - action-specific limits", () => {
	test("should have separate limits for different actions", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_action_specific");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_action_specific",
		});

		// Create templates (uses templateCreate limit, burst=5)
		for (let i = 0; i < 5; i++) {
			await userT.mutation(api.promptTemplates.create, {
				userId,
				name: `Template ${i}`,
				command: `/cmd${i}`,
				template: "Content",
			});
		}

		// Should still be able to save API key (uses different limit)
		const result = await userT.mutation(api.users.saveOpenRouterKey, {
			userId,
			encryptedKey: "key",
		});

		expect(result.success).toBe(true);
	});

	test("should enforce different rates for different operations", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_diff_rates");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_diff_rates",
		});

		// Bypass create rate limit by inserting directly
		const templateId = await t.run(async (ctx) => {
			return await ctx.db.insert("promptTemplates", {
				userId,
				name: "Template",
				command: "/test",
				template: "Content",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		// Updates have higher limit (30/min with 10 burst)
		// So we should be able to do more updates
		for (let i = 0; i < 10; i++) {
			const result = await userT.mutation(api.promptTemplates.update, {
				templateId,
				userId,
				name: `Update ${i}`,
			});
			expect(result.ok).toBe(true);
		}
	});
});

describe("rateLimiter - edge cases", () => {
	test("should handle rapid sequential requests", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_sequential");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_sequential",
		});

		// Make requests sequentially (not in parallel)
		let successCount = 0;
		let _errorCount = 0;

		for (let i = 0; i < 10; i++) {
			try {
				await userT.mutation(api.promptTemplates.create, {
					userId,
					name: `Sequential ${i}`,
					command: `/seq${i}`,
					template: "Content",
				});
				successCount++;
			} catch {
				_errorCount++;
			}
		}

		// Should have some successes (up to burst capacity)
		expect(successCount).toBeGreaterThan(0);
	});

	test("should handle same user making different types of requests", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_mixed_requests");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_mixed_requests",
		});

		// Mix of different operations
		await userT.mutation(api.users.saveOpenRouterKey, {
			userId,
			encryptedKey: "key1",
		});

		const { templateId } = await userT.mutation(api.promptTemplates.create, {
			userId,
			name: "Template",
			command: "/mixed",
			template: "Content",
		});

		await userT.mutation(api.promptTemplates.update, {
			templateId,
			userId,
			name: "Updated",
		});

		await userT.mutation(api.users.removeOpenRouterKey, { userId });

		// All should succeed as they use different rate limit buckets
		const key = await userT.query(api.users.getOpenRouterKey, { userId });
		expect(key).toBeNull();
	});

	test("should handle zero-delay concurrent requests", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_zero_delay");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_zero_delay",
		});

		// Launch all requests at exactly the same time
		const promises = Array.from({ length: 10 }, (_, i) =>
			userT.mutation(api.promptTemplates.create, {
				userId,
				name: `Concurrent ${i}`,
				command: `/conc${i}`,
				template: "Content",
			})
		);

		// Some should succeed, some should fail
		const results = await Promise.allSettled(promises);

		const successes = results.filter((r) => r.status === "fulfilled");
		const failures = results.filter((r) => r.status === "rejected");

		// Should have both successes (within burst) and failures (exceeding burst)
		expect(successes.length).toBeGreaterThan(0);
		expect(failures.length).toBeGreaterThan(0);
	});
});

describe("rateLimiter - configuration validation", () => {
	test("should have valid rate limit configuration for user operations", async () => {
		const t = createConvexTest();

		// Test that user ensure has appropriate limits
		// It should allow reasonable authentication flows (burst=20)
		let successCount = 0;

		for (let i = 0; i < 20; i++) {
			try {
				await asUser(t, "user_config_same").mutation(api.users.ensure, {
					externalId: "user_config_same",
				});
				successCount++;
			} catch {
				break;
			}
		}

		// Should allow at least burst capacity (20)
		expect(successCount).toBeGreaterThanOrEqual(20);
	});

	test("should have restrictive limits for sensitive operations", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_sensitive");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_sensitive",
		});

		// API key operations should have low limits (burst=2)
		let successCount = 0;

		for (let i = 0; i < 5; i++) {
			try {
				await userT.mutation(api.users.saveOpenRouterKey, {
					userId,
					encryptedKey: `key_${i}`,
				});
				successCount++;
			} catch {
				break;
			}
		}

		// Should allow at least 2 (burst capacity)
		expect(successCount).toBeGreaterThanOrEqual(2);
		// But not too many
		expect(successCount).toBeLessThan(10);
	});
});

describe("rateLimiter - error messages", () => {
	test("should provide helpful error message on rate limit", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_error_msg");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_error_msg",
		});

		// Exhaust the limit sequentially
		let caughtError: Error | null = null;
		for (let i = 0; i < 30; i++) {
			try {
				await userT.mutation(api.promptTemplates.create, {
					userId,
					name: `Template ${i}`,
					command: `/e${i}`,
					template: "Content",
				});
			} catch (error: unknown) {
				caughtError = error as Error;
				break;
			}
		}

		// Error should mention what was rate limited
		expect(caughtError).not.toBeNull();
		expect(caughtError!.message).toMatch(/too many/i);
		expect(caughtError!.message).toMatch(/template/i);
	});

	test("should include retry timing in error for API key operations", async () => {
		const t = createConvexTest();

		const userT = asUser(t, "user_retry_timing");
		const { userId } = await userT.mutation(api.users.ensure, {
			externalId: "user_retry_timing",
		});

		let caughtError: Error | null = null;
		for (let i = 0; i < 10; i++) {
			try {
				await userT.mutation(api.users.saveOpenRouterKey, {
					userId,
					encryptedKey: `key_${i}`,
				});
			} catch (error: unknown) {
				caughtError = error as Error;
				break;
			}
		}

		// Should mention when to retry
		expect(caughtError).not.toBeNull();
		expect(caughtError!.message.toLowerCase()).toMatch(/try again/);
	});
});

describe("rateLimitUtils (pure functions)", () => {
	test("formatWaitTime returns 'in X seconds' when retryAfterMs is provided", () => {
		expect(formatWaitTime(3000)).toBe("in 3 seconds");
		expect(formatWaitTime(1500)).toBe("in 2 seconds");
		expect(formatWaitTime(1000)).toBe("in 1 seconds");
	});

	test("formatWaitTime returns 'later' when retryAfterMs is undefined (line 14)", () => {
		expect(formatWaitTime(undefined)).toBe("later");
	});

	test("throwRateLimitError throws with formatted message", () => {
		expect(() => throwRateLimitError("messages", 5000)).toThrow(
			"Too many messages. Please try again in 5 seconds.",
		);
	});

	test("throwRateLimitError uses 'later' when no retryAfterMs", () => {
		expect(() => throwRateLimitError("requests")).toThrow(
			"Too many requests. Please try again later.",
		);
	});

	test("throwRateLimitError throws an error with name RateLimitError", () => {
		let caught: Error | null = null;
		try {
			throwRateLimitError("test");
		} catch (e) {
			caught = e as Error;
		}
		expect(caught?.name).toBe("RateLimitError");
	});
});
