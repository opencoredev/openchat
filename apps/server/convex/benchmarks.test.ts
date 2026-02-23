import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
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
};

const sampleBenchmarkForDb = {
	...sampleBenchmark,
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
			await ctx.db.insert('benchmarks', sampleBenchmarkForDb);
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
			await ctx.db.insert('benchmarks', sampleBenchmarkForDb);
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

describe('benchmarks.fetchAndStoreBenchmarks', () => {
	let t: ReturnType<typeof createConvexTest>;

	beforeEach(() => {
		t = createConvexTest();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('returns early without fetching when ARTIFICIAL_ANALYSIS_API_KEY is not set (line 40)', async () => {
		vi.stubEnv('ARTIFICIAL_ANALYSIS_API_KEY', '');
		const mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);

		await t.action(internal.benchmarks.fetchAndStoreBenchmarks, {});

		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('catches error when OpenRouter fetch fails (line 47-48)', async () => {
		vi.stubEnv('ARTIFICIAL_ANALYSIS_API_KEY', 'fake-aa-key');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
			text: async () => 'service unavailable',
		}));

		await expect(
			t.action(internal.benchmarks.fetchAndStoreBenchmarks, {})
		).resolves.not.toThrow();
	});

	it('catches error when AA models fetch fails (line 60-62)', async () => {
		vi.stubEnv('ARTIFICIAL_ANALYSIS_API_KEY', 'fake-aa-key');
		let callCount = 0;
		vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ data: [{ id: 'openai/gpt-4o' }] }),
				});
			}
			return Promise.resolve({
				ok: false,
				status: 500,
				text: async () => 'internal server error',
			});
		}));

		await expect(
			t.action(internal.benchmarks.fetchAndStoreBenchmarks, {})
		).resolves.not.toThrow();
	});

	it('fetches, matches, and stores benchmarks successfully (lines 45-90)', async () => {
		vi.stubEnv('ARTIFICIAL_ANALYSIS_API_KEY', 'fake-aa-key');
		vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
			if ((url as string).includes('openrouter')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ data: [{ id: 'openai/gpt-4o' }, { id: 'anthropic/claude-3-5-sonnet' }] }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => ({
					data: [
						{
							slug: 'gpt-4o',
							model_creator: { slug: 'openai', name: 'OpenAI' },
							evaluations: {
								artificial_analysis_intelligence_index: 85.0,
								artificial_analysis_coding_index: 80.0,
								artificial_analysis_math_index: 75.0,
								mmlu_pro: 70.0,
								gpqa: 65.0,
								scicode: 60.0,
								livecodebench: 55.0,
								math_500: 50.0,
								aime: 45.0,
							},
						},
						{
							slug: 'no-match-model',
							model_creator: { slug: 'unknown', name: 'Unknown' },
							evaluations: {},
						},
					],
				}),
			});
		}));

		await t.action(internal.benchmarks.fetchAndStoreBenchmarks, {});

		const result = await t.query(api.benchmarks.getAllBenchmarks, {});
		expect(result.benchmarks.length).toBeGreaterThanOrEqual(1);
	});

	it('handles model with no evaluations (evaluations ?? {} path, line 72)', async () => {
		vi.stubEnv('ARTIFICIAL_ANALYSIS_API_KEY', 'fake-aa-key');
		vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
			if ((url as string).includes('openrouter')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ data: [{ id: 'openai/gpt-4o' }] }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => ({
					data: [
						{
							slug: 'gpt-4o',
							model_creator: { slug: 'openai', name: 'OpenAI' },
						},
					],
				}),
			});
		}));

		await expect(
			t.action(internal.benchmarks.fetchAndStoreBenchmarks, {})
		).resolves.not.toThrow();
	});

	it('handles payload.data being non-array (line 65)', async () => {
		vi.stubEnv('ARTIFICIAL_ANALYSIS_API_KEY', 'fake-aa-key');
		vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
			if ((url as string).includes('openrouter')) {
				return Promise.resolve({
					ok: true,
					json: async () => ({ data: [{ id: 'openai/gpt-4o' }] }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: async () => ({ data: null }),
			});
		}));

		await expect(
			t.action(internal.benchmarks.fetchAndStoreBenchmarks, {})
		).resolves.not.toThrow();
	});
});

