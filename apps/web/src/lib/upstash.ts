import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Client as WorkflowClient } from "@upstash/workflow";
import { createClient } from "redis";

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL?.trim();
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const QSTASH_URL = process.env.QSTASH_URL?.trim();
const QSTASH_TOKEN = process.env.QSTASH_TOKEN?.trim();
const UPSTASH_ENABLE_IN_DEV = process.env.UPSTASH_ENABLE_IN_DEV?.trim().toLowerCase() === "true";
const REDIS_URL = process.env.REDIS_URL?.trim();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function isLocalUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

const SHOULD_USE_UPSTASH_IN_DEV = UPSTASH_ENABLE_IN_DEV || isLocalUrl(UPSTASH_REDIS_REST_URL);
const SHOULD_USE_UPSTASH_REDIS = IS_PRODUCTION || SHOULD_USE_UPSTASH_IN_DEV;
const SHOULD_USE_LOCAL_REDIS =
	!IS_PRODUCTION && !SHOULD_USE_UPSTASH_IN_DEV && (REDIS_URL?.length ?? 0) > 0;

type LocalRedisState = {
	client: ReturnType<typeof createClient> | null;
	connectPromise: Promise<ReturnType<typeof createClient> | null> | null;
	unavailable: boolean;
};

type GlobalWithLocalRedisState = typeof globalThis & {
	__openchatLocalRedisState?: LocalRedisState;
};

const globalForLocalRedis = globalThis as GlobalWithLocalRedisState;
const localRedisState =
	globalForLocalRedis.__openchatLocalRedisState ??
	(globalForLocalRedis.__openchatLocalRedisState = {
		client: null,
		connectPromise: null,
		unavailable: false,
	});

function parseRedisValue<T>(value: unknown): T | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") return value as T;
	try {
		return JSON.parse(value) as T;
	} catch {
		return value as unknown as T;
	}
}

async function getLocalRedisClient(): Promise<ReturnType<typeof createClient> | null> {
	if (!SHOULD_USE_LOCAL_REDIS || localRedisState.unavailable) return null;
	if (localRedisState.client) return localRedisState.client;
	if (localRedisState.connectPromise) return localRedisState.connectPromise;

	const url = REDIS_URL;
	if (!url) return null;

	const client = createClient({ url });
	localRedisState.connectPromise = client
		.connect()
		.then(() => {
			localRedisState.client = client;
			return client;
		})
		.catch((error) => {
			localRedisState.unavailable = true;
			console.warn("[Redis] Failed to connect to local Redis:", error);
			return null;
		})
		.finally(() => {
			localRedisState.connectPromise = null;
		});

	return localRedisState.connectPromise;
}

type RatelimitDecision = {
	success: boolean;
	limit: number;
	remaining: number;
	reset: number;
	pending: Promise<unknown>;
};

type RatelimitLike = {
	limit: (identifier: string) => Promise<RatelimitDecision>;
};

export const upstashRedis =
	SHOULD_USE_UPSTASH_REDIS && UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
		? new Redis({
				url: UPSTASH_REDIS_REST_URL,
				token: UPSTASH_REDIS_REST_TOKEN,
			})
		: null;

