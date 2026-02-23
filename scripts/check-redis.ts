import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
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
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}

	return parsed;
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

function isLocalUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

async function main() {
	loadLocalEnvDefaults();
	const isProduction = process.env.NODE_ENV === "production";

	const localRedisUrl =
		process.env.REDIS_URL?.trim() || (!isProduction ? "redis://127.0.0.1:6379" : undefined);
	if (localRedisUrl) {
		try {
			const parsed = new URL(localRedisUrl);
			const host = parsed.hostname;
			const port = Number.parseInt(parsed.port || "6379", 10);
			await new Promise<void>((resolve, reject) => {
				const socket = net.createConnection({ host, port }, () => {
					socket.end();
					resolve();
				});
				socket.setTimeout(1_500);
				socket.once("timeout", () => {
					socket.destroy();
					reject(new Error("connection timeout"));
				});
				socket.once("error", (error) => {
					socket.destroy();
					reject(error);
				});
			});
			process.stdout.write(`[check-redis] Local Redis reachable at ${localRedisUrl}.\n`);
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`[check-redis] Local Redis is not reachable at ${localRedisUrl}. ${message}\n`);
			if (isProduction) {
				process.exit(1);
			}
			process.stderr.write("[check-redis] Dev mode — continuing without local Redis backend.\n");
		}
	}

	const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
	const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
	const forceUpstashInDev = process.env.UPSTASH_ENABLE_IN_DEV?.trim().toLowerCase() === "true";

	if (!isProduction && url && token && !forceUpstashInDev && !isLocalUrl(url)) {
		process.stdout.write(
			"[check-redis] Upstash check skipped in dev for non-local URL. " +
				"Set UPSTASH_ENABLE_IN_DEV=true to force-enable or use localhost URL.\n",
		);
		return;
	}

	if (!url || !token) {
		process.stdout.write(
			"[check-redis] UPSTASH_REDIS_REST_URL/TOKEN not set. Redis-backed features are disabled.\n",
		);
		return;
	}

	try {
		const normalizedUrl = url.replace(/\/+$/, "");
		const response = await fetch(`${normalizedUrl}/pipeline`, {
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

		const payload = (await response.json()) as Array<{ result?: string }>;
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
		if (isProduction) {
			process.exit(1);
		}
		process.stderr.write("[check-redis] Dev mode — continuing without Redis. Rate limiting is disabled.\n");
	}
}

main();