describe('benchmarks.storeBenchmarks', () => {
	let t: ReturnType<typeof createConvexTest>;

	beforeEach(() => {
		t = createConvexTest();
	});

	it('inserts a new benchmark when it does not exist', async () => {
		await t.mutation(internal.benchmarks.storeBenchmarks, {
			benchmarks: [sampleBenchmark],
		});

		const result = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: sampleBenchmark.openRouterModelId,
		});

		expect(result).not.toBeNull();
		expect(result?.openRouterModelId).toBe(sampleBenchmark.openRouterModelId);
		expect(result?.aaSlug).toBe(sampleBenchmark.aaSlug);
		expect(result?.aaCreatorName).toBe(sampleBenchmark.aaCreatorName);
	});

	it('sets lastUpdated on insert', async () => {
		const before = Date.now();

		await t.mutation(internal.benchmarks.storeBenchmarks, {
			benchmarks: [sampleBenchmark],
		});

		const result = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: sampleBenchmark.openRouterModelId,
		});

		expect(result?.lastUpdated).toBeGreaterThanOrEqual(before);
	});

	it('patches an existing benchmark by openRouterModelId (upsert)', async () => {
		await t.run(async (ctx) => {
			await ctx.db.insert('benchmarks', {
				...sampleBenchmark,
				intelligenceIndex: 50.0,
				lastUpdated: Date.now() - 10000,
			});
		});

		await t.mutation(internal.benchmarks.storeBenchmarks, {
			benchmarks: [{ ...sampleBenchmark, intelligenceIndex: 99.0 }],
		});

		const result = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: sampleBenchmark.openRouterModelId,
		});

		expect(result?.intelligenceIndex).toBe(99.0);
	});

	it('updates lastUpdated when patching an existing benchmark', async () => {
		const oldTimestamp = Date.now() - 10000;
		await t.run(async (ctx) => {
			await ctx.db.insert('benchmarks', {
				...sampleBenchmark,
				lastUpdated: oldTimestamp,
			});
		});

		await t.mutation(internal.benchmarks.storeBenchmarks, {
			benchmarks: [sampleBenchmark],
		});

		const result = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: sampleBenchmark.openRouterModelId,
		});

		expect(result?.lastUpdated).toBeGreaterThan(oldTimestamp);
	});

	it('handles multiple benchmarks mixing insert and upsert', async () => {
		await t.run(async (ctx) => {
			await ctx.db.insert('benchmarks', {
				...sampleBenchmark,
				intelligenceIndex: 10.0,
				lastUpdated: Date.now(),
			});
		});

		const newBenchmark = {
			openRouterModelId: 'anthropic/claude-3-5-sonnet',
			aaSlug: 'claude-3-5-sonnet',
			aaCreatorName: 'Anthropic',
			intelligenceIndex: 92.0,
		};

		await t.mutation(internal.benchmarks.storeBenchmarks, {
			benchmarks: [
				{ ...sampleBenchmark, intelligenceIndex: 88.0 },
				newBenchmark,
			],
		});

		const updated = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: sampleBenchmark.openRouterModelId,
		});
		const inserted = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: newBenchmark.openRouterModelId,
		});

		expect(updated?.intelligenceIndex).toBe(88.0);
		expect(inserted?.intelligenceIndex).toBe(92.0);
	});

	it('handles empty benchmarks array without error', async () => {
		await expect(
			t.mutation(internal.benchmarks.storeBenchmarks, { benchmarks: [] })
		).resolves.not.toThrow();
	});

	it('stores optional benchmark fields', async () => {
		const fullBenchmark = {
			...sampleBenchmark,
			mmluPro: 75.5,
			gpqa: 60.0,
			scicode: 45.0,
			livecodebench: 55.0,
			math500: 80.0,
			aime: 30.0,
		};

		await t.mutation(internal.benchmarks.storeBenchmarks, {
			benchmarks: [fullBenchmark],
		});

		const result = await t.query(api.benchmarks.getBenchmarkByOpenRouterId, {
			openRouterModelId: sampleBenchmark.openRouterModelId,
		});

		expect(result?.mmluPro).toBe(75.5);
		expect(result?.gpqa).toBe(60.0);
		expect(result?.math500).toBe(80.0);
	});
});
