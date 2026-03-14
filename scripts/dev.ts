type ExitCode = number | null;
const WEB_PACKAGE_JSON_PATH = "./apps/web/package.json";
const EXPECTED_WEB_DEV_SCRIPT =
	"BROWSERSLIST_IGNORE_OLD_DATA=true BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA=true sh -c 'portless \"${PORTLESS_NAME:-openchat}\" vite dev'";

declare const Bun: {
	spawn(options: {
		cmd: string[];
		env: NodeJS.ProcessEnv;
		stdio: ["inherit", "inherit", "inherit"];
	}): { exited: Promise<ExitCode> };
	spawnSync(options: {
		cmd: string[];
		cwd?: string;
		stdin?: "ignore";
		stderr?: "ignore";
	}): { success: boolean; stdout: Uint8Array };
};

function sanitizeNodeOptions(nodeOptions: string | undefined): string | undefined {
	if (!nodeOptions) return nodeOptions;

	const tokens = nodeOptions.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
	const sanitized: string[] = [];

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token === "--localstorage-file") {
			index += 1;
			continue;
		}
		if (token.startsWith("--localstorage-file=")) {
			continue;
		}
		sanitized.push(token);
	}

	return sanitized.join(" ").trim();
}

function normalizePortlessSegment(value: string | undefined): string | undefined {
	if (!value) return undefined;

	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return normalized || undefined;
}

function getPortlessName(): string {
	const explicit =
		normalizePortlessSegment(process.env.PORTLESS_NAME)
		?? normalizePortlessSegment(process.env.PORTLESS_PROJECT_NAME)
		?? normalizePortlessSegment(process.env.PORTLESS_APP_NAME);
	if (explicit) return explicit;

	return normalizePortlessSegment(process.env.PORTLESS_BASE_NAME) ?? "openchat";
}

async function run(command: string[], env: NodeJS.ProcessEnv): Promise<ExitCode> {
	const process = Bun.spawn({
		cmd: command,
		env,
		stdio: ["inherit", "inherit", "inherit"],
	});
	return process.exited;
}

async function ensureWebDevScript(): Promise<void> {
	let rawPackage = "";
	try {
		rawPackage = await Bun.file(WEB_PACKAGE_JSON_PATH).text();
	} catch {
		return;
	}

	if (!rawPackage.trim()) return;

	let parsed: { scripts?: Record<string, string> };
	try {
		parsed = JSON.parse(rawPackage) as { scripts?: Record<string, string> };
	} catch {
		return;
	}

	if (parsed.scripts?.dev === EXPECTED_WEB_DEV_SCRIPT) {
		return;
	}

	const updated = {
		...parsed,
		scripts: {
			...parsed.scripts,
			dev: EXPECTED_WEB_DEV_SCRIPT,
		},
	};

	await Bun.write(WEB_PACKAGE_JSON_PATH, `${JSON.stringify(updated, null, 2)}\n`);
}

const env: NodeJS.ProcessEnv = {
	...process.env,
	BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA:
		process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ?? "true",
	BROWSERSLIST_IGNORE_OLD_DATA: process.env.BROWSERSLIST_IGNORE_OLD_DATA ?? "true",
	NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
};

const portlessName = getPortlessName();
env.PORTLESS_NAME = process.env.PORTLESS_NAME ?? portlessName;
env.PORTLESS_ORIGIN = process.env.PORTLESS_ORIGIN ?? `http://${portlessName}.localhost:1355`;

const sanitizedNodeOptions = sanitizeNodeOptions(process.env.NODE_OPTIONS);
env.NODE_OPTIONS = [sanitizedNodeOptions, "--disable-warning=localstorage-file"]
	.filter((value) => value && value.length > 0)
	.join(" ");

await ensureWebDevScript();

const checkRedisExit = await run(["bun", "./scripts/check-redis.ts"], env);
if (checkRedisExit !== 0 && process.env.NODE_ENV === "production") {
	process.exit(checkRedisExit ?? 1);
}

const devExit = await run(["bunx", "turbo", "-F", "web", "-F", "server", "dev"], env);
process.exit(devExit ?? 1);

export {};