export const redisStore = {
	async ping(): Promise<boolean> {
		if (upstashRedis) {
			await upstashRedis.ping();
			return true;
		}

		const local = await getLocalRedisClient();
		if (!local) return false;
		await local.ping();
		return true;
	},
	async set(key: string, value: string, options?: { ex?: number }): Promise<void> {
		if (upstashRedis) {
			if (options?.ex !== undefined) {
				await upstashRedis.set(key, value, { ex: options.ex });
			} else {
				await upstashRedis.set(key, value);
			}
			return;
		}

		const local = await getLocalRedisClient();
		if (!local) return;
		if (options?.ex) {
			await local.set(key, value, { EX: options.ex });
			return;
		}
		await local.set(key, value);
	},
	async get<T = string>(key: string): Promise<T | null> {
		if (upstashRedis) {
			const value = await upstashRedis.get<T>(key);
			return value ?? null;
		}

		const local = await getLocalRedisClient();
		if (!local) return null;
		const value = await local.get(key);
		return parseRedisValue<T>(value);
	},
	async getdel<T = string>(key: string): Promise<T | null> {
		if (upstashRedis) {
			const value = await upstashRedis.getdel<T>(key);
			return value ?? null;
		}

		const local = await getLocalRedisClient();
		if (!local) return null;
		const value = await local.sendCommand(["GETDEL", key]);
		return parseRedisValue<T>(value);
	},
	async del(...keys: string[]): Promise<number> {
		if (keys.length === 0) return 0;
		if (upstashRedis) {
			return await upstashRedis.del(...keys);
		}

		const local = await getLocalRedisClient();
		if (!local) return 0;
		return await local.del(keys);
	},
	async scan(
		cursor: string | number,
		options: { match?: string; count?: number },
	): Promise<[string, Array<string>]> {
		if (upstashRedis) {
			return await upstashRedis.scan(cursor, options);
		}

		const local = await getLocalRedisClient();
		if (!local) return ["0", []];
		const result = await local.scan(String(cursor), {
			MATCH: options.match,
			COUNT: options.count,
		});
		return [result.cursor, result.keys];
	},
	async xadd(key: string, id: string, fields: Record<string, string>): Promise<string | null> {
		if (upstashRedis) {
			return await upstashRedis.xadd(key, id, fields);
		}

		const local = await getLocalRedisClient();
		if (!local) return null;
		const entryId = await local.xAdd(key, id as "*", fields);
		return entryId;
	},
	async xrange(
		key: string,
		start: string,
		end: string,
	): Promise<Record<string, Record<string, string>>> {
		if (upstashRedis) {
			const entries = await upstashRedis.xrange(key, start, end);
			return (entries as Record<string, Record<string, string>>) ?? {};
		}

		const local = await getLocalRedisClient();
		if (!local) return {};
		const entries = await local.xRange(key, start, end);
		const result: Record<string, Record<string, string>> = {};
		for (const entry of entries) {
			result[entry.id] = entry.message;
		}
		return result;
	},
	async expire(key: string, ttlSeconds: number): Promise<void> {
		if (upstashRedis) {
			await upstashRedis.expire(key, ttlSeconds);
			return;
		}

		const local = await getLocalRedisClient();
		if (!local) return;
		await local.expire(key, ttlSeconds);
	},
	async hincrby(key: string, field: string, amount: number): Promise<number> {
		if (upstashRedis) {
			return await upstashRedis.hincrby(key, field, amount);
		}

		const local = await getLocalRedisClient();
		if (!local) return 0;
		return await local.hIncrBy(key, field, amount);
	},
	async hdel(key: string, field: string): Promise<number> {
		if (upstashRedis) {
			return await upstashRedis.hdel(key, field);
		}

		const local = await getLocalRedisClient();
		if (!local) return 0;
		return await local.hDel(key, field);
	},
	async hgetall<T extends Record<string, string>>(key: string): Promise<T | null> {
		if (upstashRedis) {
			const value = await upstashRedis.hgetall<T>(key);
			return value ?? null;
		}

		const local = await getLocalRedisClient();
		if (!local) return null;
		const value = await local.hGetAll(key);
		return (Object.keys(value).length > 0 ? (value as T) : null);
	},
	async incr(key: string): Promise<number> {
		if (upstashRedis) {
			return await upstashRedis.incr(key);
		}

		const local = await getLocalRedisClient();
		if (!local) return 0;
		return await local.incr(key);
	},
};

type MemoryRatelimitEntry = {
	count: number;
	resetAt: number;
};

const memoryRatelimitStore = new Map<string, MemoryRatelimitEntry>();

