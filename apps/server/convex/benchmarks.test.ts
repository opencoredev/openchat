import { describe, it, expect, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { modules, rateLimiter } from './testSetup.test';

function createConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

const sampleBenchmark = {
	openRouterModelId: 'openai/gpt-4o',
	aaSlug: 'gpt-4o',
	aaCreatorName: 'OpenAI',
	intelligenceIndex: 90.5,
	codingIndex: 85.0,
	mathIndex: 80.0,
	lastUpdated: Date.now(),
};

describe('benchmarks.getAllBenchmarks', () => {
	let t: ReturnType<typeof createConvexTest>;

	beforeEach(() => {
		t = createConvexTest();
	});

	it('should return empty benchmarks when none exist', async () => {
		const result = await t.query(api.benchmarks.getAllBenchmarks, {});

		expect(result.benchmarks).toEqual([]);
		expect([null, '_end_cursor']).toContain(result.nextCursor);
	});

	it('should return all benchmarks without cursor', async () => {
		await t.run(async (ctx) => {
			await ctx.db.insert('benchmarks', sampleBenchmark);
			await ctx.db.insert('benchmarks', {
				openRouterModelId: 'anthropic/claude-3-5-sonnet',
				aaSlug: 'claude-3-5-sonnet',
				aaCreatorName: 'Anthropic',
				intelligenceIndex: 92.0,
				lastUpdated: Date.now(),
			});
		});

		const result = await t.query(api.benchmarks.getAllBenchmarks, {});

		expect(result.benchmarks.length).toBe(2);
		expect(result.benchmarks[0]).toHaveProperty('_id');
		expect(result.benchmarks[0]).toHaveProperty('_creationTime');
		expect(result.benchmarks[0]).toHaveProperty('openRouterModelId');
	});

	it('should respect custom limit', async () => {
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await ctx.db.insert('benchmarks', {
					openRouterModelId: `model-${i}`,
					aaSlug: `slug-${i}`,
					aaCreatorName: 'Creator',
					lastUpdated: Date.now() + i,
				});
			}
		});

		const result = await t.query(api.benchmarks.getAllBenchmarks, { limit: 3 });

		expect(result.benchmarks.length).toBe(3);
		expect(result.nextCursor).toBeTruthy();
	});

	it('should support pagination with cursor', async () => {
		await t.run(async (ctx) => {
			for (let i = 0; i < 6; i++) {
				await ctx.db.insert('benchmarks', {
					openRouterModelId: `model-${i}`,
					aaSlug: `slug-${i}`,
					aaCreatorName: 'Creator',
					lastUpdated: Date.now() + i,
				});
			}
		});

		const firstPage = await t.query(api.benchmarks.getAllBenchmarks, { limit: 4 });
		expect(firstPage.benchmarks.length).toBe(4);
		expect(firstPage.nextCursor).toBeTruthy();

		const secondPage = await t.query(api.benchmarks.getAllBenchmarks, {
			limit: 4,
			cursor: firstPage.nextCursor ?? undefined,
		});
		expect(secondPage.benchmarks.length).toBe(2);
	});

	it('should enforce maximum limit of 500', async () => {
		const result = await t.query(api.benchmarks.getAllBenchmarks, { limit: 9999 });
		expect(result).toBeDefined();
		expect(result.benchmarks).toEqual([]);
	});

	it('should handle invalid limit (negative)', async () => {
		const result = await t.query(api.benchmarks.getAllBenchmarks, { limit: -5 });
		expect(result).toBeDefined();
	});

	it('should handle invalid limit (zero)', async () => {
		const result = await t.query(api.benchmarks.getAllBenchmarks, { limit: 0 });
		expect(result).toBeDefined();
	});

	it('should return null/end nextCursor when all results fetched', async () => {
		await t.run(async (ctx) => {
			await ctx.db.insert('benchmarks', sampleBenchmark);
		});

		const result = await t.query(api.benchmarks.getAllBenchmarks, { limit: 10 });

		expect(result.benchmarks.length).toBe(1);
		expect([null, '_end_cursor']).toContain(result.nextCursor);
	});

	it('should return correct shape with nextCursor field', async () => {
		const result = await t.query(api.benchmarks.getAllBenchmarks, {});

		expect(result).toHaveProperty('benchmarks');
		expect(result).toHaveProperty('nextCursor');
		expect(Array.isArray(result.benchmarks)).toBe(true);
	});
});
