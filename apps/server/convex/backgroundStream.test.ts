import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { modules, rateLimiter } from './testSetup.test';

function makeConvexTest() {
	const t = convexTest(schema, modules);
	rateLimiter.register(t);
	return t;
}

async function seedUser(t: ReturnType<typeof makeConvexTest>, externalId = 'ext_1') {
	return t.run(async (ctx) =>
		ctx.db.insert('users', {
			externalId,
			email: `${externalId}@test.com`,
			name: 'User',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

async function seedChat(
	t: ReturnType<typeof makeConvexTest>,
	userId: Id<'users'>,
	title = 'New Chat',
) {
	return t.run(async (ctx) =>
		ctx.db.insert('chats', {
			userId,
			title,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

describe('backgroundStream.startStream', () => {
	let t: ReturnType<typeof makeConvexTest>;
	let userId: Id<'users'>;
	let chatId: Id<'chats'>;
	const externalId = 'stream-user';

	beforeEach(async () => {
		vi.useFakeTimers();
		t = makeConvexTest();
		userId = await seedUser(t, externalId);
		chatId = await seedChat(t, userId, 'New Chat');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates a streamJob and returns its ID', async () => {
		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_123',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(jobId).toBeDefined();

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job).not.toBeNull();
		expect(job?.status).toBe('pending');
	});

	it('inserts the streamJob with correct fields', async () => {
		const messages = [{ role: 'user', content: 'Test message' }];

		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_456',
			model: 'anthropic/claude-3-5-sonnet',
			provider: 'openrouter',
			messages,
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.chatId).toBe(chatId);
		expect(job?.userId).toBe(userId);
		expect(job?.messageId).toBe('msg_456');
		expect(job?.model).toBe('anthropic/claude-3-5-sonnet');
		expect(job?.provider).toBe('openrouter');
		expect(job?.messages).toEqual(messages);
		expect(job?.content).toBe('');
	});

	it('sets chat activeStreamId to job-${jobId}', async () => {
		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_789',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.activeStreamId).toBe(`job-${jobId}`);
	});

	it('sets chat status to streaming', async () => {
		await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_111',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe('streaming');
	});

	it('updates chat updatedAt when stream starts', async () => {
		const before = Date.now();

		await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_ts',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.updatedAt).toBeGreaterThanOrEqual(before);
	});

	it('throws when called without authentication', async () => {
		await expect(
			t.mutation(api.backgroundStream.startStream, {
				chatId,
				userId,
				messageId: 'msg_123',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [],
			})
		).rejects.toThrow();
	});

	it('throws when the auth identity has no matching user record', async () => {
		await expect(
			t.withIdentity({ subject: 'no-such-user' }).mutation(api.backgroundStream.startStream, {
				chatId,
				userId,
				messageId: 'msg_123',
				model: 'openai/gpt-4o',
				provider: 'osschat',
				messages: [],
			})
		).rejects.toThrow('User not found');
	});

	it('throws when chat does not exist', async () => {
		const deletedChatId = await t.run(async (ctx) => {
			const id = await ctx.db.insert('chats', {
				userId,
				title: 'Temp',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});

		await expect(
			t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
				chatId: deletedChatId,
				userId,
				messageId: 'msg_123',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [],
			})
		).rejects.toThrow('Chat not found or unauthorized');
	});

	it('throws when user does not own the chat', async () => {
		const otherExternalId = 'other-stream-user';
		const otherUserId = await seedUser(t, otherExternalId);

		await expect(
			t.withIdentity({ subject: otherExternalId }).mutation(api.backgroundStream.startStream, {
				chatId,
				userId: otherUserId,
				messageId: 'msg_123',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [],
			})
		).rejects.toThrow('Chat not found or unauthorized');
	});

	it('throws when a fresh (non-stale) stream is already running', async () => {
		await t.run(async (ctx) =>
			ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'msg_existing',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [],
				content: '',
				createdAt: Date.now(),
			})
		);

		await expect(
			t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
				chatId,
				userId,
				messageId: 'msg_new',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'Hello' }],
			})
		).rejects.toThrow('Stream already in progress for this chat');
	});

	it('clears a stale running stream and creates a new one', async () => {
		const staleCreatedAt = Date.now() - 3 * 60 * 1000;

		const staleJobId = await t.run(async (ctx) =>
			ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'msg_stale',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [],
				content: '',
				createdAt: staleCreatedAt,
			})
		);

		const newJobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_new',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		const staleJob = await t.run(async (ctx) => ctx.db.get(staleJobId));
		expect(staleJob?.status).toBe('error');
		expect(staleJob?.error).toBe('Auto-cleaned stale running stream');

		expect(newJobId).toBeDefined();
		const newJob = await t.run(async (ctx) => ctx.db.get(newJobId));
		expect(newJob?.status).toBe('pending');
	});

	it('succeeds with osschat provider when user exists', async () => {
		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_osschat',
			model: 'openai/gpt-4o',
			provider: 'osschat',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(jobId).toBeDefined();

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.provider).toBe('osschat');
	});

	it('schedules title generation when chat has New Chat title and low message count', async () => {
		await t.run(async (ctx) => ctx.db.patch(chatId, { messageCount: 1, title: 'New Chat' }));

		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_title',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello world, how are you?' }],
		});

		expect(jobId).toBeDefined();
	});

	it('does not schedule title generation when chat title is not New Chat', async () => {
		await t.run(async (ctx) => ctx.db.patch(chatId, { title: 'Custom Title', messageCount: 0 }));

		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_no_title',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(jobId).toBeDefined();
	});

	it('does not schedule title generation when messageCount exceeds threshold', async () => {
		await t.run(async (ctx) => ctx.db.patch(chatId, { messageCount: 5, title: 'New Chat' }));

		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_high_count',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
		});

		expect(jobId).toBeDefined();
	});

	it('passes stream options to the created job', async () => {
		const jobId = await t.withIdentity({ subject: externalId }).mutation(api.backgroundStream.startStream, {
			chatId,
			userId,
			messageId: 'msg_opts',
			model: 'openai/gpt-4o',
			provider: 'openrouter',
			messages: [{ role: 'user', content: 'Hello' }],
			options: {
				enableReasoning: true,
				reasoningEffort: 'high',
				enableWebSearch: false,
			},
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.options?.enableReasoning).toBe(true);
		expect(job?.options?.reasoningEffort).toBe('high');
	});
});

