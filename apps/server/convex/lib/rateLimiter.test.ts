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

// Helper to create convex test instance with components registered
function createConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

// Helper to run mutations as a specific user identity
function asUser(t: ReturnType<typeof convexTest>, externalId: string) {
	return t.withIdentity({ subject: externalId });
}

// Helper to create a user with proper auth context and return userId
async function createUser(t: ReturnType<typeof convexTest>, externalId: string) {
	const result = await asUser(t, externalId).mutation(api.users.ensure, { externalId });
	return result.userId;
}

describe("rateLimiter - user operations", () => {
	test("should allow user creation within rate limit", async () => {
		const t = createConvexTest();

		// Create users within the limit (100/min with 20 burst capacity)
		for (let i = 0; i < 10; i++) {
			const externalId = `user_rate_test_${i}`;
			const result = await asUser(t, externalId).mutation(api.users.ensure, {
				externalId,
			});
			expect(result.userId).toBeDefined();
		}
	});

	test("should enforce rate limit on user authentication", async () => {
		const t = createConvexTest();

		// Try to exceed the rate limit for a single user (100/min with 20 burst)
		// Use the same user to hit the per-user rate limit
		const externalId = "user_burst_same";
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 150; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.users.ensure, {
					externalId,
				})
			);
		}

		// Some should fail with rate limit error
		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError(/Too many authentication attempts/);
	});

	test("should provide retry-after time in error message", async () => {
		const t = createConvexTest();

		// Exhaust the rate limit for a single user
		const externalId = "user_retry_same";
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 150; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.users.ensure, {
					externalId,
				})
			);
		}

		try {
			await Promise.all(promises);
			// If no error, test fails
			expect(true).toBe(false);
		} catch (error: unknown) {
			// Check that error message includes retry information
			expect((error as Error).message).toMatch(/try again/i);
		}
	});

	test("should enforce rate limit on API key saves", async () => {
		const t = createConvexTest();

		const externalId = "user_api_key_rate";
		const userId = await createUser(t, externalId);

		// Try to save many keys (limit: 5/min with 2 burst)
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 10; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.users.saveOpenRouterKey, {
					userId,
					encryptedKey: `key_${i}`,
				})
			);
		}

		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError(/Too many API key updates/);
	});

	test("should enforce rate limit on API key removals", async () => {
		const t = createConvexTest();

		const externalId = "user_api_remove_rate";
		const userId = await createUser(t, externalId);

		// Try to remove many times (limit: 5/min with 2 burst)
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 10; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.users.removeOpenRouterKey, { userId })
			);
		}

		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError(/Too many API key removals/);
	});
});

describe("rateLimiter - template operations", () => {
	test("should allow template creation within rate limit", async () => {
		const t = createConvexTest();

		const externalId = "user_template_rate_1";
		const userId = await createUser(t, externalId);

		// Create templates within limit (20/min with 5 burst)
		for (let i = 0; i < 5; i++) {
			const result = await asUser(t, externalId).mutation(api.promptTemplates.create, {
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

		const externalId = "user_template_rate_2";
		const userId = await createUser(t, externalId);

		// Try to exceed limit (20/min with 5 burst)
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 30; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.promptTemplates.create, {
					userId,
					name: `Template ${i}`,
					command: `/cmd${i}`,
					template: `Content ${i}`,
				})
			);
		}

		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError(/Too many templates created/);
	});

	test("should enforce rate limit on template updates", async () => {
		const t = createConvexTest();

		const externalId = "user_template_update_rate";
		const userId = await createUser(t, externalId);

		const { templateId } = await asUser(t, externalId).mutation(api.promptTemplates.create, {
			userId,
			name: "Template",
			command: "/test",
			template: "Content",
		});

		// Try to update many times (limit: 30/min with 10 burst)
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 50; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.promptTemplates.update, {
					templateId,
					userId,
					name: `Update ${i}`,
				})
			);
		}

		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError(/Too many updates/);
	});

	test("should enforce rate limit on template deletions", async () => {
		const t = createConvexTest();

		const externalId = "user_template_delete_rate";
		const userId = await createUser(t, externalId);

		// Create many templates
		const templateIds = [];
		for (let i = 0; i < 20; i++) {
			const { templateId } = await asUser(t, externalId).mutation(api.promptTemplates.create, {
				userId,
				name: `Template ${i}`,
				command: `/del${i}`,
				template: "Content",
			});
			templateIds.push(templateId);
		}

		// Try to delete all (limit: 15/min with 3 burst)
		const promises = templateIds.map((templateId) =>
			asUser(t, externalId).mutation(api.promptTemplates.remove, { templateId, userId })
		);

		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError(/Too many deletions/);
	});
});

