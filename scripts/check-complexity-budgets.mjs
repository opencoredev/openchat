import { Glob } from "bun";
import { relative } from "node:path";

const ROOT = process.cwd();

const FILE_GLOBS = ["apps/web/src/**/*.{ts,tsx}", "apps/server/convex/**/*.{ts,tsx}"];
const IGNORE_SEGMENTS = ["/__tests__/", "/_generated/"];
const IGNORE_SUFFIXES = [".test.ts", ".test.tsx", ".gen.ts"];

const MAX_FILE_LINES = 700;
const MAX_FUNCTION_LINES = 120;
const MAX_CYCLOMATIC = 20;

const EXPLICIT_EXCEPTIONS = new Set([
	"apps/web/src/components/ui/sidebar.tsx",
	"apps/web/src/routes/terms.tsx",
	"apps/web/src/routes/privacy.tsx",
	"apps/web/src/routes/api/workflow/delete-account.ts",
	"apps/web/src/routes/api/workflow/generate-title.ts",
	"apps/web/src/routes/auth/sign-in.tsx",
	"apps/web/src/routes/openrouter/callback.tsx",
	"apps/web/src/hooks/use-edit-retry-message.ts",
	"apps/web/src/components/chat/chat-message-list.tsx",
	"apps/web/src/components/settings/settings-shortcuts.tsx",
	"apps/web/src/components/settings/settings-providers.tsx",
	"apps/web/src/components/settings/settings-chat.tsx",
	"apps/web/src/components/settings/settings-models.tsx",
	"apps/web/src/stores/openrouter.ts",
	"apps/server/convex/streamExecution.ts",
	"apps/server/convex/userAuth.ts",
]);

const FUNCTION_START_PATTERN = /(?:async\s+)?function(?:\s+\w+)?\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>\s*\{|\b[A-Za-z_$][\w$]*\s*=>\s*\{/g;
const BRANCH_PATTERN = /\b(?:if|else\s+if|for|while|case|catch)\b|&&|\|\||\?/g;

function skip(path) {
	if (IGNORE_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
		return true;
	}
	return IGNORE_SEGMENTS.some((segment) => path.includes(segment));
}

function lineCount(text) {
	if (text.length === 0) return 0;
	return text.split("\n").length;
}

function analyzeFunctions(text) {
	const findings = [];
	for (const match of text.matchAll(FUNCTION_START_PATTERN)) {
		const start = match.index ?? 0;
		let depth = 0;
		let end = start;
		let foundBody = false;
		for (let i = start; i < text.length; i++) {
			const ch = text[i];
			if (ch === "{") {
				depth += 1;
				foundBody = true;
			}
			if (ch === "}") {
				depth -= 1;
				if (foundBody && depth === 0) {
					end = i;
					break;
				}
			}
		}

		const block = text.slice(start, end + 1);
		const lines = lineCount(block);
		const cyclomatic = 1 + Array.from(block.matchAll(BRANCH_PATTERN)).length;
		findings.push({ start, lines, cyclomatic });
	}
	return findings;
}

async function main() {
	const violations = [];

	for (const fileGlob of FILE_GLOBS) {
		for await (const file of new Glob(fileGlob).scan(ROOT)) {
			if (skip(file)) continue;

			const content = await Bun.file(file).text();
			const totalLines = lineCount(content);
			const isException = EXPLICIT_EXCEPTIONS.has(file);

			if (totalLines > MAX_FILE_LINES && !isException) {
				violations.push(`file-lines ${relative(ROOT, file)} (${totalLines} > ${MAX_FILE_LINES})`);
			}

			if (!isException) {
				const functions = analyzeFunctions(content);
				for (const fn of functions) {
					if (fn.lines > MAX_FUNCTION_LINES) {
						violations.push(
							`function-lines ${relative(ROOT, file)}@${fn.start} (${fn.lines} > ${MAX_FUNCTION_LINES})`,
						);
					}
					if (fn.cyclomatic > MAX_CYCLOMATIC) {
						violations.push(
							`cyclomatic ${relative(ROOT, file)}@${fn.start} (${fn.cyclomatic} > ${MAX_CYCLOMATIC})`,
						);
					}
				}
			}
		}
	}

	if (violations.length > 0) {
		console.error("Complexity budget violations:");
		for (const violation of violations) {
			console.error(`- ${violation}`);
		}
		process.exit(1);
	}

	console.log("Complexity budgets passed.");
}

await main();