function createSlidingWindowRatelimit(
	limit: number,
	window: `${number} ${"ms" | "s" | "m" | "h" | "d"}`,
	prefix: string,
): RatelimitLike | null {
	if (upstashRedis) {
		return new Ratelimit({
			redis: upstashRedis,
			limiter: Ratelimit.slidingWindow(limit, window),
			prefix,
		});
	}

	if (!IS_PRODUCTION) {
		const [amount, unit] = window.split(" ") as [string, "ms" | "s" | "m" | "h" | "d"];
		const amountNum = Number.parseInt(amount, 10);
		const multiplier =
			unit === "ms"
				? 1
				: unit === "s"
					? 1_000
					: unit === "m"
						? 60_000
						: unit === "h"
							? 3_600_000
							: 86_400_000;
		const windowMs = Math.max(1, amountNum) * multiplier;

		return {
			limit: async (identifier: string) => {
				const now = Date.now();
				const key = `${prefix}:${identifier}`;
				const existing = memoryRatelimitStore.get(key);
				if (!existing || existing.resetAt <= now) {
					memoryRatelimitStore.set(key, { count: 1, resetAt: now + windowMs });
					return {
						success: true,
						limit,
						remaining: Math.max(0, limit - 1),
						reset: now + windowMs,
						pending: Promise.resolve(),
					};
				}

				existing.count += 1;
				memoryRatelimitStore.set(key, existing);
				return {
					success: existing.count <= limit,
					limit,
					remaining: Math.max(0, limit - existing.count),
					reset: existing.resetAt,
					pending: Promise.resolve(),
				};
			},
		};
}

	if (!upstashRedis) {
		if (!IS_PRODUCTION) return null;
		return {
			limit: async () => ({
				success: false,
				limit: 0,
				remaining: 0,
				reset: Date.now() + 60_000,
				pending: Promise.resolve(),
			}),
		};
	}
	return null;
}

export const chatUserRatelimit = createSlidingWindowRatelimit(30, "60 s", "ratelimit:chat:user");
export const uploadRatelimit = createSlidingWindowRatelimit(20, "60 s", "ratelimit:upload:user");
export const exportRatelimit = createSlidingWindowRatelimit(10, "60 s", "ratelimit:export:user");
export const authRatelimit = createSlidingWindowRatelimit(20, "60 s", "ratelimit:auth:user");

export const workflowClient = QSTASH_URL && QSTASH_TOKEN
	? new WorkflowClient({
			baseUrl: QSTASH_URL,
			token: QSTASH_TOKEN,
		})
	: null;

if (!upstashRedis) {
	if (IS_PRODUCTION) {
		console.error("[Upstash] Redis not configured in production; rate-limited endpoints fail closed");
	} else if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN && !SHOULD_USE_UPSTASH_IN_DEV) {
		console.warn(
			"[Upstash] Redis credentials detected, but Upstash is disabled in dev. " +
				"Set UPSTASH_ENABLE_IN_DEV=true to force-enable, or point UPSTASH_REDIS_REST_URL to localhost.",
		);
	} else {
		console.warn("[Upstash] Redis not configured — using in-memory rate limiting in dev");
	}
}

if (SHOULD_USE_LOCAL_REDIS && REDIS_URL) {
	console.log(`[Redis] Using local Redis backend at ${REDIS_URL}`);
}

if (!workflowClient && IS_PRODUCTION) {
	console.error("[Upstash] QStash not configured in production");
}

export function isUpstashRedisConfigured(): boolean {
	return upstashRedis !== null;
}

export function isQstashConfigured(): boolean {
	return workflowClient !== null;
}

export function shouldFailClosedForMissingUpstash(): boolean {
	return IS_PRODUCTION && upstashRedis === null;
}

export function isRedisConfigured(): boolean {
	return upstashRedis !== null || SHOULD_USE_LOCAL_REDIS;
}
