import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { modules, rateLimiter } from './testSetup.test';

function createConvexTest() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

describe('chats.generateAndSetTitleInternal', () => {
  let t: ReturnType<typeof createConvexTest>;
  let userId: Id<'users'>;
  let chatId: Id<'chats'>;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(async () => {
    t = createConvexTest();
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    vi.restoreAllMocks();

    userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        externalId: 'internal-title-user',
        email: 'internal-title@test.com',
        name: 'Internal Title User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    chatId = await t.run(async (ctx) => {
      return await ctx.db.insert('chats', {
        userId,
        title: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    vi.restoreAllMocks();
  });

  it('generates and persists a title for default-title chats', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Helpful Testing Title' } }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
      chatId,
      userId,
      seedText: 'this is the first user message',
      length: 'standard',
      provider: 'osschat',
      force: false,
    });

    expect(result.saved).toBe(true);
    expect(result.title).toBe('Helpful Testing Title');

    const chat = await t.run(async (ctx) => await ctx.db.get(chatId));
    expect(chat?.title).toBe('Helpful Testing Title');
  });

  it('does not overwrite existing custom titles unless forced', async () => {
    await t.run(async (ctx) => {
      await ctx.db.patch(chatId, { title: 'Custom Existing Title' });
    });

    const result = await t.action(internal.chatTitle.generateAndSetTitleInternal, {
      chatId,
      userId,
      seedText: 'first message',
      length: 'standard',
      provider: 'osschat',
      force: false,
    });

    expect(result.saved).toBe(false);
    expect(result.reason).toBe('title_already_set');
  });
});