describe('backgroundStream.getStreamJob', () => {
	let t: ReturnType<typeof makeConvexTest>;
	let userId: Id<'users'>;
	let chatId: Id<'chats'>;
	const externalId = 'stream-job-user';

	beforeEach(async () => {
		t = makeConvexTest();
		userId = await seedUser(t, externalId);
		chatId = await seedChat(t, userId, 'New Chat');
	});

	it('returns selected job fields for the owning user', async () => {
		const jobId = await t.run(async (ctx) =>
			ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'msg_get_job',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'hello' }],
				options: { enableReasoning: true, reasoningEffort: 'medium' },
				content: 'partial output',
				reasoning: 'thinking',
				webSearchUsed: true,
				webSearchCallCount: 1,
				toolCallCount: 2,
				createdAt: Date.now(),
			})
		);

		const result = await t.withIdentity({ subject: externalId }).query(api.backgroundStream.getStreamJob, {
			jobId,
			userId,
		});

		expect(result?._id).toBe(jobId);
		expect(result?.status).toBe('running');
		expect(result?.messageId).toBe('msg_get_job');
		expect(result?.content).toBe('partial output');
		expect(result).not.toHaveProperty('chatId');
		expect(result).not.toHaveProperty('userId');
	});

	it('returns null when the job belongs to another user', async () => {
		const otherExternalId = 'stream-job-other';
		const otherUserId = await seedUser(t, otherExternalId);

		const jobId = await t.run(async (ctx) =>
			ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'msg_hidden',
				status: 'pending',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'hello' }],
				content: '',
				createdAt: Date.now(),
			})
		);

		const result = await t.withIdentity({ subject: otherExternalId }).query(api.backgroundStream.getStreamJob, {
			jobId,
			userId: otherUserId,
		});

		expect(result).toBeNull();
	});
});

