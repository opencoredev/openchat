import { execFileSync } from "node:child_process";

function log(message: string) {
	console.log(`[vercel-build] ${message}`);
}

function run(
	command: string,
	args: string[],
	options?: {
		cwd?: string;
		env?: Record<string, string | undefined>;
	}
) {
	execFileSync(command, args, {
		cwd: options?.cwd,
		env: {
			...process.env,
			...options?.env,
		},
		stdio: "inherit",
	});
}

// Production: build with the production Convex URL.
// VITE_CONVEX_URL should be set in the Vercel project's production env vars.
// Fall back to the known production deployment URL if not explicitly set.
if (process.env.VERCEL_ENV === "production") {
	const prodConvexUrl =
		process.env.VITE_CONVEX_URL ?? "https://outgoing-setter-201.convex.cloud";
	const prodConvexSiteUrl =
		process.env.VITE_CONVEX_SITE_URL ??
		prodConvexUrl.replace(/\.convex\.cloud$/, ".convex.site");

	log("Production build detected.");
	log(`  VITE_CONVEX_URL      = ${prodConvexUrl}`);
	log(`  VITE_CONVEX_SITE_URL = ${prodConvexSiteUrl}`);

	run("bun", ["run", "build"], {
		env: {
			VITE_CONVEX_URL: prodConvexUrl,
			VITE_CONVEX_SITE_URL: prodConvexSiteUrl,
		},
	});
	process.exit(0);
}

// Preview: VITE_CONVEX_URL must be pre-set by GitHub Actions (preview-deploy.yml).
//
// We must NOT call `convex deploy --preview-create` here because:
// - GH Actions also calls it for the same PR
// - Both runs create *different* Convex deployments (new random name each time)
// - Each then tries to fetch config from the *other's* URL → 404 race condition
//
// The correct flow:
//   1. GH Actions deploys Convex → gets URL
//   2. GH Actions sets VITE_CONVEX_URL as branch-scoped Vercel env var
//   3. GH Actions triggers Vercel redeploy
//   4. This script reads VITE_CONVEX_URL and just runs `bun run build`

const convexUrl = process.env.VITE_CONVEX_URL;

if (!convexUrl) {
	log("❌ VITE_CONVEX_URL is not set.");
	log("   GitHub Actions (preview-deploy.yml) must deploy Convex preview first,");
	log("   set VITE_CONVEX_URL as a branch-scoped Vercel env var, then trigger");
	log("   a Vercel redeploy. That redeploy will succeed with the URL pre-set.");
	process.exit(1);
}

// Derive VITE_CONVEX_SITE_URL from VITE_CONVEX_URL if not explicitly set
const convexSiteUrl =
	process.env.VITE_CONVEX_SITE_URL ??
	convexUrl.replace(/\.convex\.cloud$/, ".convex.site");

log(`Preview build using:`);
log(`  VITE_CONVEX_URL      = ${convexUrl}`);
log(`  VITE_CONVEX_SITE_URL = ${convexSiteUrl}`);

run("bun", ["run", "build"], {
	env: {
		VITE_CONVEX_URL: convexUrl,
		VITE_CONVEX_SITE_URL: convexSiteUrl,
	},
});

log("Preview build completed.");