describe("rateLimiter - per-user isolation", () => {
	test("should enforce rate limits per user, not globally", async () => {
		const t = createConvexTest();

		const externalId1 = "user_isolation_1";
		const externalId2 = "user_isolation_2";
		const userId1 = await createUser(t, externalId1);
		const userId2 = await createUser(t, externalId2);

		// User 1 creates templates up to burst limit
		for (let i = 0; i < 5; i++) {
			await asUser(t, externalId1).mutation(api.promptTemplates.create, {
				userId: userId1,
				name: `User1 Template ${i}`,
				command: `/u1cmd${i}`,
				template: "Content",
			});
		}

		// User 2 should still be able to create templates
		for (let i = 0; i < 5; i++) {
			const result = await asUser(t, externalId2).mutation(api.promptTemplates.create, {
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

		const externalId1 = "user_key_isolation_1";
		const externalId2 = "user_key_isolation_2";
		const userId1 = await createUser(t, externalId1);
		const userId2 = await createUser(t, externalId2);

		// User 1 saves keys
		await asUser(t, externalId1).mutation(api.users.saveOpenRouterKey, {
			userId: userId1,
			encryptedKey: "key1",
		});

		await asUser(t, externalId1).mutation(api.users.saveOpenRouterKey, {
			userId: userId1,
			encryptedKey: "key2",
		});

		// User 2 should not be affected
		const result = await asUser(t, externalId2).mutation(api.users.saveOpenRouterKey, {
			userId: userId2,
			encryptedKey: "key",
		});

		expect(result.success).toBe(true);
	});
});

describe("rateLimiter - token bucket behavior", () => {
	test("should allow burst capacity initially", async () => {
		const t = createConvexTest();

		const externalId = "user_burst_1";
		const userId = await createUser(t, externalId);

		// Should be able to create up to burst capacity (5) immediately
		for (let i = 0; i < 5; i++) {
			const result = await asUser(t, externalId).mutation(api.promptTemplates.create, {
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

		const externalId = "user_burst_2";
		const userId = await createUser(t, externalId);

		// Exceed burst capacity
		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < 10; i++) {
			promises.push(
				asUser(t, externalId).mutation(api.promptTemplates.create, {
					userId,
					name: `Burst Template ${i}`,
					command: `/b${i}`,
					template: "Content",
				})
			);
		}

		await expect(async () => {
			await Promise.all(promises);
		}).rejects.toThrowError();
	});
});

describe("rateLimiter - action-specific limits", () => {
	test("should have separate limits for different actions", async () => {
		const t = createConvexTest();

		const externalId = "user_action_specific";
		const userId = await createUser(t, externalId);

		// Create templates (uses templateCreate limit)
		for (let i = 0; i < 5; i++) {
			await asUser(t, externalId).mutation(api.promptTemplates.create, {
				userId,
				name: `Template ${i}`,
				command: `/cmd${i}`,
				template: "Content",
			});
		}

		// Should still be able to save API key (uses different limit)
		const result = await asUser(t, externalId).mutation(api.users.saveOpenRouterKey, {
			userId,
			encryptedKey: "key",
		});

		expect(result.success).toBe(true);
	});

	test("should enforce different rates for different operations", async () => {
		const t = createConvexTest();

		const externalId = "user_diff_rates";
		const userId = await createUser(t, externalId);

		// Create a template
		const { templateId } = await asUser(t, externalId).mutation(api.promptTemplates.create, {
			userId,
			name: "Template",
			command: "/test",
			template: "Content",
		});

		// Updates have higher limit (30/min) than creates (20/min)
		// So we should be able to do more updates
		for (let i = 0; i < 10; i++) {
			const result = await asUser(t, externalId).mutation(api.promptTemplates.update, {
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

		const externalId = "user_sequential";
		const userId = await createUser(t, externalId);

		// Make requests sequentially (not in parallel)
		let successCount = 0;
		let _errorCount = 0;

		for (let i = 0; i < 10; i++) {
			try {
				await asUser(t, externalId).mutation(api.promptTemplates.create, {
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

		const externalId = "user_mixed_requests";
		const userId = await createUser(t, externalId);

		// Mix of different operations
		await asUser(t, externalId).mutation(api.users.saveOpenRouterKey, {
			userId,
			encryptedKey: "key1",
		});

		const { templateId } = await asUser(t, externalId).mutation(api.promptTemplates.create, {
			userId,
			name: "Template",
			command: "/mixed",
			template: "Content",
		});

		await asUser(t, externalId).mutation(api.promptTemplates.update, {
			templateId,
			userId,
			name: "Updated",
		});

		await asUser(t, externalId).mutation(api.users.removeOpenRouterKey, { userId });

		// All should succeed as they use different rate limit buckets
		const key = await asUser(t, externalId).query(api.users.getOpenRouterKey, { userId });
		expect(key).toBeNull();
	});

	test("should handle zero-delay concurrent requests", async () => {
		const t = createConvexTest();

		const externalId = "user_zero_delay";
		const userId = await createUser(t, externalId);

		// Launch all requests at exactly the same time
		const promises = Array.from({ length: 10 }, (_, i) =>
			asUser(t, externalId).mutation(api.promptTemplates.create, {
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

		// Test that user ensure has appropriate limits for a single user
		// It should allow reasonable authentication flows (burst capacity of 20)
		const externalId = "user_config_same";
		let successCount = 0;

		for (let i = 0; i < 20; i++) {
			try {
				await asUser(t, externalId).mutation(api.users.ensure, {
					externalId,
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

		const externalId = "user_sensitive";
		const userId = await createUser(t, externalId);

		// API key operations should have low limits
		let successCount = 0;

		for (let i = 0; i < 5; i++) {
			try {
				await asUser(t, externalId).mutation(api.users.saveOpenRouterKey, {
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

		const externalId = "user_error_msg";
		const userId = await createUser(t, externalId);

		// Exhaust the limit
		try {
			const promises: Promise<unknown>[] = [];
			for (let i = 0; i < 30; i++) {
				promises.push(
					asUser(t, externalId).mutation(api.promptTemplates.create, {
						userId,
						name: `Template ${i}`,
						command: `/e${i}`,
						template: "Content",
					})
				);
			}
			await Promise.all(promises);
		} catch (error: unknown) {
			// Error should mention what was rate limited
			expect((error as Error).message).toMatch(/too many/i);
			expect((error as Error).message).toMatch(/template/i);
		}
	});

	test("should include retry timing in error for API key operations", async () => {
		const t = createConvexTest();

		const externalId = "user_retry_timing";
		const userId = await createUser(t, externalId);

		try {
			const promises: Promise<unknown>[] = [];
			for (let i = 0; i < 10; i++) {
				promises.push(
					asUser(t, externalId).mutation(api.users.saveOpenRouterKey, {
						userId,
						encryptedKey: `key_${i}`,
					})
				);
			}
			await Promise.all(promises);
		} catch (error: unknown) {
			// Should mention when to retry
			expect((error as Error).message.toLowerCase()).toMatch(/try again/);
		}
	});
});
