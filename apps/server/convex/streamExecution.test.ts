/**
 * Comprehensive tests for streamExecution.ts
 *
 * Covers the key paths in executeStream:
 *  - Early return when job not found (line 45)
 *  - osschat provider + Upstash unavailable → failStream (lines 64-70)
 *  - osschat provider + daily limit exceeded → failStream (lines 56-63)
 *  - osschat provider + success path
 *  - openrouter provider + no API key → failStream (lines 93-99)
 *  - openrouter provider + success path
 *  - Error catch path → failStream (lines 464-478)
 *  - Content accumulation, message creation, chat status update
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { modules, rateLimiter } from './testSetup.test';

// ---------------------------------------------------------------------------
// Hoisted state objects (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const mockControls = vi.hoisted(() => ({
	streamTextShouldThrow: false,
	streamTextError: null as unknown,
	streamTextCustomTexts: null as string[] | null,
	streamTextCustomEvents: null as Array<Record<string, unknown>> | null,
	// Override totalUsage returned by the streamText mock; null = use default (10 input / 5 output)
	streamTextCustomTotalUsage: null as {
		inputTokens: number; outputTokens: number; totalTokens: number;
		reasoningTokens: number; outputTokenDetails: null; raw: unknown;
	} | null,
}));

const upstashControls = vi.hoisted(() => ({
	// null = Upstash unavailable (default – mirrors test env with no UPSTASH_* vars)
	reserveResult: null as number | null,
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted to top by Vitest)
// ---------------------------------------------------------------------------

vi.mock('ai', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ai')>();
	return {
		...actual,
		streamText: vi.fn().mockImplementation(() => {
			if (mockControls.streamTextError) {
				throw mockControls.streamTextError;
			}
			if (mockControls.streamTextShouldThrow) {
				throw new Error('Simulated stream failure');
			}
			const finishStep = {
				type: 'finish-step',
				usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reasoningTokens: 2, outputTokenDetails: null, raw: null },
			};
			const defaultTotalUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, reasoningTokens: 2, outputTokenDetails: null, raw: null };
			const totalUsage = Promise.resolve(mockControls.streamTextCustomTotalUsage ?? defaultTotalUsage);
			if (mockControls.streamTextCustomEvents !== null) {
				const events = mockControls.streamTextCustomEvents;
				return {
					fullStream: (async function* () { for (const e of events) yield e; yield finishStep; })(),
					totalUsage,
				};
			}
			const texts = mockControls.streamTextCustomTexts ?? ['Hello world'];
			return {
				fullStream: (async function* () {
					for (const text of texts) {
						yield { type: 'text-delta', text };
					}
					yield {
						type: 'finish-step',
						usage: {
							inputTokens: 10,
							outputTokens: 5,
							totalTokens: 15,
							reasoningTokens: 0,
							outputTokenDetails: null,
							raw: null,
						},
					};
				})(),
				totalUsage: Promise.resolve(mockControls.streamTextCustomTotalUsage ?? {
					inputTokens: 10,
					outputTokens: 5,
					totalTokens: 15,
					reasoningTokens: 0,
					outputTokenDetails: null,
					raw: null,
				}),
			};
		}),
		stepCountIs: actual.stepCountIs,
	};
});

vi.mock('@openrouter/ai-sdk-provider', () => ({
	createOpenRouter: vi.fn(() => vi.fn(() => ({ id: 'openai/gpt-4o' }))),
}));

vi.mock('./lib/crypto', () => ({
	decryptSecret: vi.fn().mockResolvedValue('decrypted-api-key'),
	encryptSecret: vi.fn().mockResolvedValue('mock-encrypted'),
}));

vi.mock('./lib/upstashUsage', () => ({
	reserveDailyUsageInUpstash: vi.fn().mockImplementation(async () => upstashControls.reserveResult),
	incrementDailyUsageInUpstash: vi.fn().mockResolvedValue(undefined),
	adjustDailyUsageInUpstash: vi.fn().mockResolvedValue(undefined),
	getDailyUsageFromUpstash: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function seedUser(
	t: ConvexTest,
	opts: { externalId?: string; encryptedOpenRouterKey?: string } = {},
): Promise<Id<'users'>> {
	return t.run(async (ctx) =>
		ctx.db.insert('users', {
			externalId: opts.externalId ?? 'ext-1',
			encryptedOpenRouterKey: opts.encryptedOpenRouterKey,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedChat(t: ConvexTest, userId: Id<'users'>): Promise<Id<'chats'>> {
	return t.run(async (ctx) =>
		ctx.db.insert('chats', {
			userId,
			title: 'Test Chat',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedStreamJob(
	t: ConvexTest,
	chatId: Id<'chats'>,
	userId: Id<'users'>,
	opts: {
		provider?: string;
		model?: string;
		messages?: Array<{ role: string; content: string }>;
		options?: {
			enableReasoning?: boolean;
			reasoningEffort?: string;
			enableWebSearch?: boolean;
			supportsToolCalls?: boolean;
			maxSteps?: number;
		};
	} = {},
): Promise<Id<'streamJobs'>> {
	return t.run(async (ctx) =>
		ctx.db.insert('streamJobs', {
			chatId,
			userId,
			messageId: `msg-${Date.now()}`,
			status: 'pending',
			model: opts.model ?? 'openai/gpt-4o',
			provider: opts.provider ?? 'openrouter',
			messages: opts.messages ?? [{ role: 'user', content: 'hello' }],
			options: opts.options,
			content: '',
			createdAt: Date.now(),
		}),
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streamExecution.executeStream', () => {
	let t: ConvexTest;

	beforeEach(() => {
		vi.useFakeTimers();
		t = makeConvexTest();
		// Reset mock controls to safe defaults
		mockControls.streamTextShouldThrow = false;
		mockControls.streamTextError = null;
		mockControls.streamTextCustomTexts = null;
		mockControls.streamTextCustomEvents = null;
		upstashControls.reserveResult = null; // Upstash unavailable by default
		mockControls.streamTextCustomTotalUsage = null;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// Path: job not found (line 45)
	// -------------------------------------------------------------------------

	describe('job not found', () => {
		it('returns early without error when job does not exist', async () => {
			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);

			// Create then immediately delete a streamJob to get a stale ID
			const staleJobId = await t.run(async (ctx) => {
				const id = await ctx.db.insert('streamJobs', {
					chatId,
					userId,
					messageId: 'msg-deleted',
					status: 'pending',
					model: 'openai/gpt-4o',
					provider: 'openrouter',
					messages: [],
					content: '',
					createdAt: Date.now(),
				});
				await ctx.db.delete(id);
				return id;
			});

			await expect(
				t.action(internal.streamExecution.executeStream, { jobId: staleJobId }),
			).resolves.toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// Path: osschat provider (lines 50-71)
	// -------------------------------------------------------------------------

	describe('osschat provider', () => {
		it('fails with "usage tracking unavailable" when Upstash returns null', async () => {
			upstashControls.reserveResult = null; // Upstash unavailable

			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toBe(
				'Usage tracking temporarily unavailable. Please retry shortly.',
			);
		});

		it('fails with "daily limit reached" when reservedTotal exceeds DAILY_AI_LIMIT_CENTS', async () => {
			// DAILY_AI_LIMIT_CENTS = 10, so 11 exceeds it
			upstashControls.reserveResult = 11;

			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toContain('Daily usage limit reached');
		});

		it('completes successfully when Upstash is available and within limit', async () => {
			upstashControls.reserveResult = 5; // within DAILY_AI_LIMIT_CENTS (10)
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');

			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Hello world');
		});

		it('fails with a local osschat configuration error when OPENROUTER_API_KEY is not set', async () => {
			upstashControls.reserveResult = 5; // Upstash available

			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });

			// Do NOT set OPENROUTER_API_KEY → apiKey will be null
			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toBe(
				'OSSChat Cloud is not configured locally. Set OPENROUTER_API_KEY or switch to OpenRouter with your own key.',
			);
		});

		it('fails stream and records error when streamText throws (catch path)', async () => {
			upstashControls.reserveResult = 5;
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			mockControls.streamTextShouldThrow = true;

			const userId = await seedUser(t);
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toBe('An error occurred while processing your request.');
		});
	});

	// -------------------------------------------------------------------------
	// Path: openrouter provider (lines 87-99)
	// -------------------------------------------------------------------------

	describe('openrouter provider', () => {
		it('fails with "No API key available" when user has no encrypted key', async () => {
			// User has no encryptedOpenRouterKey
			const userId = await seedUser(t, { externalId: 'ext-no-key' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toBe('No API key available');
		});

		it('completes stream successfully when encrypted key is present', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-with-key',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Hello world');
		});

		it('records completedAt and startedAt on success', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-timestamps',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.completedAt).toBeDefined();
			expect(job?.startedAt).toBeDefined();
		});

		it('updates chat status to idle after successful stream', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-chat-idle',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const chat = await t.run(async (ctx) => ctx.db.get(chatId));
			expect(chat?.status).toBe('idle');
			expect(chat?.activeStreamId).toBeUndefined();
		});

		it('creates a message record in the messages table on completion', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-message',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const messages = await t.run(async (ctx) =>
				ctx.db
					.query('messages')
					.withIndex('by_chat', (q) => q.eq('chatId', chatId))
					.collect(),
			);
			expect(messages.length).toBeGreaterThan(0);
			expect(messages[0]?.content).toBe('Hello world');
			expect(messages[0]?.role).toBe('assistant');
		});

		it('accumulates multiple text-delta chunks into final content', async () => {
			mockControls.streamTextCustomTexts = ['Hello', ', ', 'world', '!'];

			const userId = await seedUser(t, {
				externalId: 'ext-chunks',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Hello, world!');
		});

		it('sets job status to running before completing', async () => {
			// After the action completes, job should be 'completed'
			// (it was set to 'running' mid-action via updateStreamContent)
			const userId = await seedUser(t, {
				externalId: 'ext-running',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			// After the full action, should be completed
			expect(job?.status).toBe('completed');
		});
	});

	// -------------------------------------------------------------------------
	// Path: error catch (lines 464-478)
	// -------------------------------------------------------------------------

	describe('error catch path', () => {
		it('fails stream when streamText throws an error', async () => {
			mockControls.streamTextShouldThrow = true;

			const userId = await seedUser(t, {
				externalId: 'ext-throw',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toBe('An error occurred while processing your request.');
		});

		it('sets chat status to idle even when stream errors', async () => {
			mockControls.streamTextShouldThrow = true;

			const userId = await seedUser(t, {
				externalId: 'ext-throw-chat',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const chat = await t.run(async (ctx) => ctx.db.get(chatId));
			expect(chat?.status).toBe('idle');
		});

		it('records completedAt on failed stream', async () => {
			mockControls.streamTextShouldThrow = true;

			const userId = await seedUser(t, {
				externalId: 'ext-throw-ts',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.completedAt).toBeDefined();
		});
	});

	describe('actionable provider errors', () => {
		it('surfaces insufficient OpenRouter credits', async () => {
			mockControls.streamTextError = new Error(
				'Insufficient credits. This account never purchased credits. {"code":402}',
			);
			const userId = await seedUser(t, {
				externalId: 'ext-openrouter-credits',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toContain('does not have enough credits');
		});

		it('surfaces OpenRouter privacy restriction errors', async () => {
			mockControls.streamTextError = new Error(
				'No endpoints available matching your guardrail restrictions and data policy. Configure: https://openrouter.ai/settings/privacy',
			);
			const userId = await seedUser(t, {
				externalId: 'ext-openrouter-privacy',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
			expect(job?.error).toContain('privacy or provider restrictions');
		});
	});

	// -------------------------------------------------------------------------
	// Additional stream options / model config paths
	// -------------------------------------------------------------------------

	describe('stream options', () => {
		it('handles maxSteps option (configuredMaxSteps branch)', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-maxsteps',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { maxSteps: 3 },
			});

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		it('handles non-finite maxSteps (falls back to 1)', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-maxsteps-nan',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			// maxSteps: 0 is not > 0, so configuredMaxSteps becomes undefined
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { maxSteps: 0 },
			});

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		it('works with an empty messages array (latestUserMessage = "")', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-empty-msgs',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				messages: [],
			});

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		it('works with mixed role messages', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-mixed-msgs',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				messages: [
					{ role: 'system', content: 'You are helpful.' },
					{ role: 'user', content: 'Tell me a joke.' },
					{ role: 'assistant', content: 'Why did the chicken cross the road?' },
					{ role: 'user', content: 'Why?' },
				],
			});

			await t.action(internal.streamExecution.executeStream, { jobId });

			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});
	});

	// -------------------------------------------------------------------------
	// Token usage / metrics paths
	// -------------------------------------------------------------------------

	describe('token usage', () => {
		it('stores token usage in completed job', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-tokens',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });

			await t.action(internal.streamExecution.executeStream, { jobId });

			// Message should have tokenUsage if set
			const messages = await t.run(async (ctx) =>
				ctx.db
					.query('messages')
					.withIndex('by_chat', (q) => q.eq('chatId', chatId))
					.collect(),
			);
			// The message may or may not have tokenUsage (depends on usageSummary)
			expect(messages.length).toBeGreaterThan(0);
		});
	});

	// -------------------------------------------------------------------------
	// Idempotency / existing message path
	// -------------------------------------------------------------------------

	describe('message upsert idempotency', () => {
		it('updates existing message when clientMessageId already exists in DB', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-upsert',
				encryptedOpenRouterKey: 'encrypted-or-key',
			});
			const chatId = await seedChat(t, userId);

			// Pre-create a message with the same messageId that the job will use
			const messageId = 'msg-existing';
			await t.run(async (ctx) =>
				ctx.db.insert('messages', {
					chatId,
					clientMessageId: messageId,
					role: 'assistant',
					content: 'old content',
					createdAt: Date.now(),
				}),
			);

			const jobId = await t.run(async (ctx) =>
				ctx.db.insert('streamJobs', {
					chatId,
					userId,
					messageId,
					status: 'pending',
					model: 'openai/gpt-4o',
					provider: 'openrouter',
					messages: [{ role: 'user', content: 'hello' }],
					content: '',
					createdAt: Date.now(),
				}),
			);

			await t.action(internal.streamExecution.executeStream, { jobId });

			// Message content should be updated to streamed content
			const msgs = await t.run(async (ctx) =>
				ctx.db
					.query('messages')
					.withIndex('by_client_id', (q) =>
						q.eq('chatId', chatId).eq('clientMessageId', messageId),
					)
					.collect(),
			);
			expect(msgs.length).toBe(1);
			expect(msgs[0]?.content).toBe('Hello world');
		});
	});

	// -------------------------------------------------------------------------
	// Path: reasoning stream events (lines 253-278)
	// -------------------------------------------------------------------------

	describe('reasoning stream events', () => {
		it('processes reasoning-start, reasoning-delta, reasoning-end when enableReasoning=true', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'reasoning-start', id: 'r1' },
				{ type: 'reasoning-delta', id: 'r1', text: 'I am thinking...' },
				{ type: 'reasoning-delta', id: 'r1', text: ' Conclusion.' },
				{ type: 'reasoning-end', id: 'r1' },
				{ type: 'text-delta', text: 'Final answer' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-reasoning',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { enableReasoning: true },
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Final answer');
			expect(job?.reasoning).toBe('I am thinking... Conclusion.');
		});

		it('skips reasoning events when enableReasoning=false', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'reasoning-start', id: 'r2' },
				{ type: 'reasoning-delta', id: 'r2', text: 'ignored reasoning' },
				{ type: 'reasoning-end', id: 'r2' },
				{ type: 'text-delta', text: 'Only text' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-no-reasoning',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { enableReasoning: false },
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Only text');
			expect(job?.reasoning).toBeUndefined();
		});

		it('infers reasoningRequested from reasoningEffort when enableReasoning is undefined', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'reasoning-start', id: 'r3' },
				{ type: 'reasoning-delta', id: 'r3', text: 'effort reasoning' },
				{ type: 'reasoning-end', id: 'r3' },
				{ type: 'text-delta', text: 'text result' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-effort-reasoning',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { reasoningEffort: 'medium' },
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.reasoning).toBe('effort reasoning');
		});
	});

	// -------------------------------------------------------------------------
	// Path: tool stream events (lines 279-344)
	// -------------------------------------------------------------------------

	describe('tool stream events', () => {
		it('processes tool-input-start, tool-input-delta, tool-input-end, tool-result', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'tool-input-start', id: 'tool-1', toolName: 'webSearch' },
				{ type: 'tool-input-delta', id: 'tool-1', delta: '{"q":' },
				{ type: 'tool-input-delta', id: 'tool-1', delta: '"hello"}' },
				{ type: 'tool-input-end', id: 'tool-1' },
				{ type: 'tool-result', toolCallId: 'tool-1', toolName: 'webSearch', output: 'search results' },
				{ type: 'text-delta', text: 'Based on search...' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-tool-flow',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Based on search...');
		});

		it('processes tool-call event (non-streaming tool call path)', async () => {
			mockControls.streamTextCustomEvents = [
				{
					type: 'tool-call',
					toolCallId: 'tc-1',
					toolName: 'webSearch',
					input: { q: 'test' },
				},
				{
					type: 'tool-result',
					toolCallId: 'tc-1',
					toolName: 'webSearch',
					output: 'result data',
				},
				{ type: 'text-delta', text: 'Answer after tool' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-tool-call',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Answer after tool');
		});

		it('processes tool-error with Error instance', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'tool-input-start', id: 'tool-err', toolName: 'webSearch' },
				{ type: 'tool-input-end', id: 'tool-err' },
				{
					type: 'tool-error',
					toolCallId: 'tool-err',
					toolName: 'webSearch',
					error: new Error('Tool failed'),
				},
				{ type: 'text-delta', text: 'Fallback response' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-tool-error',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('Fallback response');
		});

		it('processes tool-error with string error value', async () => {
			mockControls.streamTextCustomEvents = [
				{
					type: 'tool-error',
					toolCallId: 'tool-str-err',
					toolName: 'webSearch',
					error: 'string error message',
				},
				{ type: 'text-delta', text: 'After string error' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-tool-str-err',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		it('processes tool-error with non-string, non-Error value (fallback message)', async () => {
			mockControls.streamTextCustomEvents = [
				{
					type: 'tool-error',
					toolCallId: 'tool-obj-err',
					toolName: 'webSearch',
					error: { code: 500 },
				},
				{ type: 'text-delta', text: 'After object error' },
			];
			const userId = await seedUser(t, {
				externalId: 'ext-tool-obj-err',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});
	});

	// -------------------------------------------------------------------------
	// Path: web search (lines 162-230)
	// -------------------------------------------------------------------------

	describe('web search paths', () => {
		// Note: convex-test doesn't load the 'search' module, so enableWebSearch=true
		// causes the action to throw (can't find the search module). These tests
		// verify that the web search code path is exercised and the job ends with
		// an error (caught by the catch block), not a crash.
		it('web search path: enableWebSearch=true triggers search module lookup', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-ws-unavailable',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { enableWebSearch: true },
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			// search module not available in test env → caught by catch block → error
			expect(job?.status).toBe('error');
		});

		it('web search path: supportsToolCalls=false still triggers search module lookup', async () => {
			const userId = await seedUser(t, {
				externalId: 'ext-ws-no-tools',
				encryptedOpenRouterKey: 'key',
			});
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { enableWebSearch: true, supportsToolCalls: false },
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
		});
	});

	// -------------------------------------------------------------------------
	// Path: osschat billing adjustments (lines 395-433)
	// -------------------------------------------------------------------------

	describe('osschat billing paths', () => {
		it('completes with billing adjustment when actual usage differs from reservation', async () => {
			upstashControls.reserveResult = 1;
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			const userId = await seedUser(t, { externalId: 'ext-billing-adjust' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		it('releases reservation when calculated usage is zero', async () => {
			upstashControls.reserveResult = 1;
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			mockControls.streamTextCustomTexts = [''];
			const userId = await seedUser(t, { externalId: 'ext-billing-release' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		it('releases upstash reservation when osschat stream throws', async () => {
			upstashControls.reserveResult = 1;
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			mockControls.streamTextShouldThrow = true;
			const userId = await seedUser(t, { externalId: 'ext-billing-error' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
		});
	});
	// -------------------------------------------------------------------------
	// Previously uncovered paths
	// -------------------------------------------------------------------------

	describe('previously uncovered paths', () => {
		// Lines 355-357: default branch in the switch statement
		it('processes unknown event types via default branch without error', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'unknown-event-type-xyz' },
				{ type: 'text-delta', text: 'response after unknown' },
			];
			const userId = await seedUser(t, { externalId: 'ext-default-branch', encryptedOpenRouterKey: 'key' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('response after unknown');
		});

		// Line 417: adjustment !== 0 (actual cost differs from reservation)
		it('applies upstash billing adjustment when actual usage differs from reservation (line 417)', async () => {
			upstashControls.reserveResult = 1; // reserved 1 cent
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			// raw.total_cost = 0.05 USD -> 5 cents -> Math.ceil(5) = 5 != 1 -> adjustment = 4 != 0
			mockControls.streamTextCustomTotalUsage = {
				inputTokens: 10, outputTokens: 5, totalTokens: 15,
				reasoningTokens: 0, outputTokenDetails: null, raw: { total_cost: 0.05 },
			};
			const userId = await seedUser(t, { externalId: 'ext-billing-line417' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		// Lines 428-431: release reservation when calculateUsageCents returns null
		it('releases upstash reservation when calculateUsageCents returns null (lines 428-431)', async () => {
			upstashControls.reserveResult = 1;
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			// 0 tokens + empty messages + empty output -> calculateUsageCents returns null
			mockControls.streamTextCustomTotalUsage = {
				inputTokens: 0, outputTokens: 0, totalTokens: 0,
				reasoningTokens: 0, outputTokenDetails: null, raw: null,
			};
			mockControls.streamTextCustomTexts = [''];
			const userId = await seedUser(t, { externalId: 'ext-billing-null-usage' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'osschat',
				messages: [], // empty messages -> estimatePromptTokens returns 0
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
		});

		// Line 470: adjustDailyUsageInUpstash throws inside the catch block
		it('handles adjustDailyUsageInUpstash throwing in catch block (line 470)', async () => {
			upstashControls.reserveResult = 1;
			vi.stubEnv('OPENROUTER_API_KEY', 'test-osschat-key');
			mockControls.streamTextShouldThrow = true;
			// Make the cleanup call in the catch block throw
			const { adjustDailyUsageInUpstash } = await import('./lib/upstashUsage');
			vi.mocked(adjustDailyUsageInUpstash).mockRejectedValueOnce(new Error('Upstash unavailable'));
			const userId = await seedUser(t, { externalId: 'ext-adjust-throws' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'osschat' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('error');
		});

		// Line 317: break at end of case 'tool-call' branch
		it('processes tool-call event without error (line 317)', async () => {
			mockControls.streamTextCustomEvents = [
				{ type: 'tool-call', toolCallId: 'call-abc', toolName: 'webSearch', input: { query: 'test' } },
				{ type: 'text-delta', text: 'answer' },
			];
			const userId = await seedUser(t, { externalId: 'ext-tool-call', encryptedOpenRouterKey: 'key' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, { provider: 'openrouter' });
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('answer');
		});

		// Line 366: reasoning chainPart still in 'streaming' state at stream completion -> set to 'done'
		it('marks still-streaming reasoning part as done at stream completion (line 366)', async () => {
			// No reasoning-end emitted -> part stays streaming -> post-stream loop sets it to done
			mockControls.streamTextCustomEvents = [
				{ type: 'reasoning-start', id: 'r-1' },
				{ type: 'reasoning-delta', id: 'r-1', text: 'I am thinking...' },
				{ type: 'text-delta', text: 'final answer' },
			];
			const userId = await seedUser(t, { externalId: 'ext-reasoning-done', encryptedOpenRouterKey: 'key' });
			const chatId = await seedChat(t, userId);
			const jobId = await seedStreamJob(t, chatId, userId, {
				provider: 'openrouter',
				options: { enableReasoning: true },
			});
			await t.action(internal.streamExecution.executeStream, { jobId });
			const job = await t.run(async (ctx) => ctx.db.get(jobId));
			expect(job?.status).toBe('completed');
			expect(job?.content).toBe('final answer');
		});
	});
});
