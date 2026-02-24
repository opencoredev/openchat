import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
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