describe('backgroundStream.completeStream', () => {
	let t: ReturnType<typeof makeConvexTest>;
	let userId: Id<'users'>;
	let chatId: Id<'chats'>;

	beforeEach(async () => {
		t = makeConvexTest();
		userId = await seedUser(t, 'complete-stream-user');
		chatId = await seedChat(t, userId, 'New Chat');
	});

	it('completes the job, clears chat active stream, and inserts assistant message', async () => {
		const jobId = await t.run(async (ctx) => {
			await ctx.db.patch(chatId, { activeStreamId: 'job-pending', status: 'streaming' });
			return ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'assistant_msg_1',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'question' }],
				options: {
					enableReasoning: true,
					reasoningEffort: 'high',
					enableWebSearch: true,
					maxSteps: 4,
				},
				content: '',
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: 'final answer',
			reasoning: 'reasoning trail',
			chainOfThoughtParts: [
				{ type: 'reasoning', index: 0, text: 'thinking' },
				{ type: 'tool', index: 1, toolName: 'web_search', state: 'output-available' },
			],
			reasoningRequested: true,
			tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe('completed');
		expect(job?.webSearchCallCount).toBe(1);
		expect(job?.webSearchUsed).toBe(true);
		expect(job?.toolCallCount).toBe(1);

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe('idle');
		expect(chat?.activeStreamId).toBeUndefined();

		const message = await t.run(async (ctx) =>
			ctx.db
				.query('messages')
				.withIndex('by_client_id', (q) => q.eq('chatId', chatId).eq('clientMessageId', 'assistant_msg_1'))
				.unique()
		);
		expect(message?.content).toBe('final answer');
		expect(message?.status).toBe('completed');
		expect(message?.reasoningEffort).toBe('high');
		expect(message?.webSearchEnabled).toBe(true);
		expect(message?.maxSteps).toBe(4);
	});

	it('updates an existing assistant message instead of creating a duplicate', async () => {
		const jobId = await t.run(async (ctx) => {
			const insertedJobId = await ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'assistant_msg_existing',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'question' }],
				content: '',
				createdAt: Date.now(),
			});

			await ctx.db.insert('messages', {
				chatId,
				clientMessageId: 'assistant_msg_existing',
				role: 'assistant',
				content: 'old content',
				status: 'streaming',
				createdAt: Date.now(),
				userId,
			});

			return insertedJobId;
		});

		await t.mutation(internal.backgroundStream.completeStream, {
			jobId,
			content: 'new content',
		});

		const matchingMessages = await t.run(async (ctx) =>
			ctx.db
				.query('messages')
				.withIndex('by_client_id', (q) => q.eq('chatId', chatId).eq('clientMessageId', 'assistant_msg_existing'))
				.collect()
		);

		expect(matchingMessages.length).toBe(1);
		expect(matchingMessages[0]?.content).toBe('new content');
		expect(matchingMessages[0]?.status).toBe('completed');
	});
});

describe('backgroundStream.failStream', () => {
	let t: ReturnType<typeof makeConvexTest>;
	let userId: Id<'users'>;
	let chatId: Id<'chats'>;

	beforeEach(async () => {
		t = makeConvexTest();
		userId = await seedUser(t, 'fail-stream-user');
		chatId = await seedChat(t, userId, 'New Chat');
	});

	it('marks stream as error, stores partial content, and clears chat state', async () => {
		const jobId = await t.run(async (ctx) => {
			await ctx.db.patch(chatId, { activeStreamId: 'job-to-fail', status: 'streaming' });
			return ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'failed_msg',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'question' }],
				content: 'existing partial',
				createdAt: Date.now(),
			});
		});

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: 'provider error',
			partialContent: 'new partial content',
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.status).toBe('error');
		expect(job?.error).toBe('provider error');
		expect(job?.content).toBe('new partial content');

		const chat = await t.run(async (ctx) => ctx.db.get(chatId));
		expect(chat?.status).toBe('idle');
		expect(chat?.activeStreamId).toBeUndefined();
	});

	it('keeps existing content when no partialContent is provided', async () => {
		const jobId = await t.run(async (ctx) =>
			ctx.db.insert('streamJobs', {
				chatId,
				userId,
				messageId: 'failed_msg_no_partial',
				status: 'running',
				model: 'openai/gpt-4o',
				provider: 'openrouter',
				messages: [{ role: 'user', content: 'question' }],
				content: 'original buffered text',
				createdAt: Date.now(),
			})
		);

		await t.mutation(internal.backgroundStream.failStream, {
			jobId,
			error: 'timeout',
		});

		const job = await t.run(async (ctx) => ctx.db.get(jobId));
		expect(job?.content).toBe('original buffered text');
		expect(job?.status).toBe('error');
	});
});
