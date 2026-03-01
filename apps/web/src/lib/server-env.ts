import { ConfigurationError } from "./errors";

function readRaw(key: string): string | undefined {
	const value = process.env[key];
	if (!value) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalUrl(...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = readRaw(key);
		if (!value) continue;
		try {
			new URL(value);
			return value;
		} catch {
			throw new ConfigurationError(`Invalid URL in ${key}`, { key, value });
		}
	}
	return undefined;
}

function readBoolean(key: string, fallback = false): boolean {
	const value = readRaw(key);
	if (!value) return fallback;
	return value === "true";
}

function readNodeEnv(): "development" | "production" | "test" {
	const raw = readRaw("NODE_ENV") ?? "development";
	if (raw === "development" || raw === "production" || raw === "test") {
		return raw;
	}
	throw new ConfigurationError("Invalid NODE_ENV", { value: raw });
}

const nodeEnv = readNodeEnv();
const convexSiteUrl = readOptionalUrl("VITE_CONVEX_SITE_URL", "CONVEX_SITE_URL");
const convexUrl = readOptionalUrl("VITE_CONVEX_URL", "CONVEX_URL");
const vercelUrl = readRaw("VERCEL_URL");
const appUrl = readOptionalUrl("VITE_APP_URL") ?? (vercelUrl ? `https://${vercelUrl}` : undefined);
const upstashRedisRestUrl = readOptionalUrl("UPSTASH_REDIS_REST_URL");
const qstashUrl = readOptionalUrl("QSTASH_URL");
const workflowCleanupToken = readRaw("WORKFLOW_CLEANUP_TOKEN");

export const serverEnv = {
	nodeEnv,
	isProduction: nodeEnv === "production",
	isLocalDev: nodeEnv === "development" || nodeEnv === "test",
	allowAuthCookieFallback: readBoolean("ALLOW_AUTH_COOKIE_FALLBACK", false),
	convexSiteUrl,
	convexUrl,
	trustProxyMode: readRaw("TRUST_PROXY")?.toLowerCase(),
	workflowSigningConfigured: Boolean(
		readRaw("QSTASH_CURRENT_SIGNING_KEY") && readRaw("QSTASH_NEXT_SIGNING_KEY"),
	),
	appUrl,
	openRouterApiKey: readRaw("OPENROUTER_API_KEY"),
	openRouterEncryptionKey: readRaw("OPENROUTER_ENCRYPTION_KEY"),
	upstashRedisRestUrl,
	upstashRedisRestToken: readRaw("UPSTASH_REDIS_REST_TOKEN"),
	qstashUrl,
	qstashToken: readRaw("QSTASH_TOKEN"),
	upstashEnableInDev: readBoolean("UPSTASH_ENABLE_IN_DEV", false),
	redisUrl: readRaw("REDIS_URL"),
	workflowCleanupToken,
} as const;

if (serverEnv.isProduction && serverEnv.allowAuthCookieFallback) {
	throw new ConfigurationError("ALLOW_AUTH_COOKIE_FALLBACK must not be enabled in production");
}
