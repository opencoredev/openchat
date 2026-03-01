import { Glob } from "bun";
import { relative } from "node:path";

const ROOT = process.cwd();
const FILE_GLOBS = ["apps/web/src/**/*.{ts,tsx}", "apps/server/convex/**/*.{ts,tsx}"];
const IGNORE_SEGMENTS = ["/__tests__/", "/_generated/", "/migrations/"];
const IGNORE_SUFFIXES = [".test.ts", ".test.tsx", ".gen.ts"];

const ALLOWED_CONSOLE_FILES = new Set([
	"apps/web/src/lib/runtime-logger.ts",
	"apps/server/convex/lib/logger.ts",
	"apps/server/convex/migrations.ts",
]);

function shouldSkipFile(path) {
	if (IGNORE_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
		return true;
	}
	return IGNORE_SEGMENTS.some((segment) => path.includes(segment));
}

function collectMatches(text, pattern) {
	return Array.from(text.matchAll(pattern), (match) => match[0]);
}

async function main() {
	const violations = [];

	for (const fileGlob of FILE_GLOBS) {
		for await (const file of new Glob(fileGlob).scan(ROOT)) {
			if (shouldSkipFile(file)) {
				continue;
			}

			const content = await Bun.file(file).text();

			for (const match of collectMatches(content, /\bas any\b|as unknown as/g)) {
				violations.push({ rule: "no-cast-crutches", file, match });
			}

			for (const match of collectMatches(content, /catch\s*\([^)]*\)\s*\{\s*\}/g)) {
				violations.push({ rule: "no-empty-catch", file, match });
			}

			for (const match of collectMatches(content, /\.catch\s*\(\s*\(\s*[^)]*\s*\)\s*=>\s*\{\s*\}\s*\)/g)) {
				violations.push({ rule: "no-empty-catch", file, match });
			}

			if (!ALLOWED_CONSOLE_FILES.has(file)) {
				for (const match of collectMatches(content, /\bconsole\.(?:log|warn|error|debug|info)\s*\(/g)) {
					violations.push({ rule: "no-runtime-console", file, match });
				}
			}
		}
	}

	if (violations.length === 0) {
		console.log("Runtime policy checks passed.");
		return;
	}

	console.error("Runtime policy violations detected:");
	for (const violation of violations) {
		console.error(`- ${violation.rule} in ${relative(ROOT, violation.file)}: ${violation.match}`);
	}

	process.exit(1);
}

await main();
