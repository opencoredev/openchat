import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvFile(content: string): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const equalsIndex = trimmed.indexOf("=");
		if (equalsIndex <= 0) continue;

		const key = trimmed.slice(0, equalsIndex).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

		let value = trimmed.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith("\"") && value.endsWith("\"")) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			const quoteChar = value[0];
			value = value.slice(1, -1);

			// Unescape the matching quote character and backslashes inside quoted values.
			if (quoteChar === "\"") {
				// For double-quoted values, interpret \" as " and \\ as \.
				value = value.replace(/\\(["\\])/g, "$1");
			} else if (quoteChar === "'") {
				// For single-quoted values, interpret \' as ' and \\ as \.
				value = value.replace(/\\(['\\])/g, "$1");
			}
		}

		parsed[key] = value;
	}

	return parsed;
}

function isRedisPingResponse(
	value: unknown,
): value is Array<{ result?: string }> {
	if (!Array.isArray(value)) return false;
	const first = value[0];
	if (first === undefined) return true;
	if (typeof first !== "object" || first === null) return false;
	const result = (first as { result?: unknown }).result;
	return result === undefined || typeof result === "string";
}

function loadLocalEnvDefaults(): void {
	const envFiles = [
		join(process.cwd(), "apps/web/.env.local"),
		join(process.cwd(), "apps/server/.env.local"),
		join(process.cwd(), ".env.local"),
	];

	for (const filePath of envFiles) {
		if (!existsSync(filePath)) continue;
		const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
		for (const [key, value] of Object.entries(parsed)) {
			if (process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	}
}

async function main() {
	loadLocalEnvDefaults();

	const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
	const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

	if (!url || !token) {
		process.stdout.write(
			"[check-redis] UPSTASH_REDIS_REST_URL/TOKEN not set. Redis-backed features are disabled.\n",
		);
		return;
	}

	try {
		const baseUrl = new URL(url);
		// Remove trailing slashes from the pathname to avoid double slashes when appending "/pipeline"
		baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "") || "/";
		const pipelineUrl = new URL("/pipeline", baseUrl);
		const response = await fetch(pipelineUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify([["PING"]]),
			signal: AbortSignal.timeout(5_000),
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`HTTP ${response.status} ${body}`);
		}

		const rawPayload = await response.json();
		if (!isRedisPingResponse(rawPayload)) {
			throw new Error("Unexpected Redis response format");
		}
		const payload = rawPayload;
		const result = payload[0]?.result;
		if (result !== "PONG") {
			throw new Error("Redis ping failed");
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Redis is not reachable at ${url}. ${message}\n`);
		process.stderr.write(
			"Check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.\n",
		);
		const nodeEnv = process.env.NODE_ENV;
		if (nodeEnv !== "development") {
			process.stderr.write(
				"[check-redis] Redis is required for rate limiting in this environment. Failing fast.\n",
			);
			process.exit(1);
		}
		process.stderr.write(
			"[check-redis] Dev mode — continuing without Redis. Rate limiting is disabled.\n",
		);
	}
}

main();
